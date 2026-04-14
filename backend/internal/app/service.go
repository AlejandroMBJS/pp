package app

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
	"unicode"

	"github.com/google/generative-ai-go/genai"
	"google.golang.org/api/option"
)

func (s *Service) PublicDemo(ctx context.Context) DemoPayload {
	return DemoPayload{
		Product:        "ProjectPulse",
		Message:        "Request a demo workspace at /demo — we'll email you temporary credentials valid for 72 hours.",
		DemoAccounts:   []DemoAccount{},
		SuggestedFlow:  []string{"Request a demo at /demo", "Check your inbox for credentials", "Log in and explore for 72 hours"},
		GeneratedAtUTC: time.Now().UTC(),
	}
}

func (s *Service) RegisterCompanyOwner(ctx context.Context, companyName, companySlug, ownerName, ownerEmail, password string) (LoginResponse, error) {
	companyName = strings.TrimSpace(companyName)
	companySlug = strings.ToLower(strings.TrimSpace(companySlug))
	ownerName = strings.TrimSpace(ownerName)
	ownerEmail = strings.TrimSpace(strings.ToLower(ownerEmail))
	if err := validateRegistration(companyName, companySlug, ownerName, ownerEmail, password); err != nil {
		return LoginResponse{}, err
	}
	passwordHash, err := HashPassword(password)
	if err != nil {
		return LoginResponse{}, err
	}
	tenant := Tenant{ID: newID("ten"), Name: companyName, Slug: companySlug}
	user := User{ID: newID("usr"), TenantID: tenant.ID, Email: ownerEmail, FullName: ownerName, Role: RoleOwner}
	now := nowText()

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return LoginResponse{}, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `INSERT INTO tenants (id, name, slug, created_at) VALUES ($1, $2, $3, $4)`, tenant.ID, tenant.Name, tenant.Slug, now); err != nil {
		return LoginResponse{}, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO users (id, tenant_id, email, password_hash, full_name, role, email_verified, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, user.ID, user.TenantID, user.Email, passwordHash, user.FullName, user.Role, 0, now); err != nil {
		return LoginResponse{}, err
	}
	// Generate verification token — cryptographically random, 32 bytes.
	verifyToken, err := GenerateSecureToken(32)
	if err != nil {
		return LoginResponse{}, err
	}
	verification := Verification{
		ID:        newID("ver"),
		TenantID:  tenant.ID,
		UserID:    user.ID,
		Type:      "email_verification",
		Token:     verifyToken,
		ExpiresAt: time.Now().Add(24 * time.Hour).Format(time.RFC3339),
		CreatedAt: now,
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO verifications (id, tenant_id, user_id, type, token, expires_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`, verification.ID, verification.TenantID, verification.UserID, verification.Type, verification.Token, verification.ExpiresAt, verification.CreatedAt); err != nil {
		return LoginResponse{}, err
	}
	// 14-day trial subscription seeded at signup (no card required, industry standard).
	trialEnd := time.Now().Add(14 * 24 * time.Hour)
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO subscriptions (id, tenant_id, plan, status, trial_ends_at) VALUES ($1, $2, 'starter', 'trialing', $3)`,
		newID("sub"), tenant.ID, trialEnd,
	); err != nil {
		return LoginResponse{}, err
	}
	if err := tx.Commit(); err != nil {
		s.logger.Error("failed to commit registration", "email", user.Email, "error", err)
		return LoginResponse{}, err
	}
	s.logger.Info("user registered", "email", user.Email, "user_id", user.ID, "tenant_id", tenant.ID)

	// Send verification email (async)
	go func() {
		_ = s.mailer.Send(context.Background(), user.Email, "Verify your ArquiCheck account", fmt.Sprintf("Welcome %s! Please verify your account using token: %s", user.FullName, verification.Token))
	}()

	token, err := IssueToken(s.jwtSecret, user)
	if err != nil {
		return LoginResponse{}, err
	}
	return LoginResponse{AccessToken: token, User: user}, nil
}

func (s *Service) Login(ctx context.Context, email, password string) (LoginResponse, error) {
	email = strings.TrimSpace(strings.ToLower(email))
	row := s.db.QueryRowContext(ctx, `SELECT id, tenant_id, email, password_hash, full_name, role, email_verified FROM users WHERE email = $1`, email)
	var user User
	var passwordHash string
	if err := row.Scan(&user.ID, &user.TenantID, &user.Email, &passwordHash, &user.FullName, &user.Role, &user.EmailVerified); err != nil {
		return LoginResponse{}, errors.New("invalid credentials")
	}
	if err := ComparePassword(passwordHash, password); err != nil {
		s.logger.Warn("invalid login attempt", "email", email)
		return LoginResponse{}, errors.New("invalid credentials")
	}
	s.logger.Info("user logged in", "email", user.Email, "user_id", user.ID)
	token, err := IssueToken(s.jwtSecret, user)
	if err != nil {
		return LoginResponse{}, err
	}
	return LoginResponse{AccessToken: token, User: user}, nil
}

func (s *Service) VerifyEmail(ctx context.Context, token string) (bool, error) {
	var userID, tenantID, expiresAt string
	err := s.db.QueryRowContext(ctx, `SELECT user_id, tenant_id, expires_at FROM verifications WHERE token = $1 AND type = 'email_verification'`, token).Scan(&userID, &tenantID, &expiresAt)
	if err != nil {
		return false, errors.New("invalid or expired token")
	}
	if time.Now().UTC().After(parseTime(expiresAt)) {
		return false, errors.New("token expired")
	}
	// Mark user as verified
	if _, err := s.db.ExecContext(ctx, `UPDATE users SET email_verified = true WHERE id = $1`, userID); err != nil {
		s.logger.Error("failed to set email_verified", "user_id", userID, "error", err)
		return false, err
	}
	s.logger.Info("email verified", "user_id", userID, "tenant_id", tenantID)
	// Delete token
	_, _ = s.db.ExecContext(ctx, `DELETE FROM verifications WHERE token = $1`, token)
	return true, nil
}

func validateInviteRole(role string) error {
	if role == RoleAdmin || role == RoleOwner {
		return errors.New("cannot create this role from owner flow")
	}
	if role != RoleSupervisor && role != RoleHelper && role != RoleClient {
		return errors.New("invalid role")
	}
	return nil
}

func validateAccountSetupPassword(password string) error {
	if len(password) < 12 {
		return errors.New("password must be at least 12 characters")
	}
	var hasUpper, hasLower, hasDigit bool
	for _, char := range password {
		switch {
		case unicode.IsUpper(char):
			hasUpper = true
		case unicode.IsLower(char):
			hasLower = true
		case unicode.IsDigit(char):
			hasDigit = true
		}
	}
	if !hasUpper || !hasLower || !hasDigit {
		return errors.New("password must include uppercase, lowercase, and numeric characters")
	}
	return nil
}

func (s *Service) createUserRecord(ctx context.Context, actor Claims, fullName, email, passwordHash, role string) (User, error) {
	user := User{
		ID:       newID("usr"),
		TenantID: actor.TenantID,
		Email:    email,
		FullName: fullName,
		Role:     role,
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO users (id, tenant_id, email, password_hash, full_name, role, email_verified, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, user.ID, user.TenantID, user.Email, passwordHash, user.FullName, user.Role, 0, nowText())
	if err == nil {
		s.logger.Info("user.created", "actor_id", actor.UserID, "tenant_id", actor.TenantID, "user_id", user.ID, "role", role, "email", email)
	}
	return user, err
}

func (s *Service) inviteURLForToken(token string) string {
	baseURL := strings.TrimSuffix(s.cfg.PublicBase, "/")
	if baseURL == "" {
		baseURL = "http://localhost:1212"
	}
	return fmt.Sprintf("%s/?invite=%s", baseURL, url.QueryEscape(token))
}

func (s *Service) InviteUser(ctx context.Context, actor Claims, fullName, email, role string) (UserInviteResponse, error) {
	if s.permissionEffect(ctx, actor.Role, "user.manage") != "allow" {
		return UserInviteResponse{}, errors.New("forbidden")
	}
	if err := s.RequireWriteAccess(ctx, actor.TenantID); err != nil {
		return UserInviteResponse{}, err
	}
	if err := s.CheckUserQuota(ctx, actor.TenantID, role); err != nil {
		return UserInviteResponse{}, err
	}
	fullName = strings.TrimSpace(fullName)
	email = strings.TrimSpace(strings.ToLower(email))
	role = strings.TrimSpace(role)
	if fullName == "" || email == "" || role == "" {
		return UserInviteResponse{}, errors.New("missing required fields")
	}
	if err := validateInviteRole(role); err != nil {
		return UserInviteResponse{}, err
	}

	placeholderSecret, err := GenerateSecureToken(32)
	if err != nil {
		return UserInviteResponse{}, err
	}
	passwordHash, err := HashPassword(placeholderSecret)
	if err != nil {
		return UserInviteResponse{}, err
	}
	user, err := s.createUserRecord(ctx, actor, fullName, email, passwordHash, role)
	if err != nil {
		return UserInviteResponse{}, err
	}

	inviteToken, err := GenerateSecureToken(32)
	if err != nil {
		return UserInviteResponse{}, err
	}
	expiresAt := time.Now().UTC().Add(72 * time.Hour).Format(time.RFC3339)
	_, _ = s.db.ExecContext(ctx, `DELETE FROM verifications WHERE user_id = $1 AND type = 'account_setup'`, user.ID)
	if _, err := s.db.ExecContext(ctx, `INSERT INTO verifications (id, tenant_id, user_id, type, token, expires_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`, newID("ver"), user.TenantID, user.ID, "account_setup", inviteToken, expiresAt, nowText()); err != nil {
		return UserInviteResponse{}, err
	}

	inviteURL := s.inviteURLForToken(inviteToken)
	go func() {
		_ = s.mailer.Send(context.Background(), user.Email, "ProjectPulse account setup", fmt.Sprintf("Hello %s,\n\nYou have been invited to ProjectPulse as %s.\nSet your password and activate your account here:\n%s\n\nThis link expires on %s UTC.", user.FullName, user.Role, inviteURL, expiresAt))
	}()

	return UserInviteResponse{
		User:            user,
		InviteURL:       inviteURL,
		InviteExpiresAt: expiresAt,
	}, nil
}

func (s *Service) CompleteAccountSetup(ctx context.Context, token, password string) (LoginResponse, error) {
	token = strings.TrimSpace(token)
	password = strings.TrimSpace(password)
	if token == "" || password == "" {
		return LoginResponse{}, errors.New("missing required fields")
	}
	if err := validateAccountSetupPassword(password); err != nil {
		return LoginResponse{}, err
	}

	var userID, tenantID, expiresAt string
	if err := s.db.QueryRowContext(ctx, `SELECT user_id, tenant_id, expires_at FROM verifications WHERE token = $1 AND type = 'account_setup'`, token).Scan(&userID, &tenantID, &expiresAt); err != nil {
		return LoginResponse{}, errors.New("invalid or expired invite")
	}
	if time.Now().UTC().After(parseTime(expiresAt)) {
		return LoginResponse{}, errors.New("invite expired")
	}

	passwordHash, err := HashPassword(password)
	if err != nil {
		return LoginResponse{}, err
	}
	if _, err := s.db.ExecContext(ctx, `UPDATE users SET password_hash = $1, email_verified = true WHERE id = $2`, passwordHash, userID); err != nil {
		return LoginResponse{}, err
	}
	_, _ = s.db.ExecContext(ctx, `DELETE FROM verifications WHERE user_id = $1 AND type IN ('account_setup', 'email_verification')`, userID)

	user, err := s.UserByID(ctx, userID)
	if err != nil {
		return LoginResponse{}, err
	}
	user.EmailVerified = true
	tokenValue, err := IssueToken(s.jwtSecret, user)
	if err != nil {
		return LoginResponse{}, err
	}
	s.logger.Info("account setup completed", "user_id", user.ID, "tenant_id", tenantID)
	return LoginResponse{AccessToken: tokenValue, User: user}, nil
}

func (s *Service) RegisterBlueprint(ctx context.Context, actor Claims, sessionID string) (Blueprint, error) {
	var tenantID, projectID, userID, fileName, contentType, localPath, status string
	var intendedSize int64

	err := s.db.QueryRowContext(ctx, `SELECT tenant_id, project_id, requested_by_user_id, file_name, content_type, intended_size_bytes, local_path, status FROM upload_sessions WHERE id = $1`, sessionID).
		Scan(&tenantID, &projectID, &userID, &fileName, &contentType, &intendedSize, &localPath, &status)
	if err != nil {
		return Blueprint{}, err
	}
	if status != "uploaded" || localPath == "" {
		return Blueprint{}, errors.New("upload not completed")
	}
	if err := s.CheckBlueprintQuota(ctx, tenantID); err != nil {
		return Blueprint{}, err
	}
	project, err := s.projectByID(ctx, projectID)
	if err != nil {
		return Blueprint{}, err
	}
	if err := s.ensureProjectAccess(ctx, actor, project); err != nil {
		return Blueprint{}, err
	}
	metadataJSON, err := json.Marshal(map[string]string{
		"upload_session_id": sessionID,
		"object_path":       localPath,
	})
	if err != nil {
		return Blueprint{}, err
	}

	bp := Blueprint{
		ID:               newID("pln"),
		TenantID:         tenantID,
		ProjectID:        projectID,
		UploadedByUserID: userID,
		FileName:         fileName,
		FileType:         strings.TrimPrefix(strings.ToLower(fileExtension(fileName)), "."),
		FileSizeBytes:    intendedSize,
		URLArchivo:       "",
		Status:           "active",
		Scale:            "1:50",
		Version:          1,
		MetadataJSON:     string(metadataJSON),
		CreatedAt:        nowText(),
	}
	bp.URLArchivo = "/api/v1/blueprints/" + bp.ID + "/file"

	// Convert CAD to DXF in the background for the vector viewer
	if bp.FileType == "dwg" || bp.FileType == "dxf" {
		go func(id, path, fType string) {
			s.convertCadToPreview(id, path, fType)
		}(bp.ID, localPath, bp.FileType)

		bp.URLPreview = "/api/v1/blueprints/" + bp.ID + "/preview"
	} else if bp.FileType == "pdf" || bp.FileType == "glb" {
		bp.URLPreview = "/api/v1/blueprints/" + bp.ID + "/preview"
	}

	_, err = s.db.ExecContext(ctx, `INSERT INTO blueprints (id, tenant_id, project_id, uploaded_by_user_id, file_name, file_type, file_size_bytes, url_archivo, url_preview, status, scale, version, metadata_json, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`, bp.ID, bp.TenantID, bp.ProjectID, bp.UploadedByUserID, bp.FileName, bp.FileType, bp.FileSizeBytes, bp.URLArchivo, bp.URLPreview, bp.Status, bp.Scale, bp.Version, bp.MetadataJSON, bp.CreatedAt)
	if err != nil {
		return Blueprint{}, err
	}
	return bp, nil
}

func (s *Service) BlueprintPreview(ctx context.Context, actor Claims, blueprintID string) (io.ReadCloser, string, string, error) {
	var blueprint Blueprint
	err := s.db.QueryRowContext(ctx, `SELECT id, tenant_id, project_id, uploaded_by_user_id, file_name, file_type, file_size_bytes, url_archivo, url_preview, status, scale, version, metadata_json, created_at FROM blueprints WHERE id = $1`, blueprintID).
		Scan(&blueprint.ID, &blueprint.TenantID, &blueprint.ProjectID, &blueprint.UploadedByUserID, &blueprint.FileName, &blueprint.FileType, &blueprint.FileSizeBytes, &blueprint.URLArchivo, &blueprint.URLPreview, &blueprint.Status, &blueprint.Scale, &blueprint.Version, &blueprint.MetadataJSON, &blueprint.CreatedAt)
	if err != nil {
		return nil, "", "", err
	}
	project, err := s.projectByID(ctx, blueprint.ProjectID)
	if err != nil {
		return nil, "", "", err
	}
	if err := s.ensureProjectAccess(ctx, actor, project); err != nil {
		return nil, "", "", err
	}

	if blueprint.FileType == "pdf" || blueprint.FileType == "glb" {
		return s.BlueprintFile(ctx, actor, blueprintID)
	}

	// For CAD files, look for the generated DXF preview
	previewPath := filepath.Join(s.cfg.UploadDir, "previews", blueprint.ID+".dxf")
	if _, err := os.Stat(previewPath); err == nil {
		f, err := os.Open(previewPath)
		if err != nil {
			return nil, "", "", err
		}
		return f, "image/vnd.dxf", blueprint.ID + ".dxf", nil
	}

	// Fallback to test image
	previewPath = filepath.Join("test_assets", "test_image.png")
	if _, err := os.Stat(previewPath); err != nil {
		return nil, "", "", errors.New("preview not available")
	}

	f, err := os.Open(previewPath)
	if err != nil {
		return nil, "", "", err
	}
	return f, "image/png", "preview.png", nil
}

// convertCadToPreview converts DWG → DXF or copies DXF as-is.
// For DWG: tries dwg2dxf (libredwg) first, then falls back to ezdxf Python script.
func (s *Service) convertCadToPreview(blueprintID, inputLocalPath, fileType string) {
	s.logger.Info("starting cad conversion", "id", blueprintID, "type", fileType)

	previewsDir := filepath.Join(s.cfg.UploadDir, "previews")
	_ = os.MkdirAll(previewsDir, 0755)

	finalDxfPath := filepath.Join(previewsDir, blueprintID+".dxf")

	// rawDxfPath holds the intermediate full DXF before flattening.
	rawDxfPath := finalDxfPath + ".raw.dxf"

	if fileType == "dwg" {
		// First try dwg2dxf from libredwg-tools (handles true binary DWG files).
		tmpDir, err := os.MkdirTemp("", "dwg2dxf-*")
		if err == nil {
			defer os.RemoveAll(tmpDir)
			cmd := exec.Command("dwg2dxf", "-o", filepath.Join(tmpDir, "out.dxf"), inputLocalPath)
			output, err := cmd.CombinedOutput()
			if err == nil {
				if data, readErr := os.ReadFile(filepath.Join(tmpDir, "out.dxf")); readErr == nil {
					if writeErr := os.WriteFile(rawDxfPath, data, 0644); writeErr == nil {
						s.logger.Info("dwg2dxf conversion ok", "id", blueprintID)
					}
				}
			}
			if _, statErr := os.Stat(rawDxfPath); statErr != nil {
				s.logger.Warn("dwg2dxf failed, trying ezdxf fallback", "output", strings.TrimSpace(string(output)))
			}
		}

		// Fallback: ezdxf Python script.
		if _, statErr := os.Stat(rawDxfPath); statErr != nil {
			scriptPath := "/app/dwg_to_dxf.py"
			if _, err := os.Stat(scriptPath); err != nil {
				scriptPath = filepath.Join(filepath.Dir(inputLocalPath), "..", "..", "internal", "app", "dwg_to_dxf.py")
			}
			cmd := exec.Command("python3", scriptPath, inputLocalPath, rawDxfPath)
			output, err := cmd.CombinedOutput()
			if err != nil {
				s.logger.Error("dwg conversion failed (both methods)", "error", err, "output", string(output))
				return
			}
			s.logger.Info("ezdxf conversion ok", "output", strings.TrimSpace(string(output)))
		}
	} else if fileType == "dxf" {
		input, err := os.ReadFile(inputLocalPath)
		if err != nil {
			s.logger.Error("dxf read failed", "error", err)
			return
		}
		_ = os.WriteFile(rawDxfPath, input, 0644)
	}

	// Flatten the DXF: explode INSERT block references into primitives so the
	// browser receives a compact DXF with only LINE/ARC/CIRCLE/LWPOLYLINE/SPLINE.
	// This converts a ~100 MB DXF (heavy BLOCKS section) to a few-MB flat file.
	flattenScript := "/app/flatten_dxf.py"
	if _, err := os.Stat(flattenScript); err != nil {
		// dev fallback
		flattenScript = filepath.Join(filepath.Dir(inputLocalPath), "..", "..", "internal", "app", "flatten_dxf.py")
	}
	if _, err := os.Stat(flattenScript); err == nil {
		cmd := exec.Command("python3", flattenScript, rawDxfPath, finalDxfPath)
		output, err := cmd.CombinedOutput()
		_ = os.Remove(rawDxfPath)
		if err != nil {
			s.logger.Warn("flatten failed, using raw dxf", "error", err, "output", strings.TrimSpace(string(output)))
			// Fall back to raw DXF
			if data, readErr := os.ReadFile(rawDxfPath); readErr == nil {
				_ = os.WriteFile(finalDxfPath, data, 0644)
			}
		} else {
			s.logger.Info("flatten ok", "id", blueprintID, "output", string(output))
		}
	} else {
		// No flatten script — just rename raw to final
		_ = os.Rename(rawDxfPath, finalDxfPath)
	}

	s.logger.Info("cad conversion finished", "id", blueprintID, "output", finalDxfPath)
}

func (s *Service) ConvertDwgToDxf(ctx context.Context, r io.Reader) ([]byte, error) {
	tmpFile, err := os.CreateTemp("", "upload-*.dwg")
	if err != nil {
		return nil, err
	}
	defer os.Remove(tmpFile.Name())

	if _, err := io.Copy(tmpFile, r); err != nil {
		return nil, err
	}
	tmpFile.Close()

	outDxf := tmpFile.Name() + ".dxf"
	defer os.Remove(outDxf)

	// Try ODA File Converter first (best for binary DWG)
	scriptPath := "/app/scripts/convert-dwg.sh"
	if _, err := os.Stat(scriptPath); err == nil {
		cmd := exec.Command("bash", scriptPath, tmpFile.Name(), outDxf)
		if output, err := cmd.CombinedOutput(); err == nil {
			if data, err := os.ReadFile(outDxf); err == nil && len(data) > 0 {
				return data, nil
			}
		} else {
			log.Printf("ODA conversion failed: %v, output: %s", err, string(output))
		}
	}

	// Try dwg2dxf as fallback
	cmd := exec.Command("dwg2dxf", "-o", outDxf, tmpFile.Name())
	if err := cmd.Run(); err == nil {
		return os.ReadFile(outDxf)
	}

	// Fallback to ezdxf (only works for DXF files saved with .dwg extension)
	ezdxfScriptPath := "/app/dwg_to_dxf.py"
	if _, err := os.Stat(ezdxfScriptPath); err != nil {
		ezdxfScriptPath = "internal/app/dwg_to_dxf.py"
		if _, err := os.Stat(ezdxfScriptPath); err != nil {
			ezdxfScriptPath = "backend/internal/app/dwg_to_dxf.py"
		}
	}
	cmd = exec.Command("python3", ezdxfScriptPath, tmpFile.Name(), outDxf)
	if output, err := cmd.CombinedOutput(); err != nil {
		return nil, fmt.Errorf("conversion failed: %v, output: %s", err, string(output))
	}

	return os.ReadFile(outDxf)
}

func (s *Service) RequestBlueprintUpload(ctx context.Context, actor Claims, projectID, fileName, contentType string, intendedSize int64, baseURL string) (UploadSession, error) {
	if err := validateBlueprintMIME(contentType); err != nil {
		return UploadSession{}, err
	}
	project, err := s.projectByID(ctx, projectID)
	if err != nil {
		return UploadSession{}, err
	}
	if actor.Role != RoleOwner && actor.Role != RoleSupervisor {
		return UploadSession{}, errors.New("forbidden")
	}
	if err := s.ensureProjectAccess(ctx, actor, project); err != nil {
		return UploadSession{}, err
	}
	sessionID := newID("upl")
	token, err := GenerateSecureToken(32)
	if err != nil {
		return UploadSession{}, err
	}
	expiresAt := time.Now().Add(15 * time.Minute).UTC().Format(time.RFC3339)
	if baseURL == "" {
		baseURL = strings.TrimSuffix(s.cfg.PublicBase, "/")
	}
	uploadPath := fmt.Sprintf("/uploads/%s?token=%s", sessionID, token)
	uploadURL := uploadPath
	if baseURL != "" {
		uploadURL = strings.TrimSuffix(baseURL, "/") + uploadPath
	}
	_, err = s.db.ExecContext(ctx, `INSERT INTO upload_sessions (id, tenant_id, project_id, task_id, requested_by_user_id, file_name, content_type, intended_size_bytes, latitude, longitude, upload_token, status, expires_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, 0, $9, $10, $11, $12)`,
		sessionID, project.TenantID, project.ID, "", actor.UserID, fileNameSafe(fileName), contentType, intendedSize, token, "issued", expiresAt, nowText())
	if err != nil {
		return UploadSession{}, err
	}
	return UploadSession{
		ID:           sessionID,
		UploadURL:    uploadURL,
		Method:       "PUT",
		ExpiresAt:    expiresAt,
		FileName:     fileName,
		ContentType:  contentType,
		IntendedSize: intendedSize,
	}, nil
}

func (s *Service) BlueprintsForProject(ctx context.Context, actor Claims, projectID string) ([]Blueprint, error) {
	project, err := s.projectByID(ctx, projectID)
	if err != nil {
		return nil, err
	}
	if err := s.ensureProjectAccess(ctx, actor, project); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT id, tenant_id, project_id, uploaded_by_user_id, file_name, file_type, file_size_bytes, url_archivo, url_preview, status, scale, version, metadata_json, created_at FROM blueprints WHERE project_id = $1 ORDER BY created_at DESC`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	blueprints := make([]Blueprint, 0)
	for rows.Next() {
		var b Blueprint
		if err := rows.Scan(&b.ID, &b.TenantID, &b.ProjectID, &b.UploadedByUserID, &b.FileName, &b.FileType, &b.FileSizeBytes, &b.URLArchivo, &b.URLPreview, &b.Status, &b.Scale, &b.Version, &b.MetadataJSON, &b.CreatedAt); err != nil {
			return nil, err
		}
		blueprints = append(blueprints, b)
	}
	return blueprints, rows.Err()
}

func (s *Service) BlueprintFile(ctx context.Context, actor Claims, blueprintID string) (io.ReadCloser, string, string, error) {
	var blueprint Blueprint
	err := s.db.QueryRowContext(ctx, `SELECT id, tenant_id, project_id, uploaded_by_user_id, file_name, file_type, file_size_bytes, url_archivo, url_preview, status, scale, version, metadata_json, created_at FROM blueprints WHERE id = $1`, blueprintID).
		Scan(&blueprint.ID, &blueprint.TenantID, &blueprint.ProjectID, &blueprint.UploadedByUserID, &blueprint.FileName, &blueprint.FileType, &blueprint.FileSizeBytes, &blueprint.URLArchivo, &blueprint.URLPreview, &blueprint.Status, &blueprint.Scale, &blueprint.Version, &blueprint.MetadataJSON, &blueprint.CreatedAt)
	if err != nil {
		return nil, "", "", err
	}
	project, err := s.projectByID(ctx, blueprint.ProjectID)
	if err != nil {
		return nil, "", "", err
	}
	if err := s.ensureProjectAccess(ctx, actor, project); err != nil {
		return nil, "", "", err
	}

	var meta struct {
		ObjectPath string `json:"object_path"`
	}
	if err := json.Unmarshal([]byte(blueprint.MetadataJSON), &meta); err != nil {
		return nil, "", "", err
	}
	if meta.ObjectPath == "" {
		return nil, "", "", errors.New("blueprint file is missing")
	}
	rc, err := s.storage.Open(ctx, meta.ObjectPath)
	if err != nil {
		return nil, "", "", err
	}
	contentType := mimeTypeForBlueprint(blueprint.FileType)
	return rc, contentType, blueprint.FileName, nil
}

func (s *Service) DeleteBlueprint(ctx context.Context, actor Claims, blueprintID string) error {
	var blueprint Blueprint
	err := s.db.QueryRowContext(ctx, `SELECT id, tenant_id, project_id, uploaded_by_user_id, file_name, file_type, file_size_bytes, url_archivo, url_preview, status, scale, version, metadata_json, created_at FROM blueprints WHERE id = $1`, blueprintID).
		Scan(&blueprint.ID, &blueprint.TenantID, &blueprint.ProjectID, &blueprint.UploadedByUserID, &blueprint.FileName, &blueprint.FileType, &blueprint.FileSizeBytes, &blueprint.URLArchivo, &blueprint.URLPreview, &blueprint.Status, &blueprint.Scale, &blueprint.Version, &blueprint.MetadataJSON, &blueprint.CreatedAt)
	if err != nil {
		return err
	}
	project, err := s.projectByID(ctx, blueprint.ProjectID)
	if err != nil {
		return err
	}
	if actor.Role != RoleOwner && actor.Role != RoleSupervisor {
		return errors.New("forbidden")
	}
	if err := s.ensureProjectAccess(ctx, actor, project); err != nil {
		return err
	}
	var meta struct {
		ObjectPath string `json:"object_path"`
	}
	if blueprint.MetadataJSON != "" {
		_ = json.Unmarshal([]byte(blueprint.MetadataJSON), &meta)
	}
	if _, err := s.db.ExecContext(ctx, `DELETE FROM blueprints WHERE id = $1`, blueprintID); err != nil {
		return err
	}
	_ = s.storage.Delete(ctx, meta.ObjectPath)
	return nil
}

func (s *Service) ResendVerification(ctx context.Context, email string) error {
	var userID, tenantID, fullName string
	err := s.db.QueryRowContext(ctx, `SELECT id, tenant_id, full_name FROM users WHERE email = $1`, strings.ToLower(strings.TrimSpace(email))).Scan(&userID, &tenantID, &fullName)
	if err != nil {
		return errors.New("user not found")
	}
	// Delete any existing tokens
	_, _ = s.db.ExecContext(ctx, `DELETE FROM verifications WHERE user_id = $1 AND type = 'email_verification'`, userID)

	token, err := GenerateSecureToken(32)
	if err != nil {
		return err
	}
	verification := Verification{
		ID:        newID("ver"),
		TenantID:  tenantID,
		UserID:    userID,
		Type:      "email_verification",
		Token:     token,
		ExpiresAt: time.Now().Add(24 * time.Hour).Format(time.RFC3339),
		CreatedAt: nowText(),
	}
	if _, err := s.db.ExecContext(ctx, `INSERT INTO verifications (id, tenant_id, user_id, type, token, expires_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`, verification.ID, verification.TenantID, verification.UserID, verification.Type, verification.Token, verification.ExpiresAt, verification.CreatedAt); err != nil {
		return err
	}
	go func() {
		_ = s.mailer.Send(context.Background(), email, "Verify your ArquiCheck account", fmt.Sprintf("Please verify your account using token: %s", verification.Token))
	}()
	return nil
}

func (s *Service) UserByID(ctx context.Context, userID string) (User, error) {
	var user User
	err := s.db.QueryRowContext(ctx, `SELECT id, tenant_id, email, full_name, role FROM users WHERE id = $1`, userID).Scan(&user.ID, &user.TenantID, &user.Email, &user.FullName, &user.Role)
	return user, err
}

func (s *Service) ListUsers(ctx context.Context, actor Claims) ([]User, error) {
	if actor.Role != RoleOwner && actor.Role != RoleSupervisor {
		return nil, errors.New("forbidden")
	}
	rows, err := s.db.QueryContext(ctx, `SELECT id, tenant_id, email, full_name, role FROM users WHERE tenant_id = $1 ORDER BY role, full_name`, actor.TenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	users := make([]User, 0)
	for rows.Next() {
		var user User
		if err := rows.Scan(&user.ID, &user.TenantID, &user.Email, &user.FullName, &user.Role); err != nil {
			return nil, err
		}
		users = append(users, user)
	}
	return users, rows.Err()
}

func (s *Service) CreateUser(ctx context.Context, actor Claims, fullName, email, password, role string) (User, error) {
	if s.permissionEffect(ctx, actor.Role, "user.manage") != "allow" {
		return User{}, errors.New("forbidden")
	}
	if err := s.RequireWriteAccess(ctx, actor.TenantID); err != nil {
		return User{}, err
	}
	if err := s.CheckUserQuota(ctx, actor.TenantID, role); err != nil {
		return User{}, err
	}
	fullName = strings.TrimSpace(fullName)
	email = strings.TrimSpace(strings.ToLower(email))
	password = strings.TrimSpace(password)
	role = strings.TrimSpace(role)
	if fullName == "" || email == "" || password == "" || role == "" {
		return User{}, errors.New("missing required fields")
	}
	if err := validateInviteRole(role); err != nil {
		return User{}, err
	}
	passwordHash, err := HashPassword(password)
	if err != nil {
		return User{}, err
	}
	return s.createUserRecord(ctx, actor, fullName, email, passwordHash, role)
}

// ErrForbidden is returned when an actor lacks permission for an action.
// HTTP handlers translate it to 403.
var ErrForbidden = errors.New("forbidden")

// requirePlatformAdmin enforces that the actor is a SaaS platform operator:
// role must be admin AND tenant_id must be empty. Tenant-scoped admins get
// rejected here even if they somehow carry role=admin in their token.
func (s *Service) requirePlatformAdmin(actor Claims) error {
	if actor.Role != RoleAdmin || actor.TenantID != "" {
		return ErrForbidden
	}
	return nil
}

func (s *Service) ListTenants(ctx context.Context, actor Claims) ([]Tenant, error) {
	if err := s.requirePlatformAdmin(actor); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT id, name, slug FROM tenants ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	tenants := make([]Tenant, 0)
	for rows.Next() {
		var tenant Tenant
		if err := rows.Scan(&tenant.ID, &tenant.Name, &tenant.Slug); err != nil {
			return nil, err
		}
		tenants = append(tenants, tenant)
	}
	return tenants, rows.Err()
}

func (s *Service) RBACMatrix(ctx context.Context, actor Claims) ([]RBACRule, error) {
	if err := s.requirePlatformAdmin(actor); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT resource, role, effect FROM role_permissions ORDER BY resource, role`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]RBACRule, 0)
	for rows.Next() {
		var rule RBACRule
		if err := rows.Scan(&rule.Resource, &rule.Role, &rule.Effect); err != nil {
			return nil, err
		}
		out = append(out, rule)
	}
	return out, rows.Err()
}

func (s *Service) UpsertRBACRule(ctx context.Context, actor Claims, rule RBACRule) error {
	if err := s.requirePlatformAdmin(actor); err != nil {
		return err
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO role_permissions (resource, role, effect) VALUES ($1, $2, $3) ON CONFLICT(resource, role) DO UPDATE SET effect = excluded.effect`, rule.Resource, rule.Role, rule.Effect)
	if err == nil {
		s.logger.Info("rbac.rule_upserted", "actor_id", actor.UserID, "tenant_id", actor.TenantID, "resource", rule.Resource, "role", rule.Role, "effect", rule.Effect)
	}
	return err
}

func (s *Service) CreateProject(ctx context.Context, actor Claims, project Project) (Project, error) {
	if s.permissionEffect(ctx, actor.Role, "project.create") != "allow" {
		return Project{}, errors.New("forbidden")
	}
	if err := s.RequireWriteAccess(ctx, actor.TenantID); err != nil {
		return Project{}, err
	}
	if err := s.CheckProjectQuota(ctx, actor.TenantID); err != nil {
		return Project{}, err
	}
	if strings.TrimSpace(project.Name) == "" {
		return Project{}, errors.New("project name is required")
	}
	project.ID = newID("prj")
	project.TenantID = actor.TenantID
	project.Status = "active"
	now := nowText()
	_, err := s.db.ExecContext(ctx, `INSERT INTO projects (id, tenant_id, name, description, status, client_user_id, supervisor_user_id, budget_total_cents, spent_total_cents, start_date, planned_end_date, latitude_center, longitude_center, geofence_radius_m, created_by_user_id, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
		project.ID, project.TenantID, project.Name, project.Description, project.Status, project.ClientUserID, project.SupervisorUserID, project.BudgetTotalCents, project.SpentTotalCents, project.StartDate, project.PlannedEndDate, project.LatitudeCenter, project.LongitudeCenter, project.GeofenceRadiusM, actor.UserID, now, now)
	return project, err
}

func (s *Service) ListProjects(ctx context.Context, actor Claims) ([]Project, error) {
	if actor.Role == RoleHelper {
		return nil, errors.New("forbidden")
	}
	var rows *sql.Rows
	var err error
	switch actor.Role {
	case RoleOwner:
		rows, err = s.db.QueryContext(ctx, `SELECT id, tenant_id, name, description, status, client_user_id, supervisor_user_id, budget_total_cents, spent_total_cents, start_date, planned_end_date, latitude_center, longitude_center, geofence_radius_m FROM projects WHERE tenant_id = $1 ORDER BY created_at DESC`, actor.TenantID)
	case RoleSupervisor:
		rows, err = s.db.QueryContext(ctx, `SELECT id, tenant_id, name, description, status, client_user_id, supervisor_user_id, budget_total_cents, spent_total_cents, start_date, planned_end_date, latitude_center, longitude_center, geofence_radius_m FROM projects WHERE supervisor_user_id = $1 ORDER BY created_at DESC`, actor.UserID)
	case RoleClient:
		rows, err = s.db.QueryContext(ctx, `SELECT id, tenant_id, name, description, status, client_user_id, supervisor_user_id, budget_total_cents, spent_total_cents, start_date, planned_end_date, latitude_center, longitude_center, geofence_radius_m FROM projects WHERE client_user_id = $1 ORDER BY created_at DESC`, actor.UserID)
	default:
		return nil, errors.New("forbidden")
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	projects := make([]Project, 0)
	for rows.Next() {
		var project Project
		if err := rows.Scan(&project.ID, &project.TenantID, &project.Name, &project.Description, &project.Status, &project.ClientUserID, &project.SupervisorUserID, &project.BudgetTotalCents, &project.SpentTotalCents, &project.StartDate, &project.PlannedEndDate, &project.LatitudeCenter, &project.LongitudeCenter, &project.GeofenceRadiusM); err != nil {
			return nil, err
		}
		projects = append(projects, project)
	}
	return projects, rows.Err()
}

func (s *Service) projectByID(ctx context.Context, projectID string) (Project, error) {
	var project Project
	err := s.db.QueryRowContext(ctx, `SELECT id, tenant_id, name, description, status, client_user_id, supervisor_user_id, budget_total_cents, spent_total_cents, start_date, planned_end_date, latitude_center, longitude_center, geofence_radius_m FROM projects WHERE id = $1`, projectID).
		Scan(&project.ID, &project.TenantID, &project.Name, &project.Description, &project.Status, &project.ClientUserID, &project.SupervisorUserID, &project.BudgetTotalCents, &project.SpentTotalCents, &project.StartDate, &project.PlannedEndDate, &project.LatitudeCenter, &project.LongitudeCenter, &project.GeofenceRadiusM)
	return project, err
}

func (s *Service) taskByID(ctx context.Context, taskID string) (Task, error) {
	var task Task
	err := s.db.QueryRowContext(ctx, `SELECT id, tenant_id, project_id, title, description, assigned_to_user_id, status, start_date, end_date, predecessor_task_id, expected_finish_quality, technical_spec_text, budget_cents, spent_cents, progress_percent, comparison_photo_url FROM tasks WHERE id = $1`, taskID).
		Scan(&task.ID, &task.TenantID, &task.ProjectID, &task.Title, &task.Description, &task.AssignedToUserID, &task.Status, &task.StartDate, &task.EndDate, &task.PredecessorTaskID, &task.ExpectedFinishQuality, &task.TechnicalSpecText, &task.BudgetCents, &task.SpentCents, &task.ProgressPercent, &task.ComparisonPhotoURL)
	return task, err
}

func (s *Service) UpdateTask(ctx context.Context, actor Claims, taskID string, patch Task) (Task, error) {
	if actor.Role != RoleOwner && actor.Role != RoleSupervisor {
		return Task{}, errors.New("forbidden")
	}
	task, err := s.taskByID(ctx, taskID)
	if err != nil {
		return Task{}, err
	}
	project, err := s.projectByID(ctx, task.ProjectID)
	if err != nil {
		return Task{}, err
	}
	if err := s.ensureProjectAccess(ctx, actor, project); err != nil {
		return Task{}, err
	}
	if patch.Title != "" {
		task.Title = strings.TrimSpace(patch.Title)
	}
	if patch.Description != "" {
		task.Description = strings.TrimSpace(patch.Description)
	}
	if patch.AssignedToUserID != "" {
		var assigneeTenant string
		if err := s.db.QueryRowContext(ctx, `SELECT tenant_id FROM users WHERE id = $1`, patch.AssignedToUserID).Scan(&assigneeTenant); err != nil || assigneeTenant != actor.TenantID {
			return Task{}, errors.New("assigned user must belong to same organization")
		}
		task.AssignedToUserID = patch.AssignedToUserID
	}
	if patch.Status != "" {
		task.Status = patch.Status
	}
	if patch.StartDate != "" {
		task.StartDate = patch.StartDate
	}
	if patch.EndDate != "" {
		task.EndDate = patch.EndDate
	}
	if patch.ExpectedFinishQuality != "" {
		task.ExpectedFinishQuality = patch.ExpectedFinishQuality
	}
	if patch.TechnicalSpecText != "" {
		task.TechnicalSpecText = patch.TechnicalSpecText
	}
	// PredecessorTaskID is set explicitly via the patch — empty string clears it
	task.PredecessorTaskID = patch.PredecessorTaskID
	if patch.BudgetCents != 0 || task.BudgetCents == 0 {
		task.BudgetCents = patch.BudgetCents
	}
	if patch.SpentCents != 0 || task.SpentCents == 0 {
		task.SpentCents = patch.SpentCents
	}
	if patch.ProgressPercent >= 0 {
		task.ProgressPercent = patch.ProgressPercent
	}
	if patch.ComparisonPhotoURL != "" {
		task.ComparisonPhotoURL = patch.ComparisonPhotoURL
	}
	_, err = s.db.ExecContext(ctx, `UPDATE tasks SET title = $1, description = $2, assigned_to_user_id = $3, status = $4, start_date = $5, end_date = $6, expected_finish_quality = $7, technical_spec_text = $8, budget_cents = $9, spent_cents = $10, progress_percent = $11, predecessor_task_id = $12, comparison_photo_url = $13, updated_at = $14 WHERE id = $15`,
		task.Title, task.Description, task.AssignedToUserID, task.Status, task.StartDate, task.EndDate, task.ExpectedFinishQuality, task.TechnicalSpecText, task.BudgetCents, task.SpentCents, task.ProgressPercent, task.PredecessorTaskID, task.ComparisonPhotoURL, nowText(), taskID)
	if err != nil {
		return Task{}, err
	}
	return s.taskByID(ctx, taskID)
}

func (s *Service) DeleteTask(ctx context.Context, actor Claims, taskID string) error {
	if actor.Role != RoleOwner && actor.Role != RoleSupervisor {
		return errors.New("forbidden")
	}
	task, err := s.taskByID(ctx, taskID)
	if err != nil {
		return err
	}
	project, err := s.projectByID(ctx, task.ProjectID)
	if err != nil {
		return err
	}
	if err := s.ensureProjectAccess(ctx, actor, project); err != nil {
		return err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT object_path FROM evidences WHERE task_id = $1`, taskID)
	if err != nil {
		return err
	}
	defer rows.Close()
	var paths []string
	for rows.Next() {
		var path string
		if err := rows.Scan(&path); err != nil {
			return err
		}
		paths = append(paths, path)
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM ia_audits WHERE evidence_id IN (SELECT id FROM evidences WHERE task_id = $1)`, taskID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM quality_alerts WHERE task_id = $1`, taskID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM evidences WHERE task_id = $1`, taskID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM deliverables WHERE task_id = $1`, taskID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM tasks WHERE id = $1`, taskID); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	for _, path := range paths {
		_ = s.storage.Delete(ctx, path)
	}
	return nil
}

func (s *Service) CreateTask(ctx context.Context, actor Claims, projectID string, task Task, deliverable Deliverable) (Task, Deliverable, error) {
	if actor.Role != RoleOwner && actor.Role != RoleSupervisor {
		return Task{}, Deliverable{}, errors.New("forbidden")
	}
	if strings.TrimSpace(task.Title) == "" {
		return Task{}, Deliverable{}, errors.New("task title is required")
	}
	if task.StartDate != "" && task.EndDate != "" && task.StartDate > task.EndDate {
		return Task{}, Deliverable{}, errors.New("start_date must be before end_date")
	}
	project, err := s.projectByID(ctx, projectID)
	if err != nil {
		return Task{}, Deliverable{}, err
	}
	if actor.TenantID != project.TenantID {
		return Task{}, Deliverable{}, errors.New("forbidden")
	}
	task.ID = newID("tsk")
	task.TenantID = project.TenantID
	task.ProjectID = project.ID
	if task.Status == "" {
		task.Status = "pending"
	}
	deliverable.ID = newID("del")
	deliverable.TenantID = project.TenantID
	deliverable.ProjectID = project.ID
	deliverable.TaskID = task.ID
	if deliverable.Status == "" {
		deliverable.Status = "pending"
	}
	now := nowText()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Task{}, Deliverable{}, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `INSERT INTO tasks (id, tenant_id, project_id, title, description, assigned_to_user_id, status, start_date, end_date, predecessor_task_id, expected_finish_quality, technical_spec_text, budget_cents, spent_cents, progress_percent, comparison_photo_url, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`, task.ID, task.TenantID, task.ProjectID, task.Title, task.Description, task.AssignedToUserID, task.Status, task.StartDate, task.EndDate, task.PredecessorTaskID, task.ExpectedFinishQuality, task.TechnicalSpecText, task.BudgetCents, task.SpentCents, task.ProgressPercent, task.ComparisonPhotoURL, now, now); err != nil {
		return Task{}, Deliverable{}, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO deliverables (id, tenant_id, project_id, task_id, title, description, due_date, status, client_visible, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`, deliverable.ID, deliverable.TenantID, deliverable.ProjectID, deliverable.TaskID, deliverable.Title, deliverable.Description, deliverable.DueDate, deliverable.Status, boolToInt(deliverable.ClientVisible), now, now); err != nil {
		return Task{}, Deliverable{}, err
	}
	if err := tx.Commit(); err != nil {
		return Task{}, Deliverable{}, err
	}
	return task, deliverable, nil
}

func (s *Service) UpdateTaskTimeline(ctx context.Context, actor Claims, taskID string, startDate, endDate, status string, progressPercent int) (Task, error) {
	if effect := s.permissionEffect(ctx, actor.Role, "timeline.edit"); effect == "deny" {
		return Task{}, errors.New("forbidden")
	}
	task, err := s.taskByID(ctx, taskID)
	if err != nil {
		return Task{}, err
	}
	project, err := s.projectByID(ctx, task.ProjectID)
	if err != nil {
		return Task{}, err
	}
	if err := s.ensureProjectAccess(ctx, actor, project); err != nil {
		return Task{}, err
	}
	if status == "" {
		status = task.Status
	}
	if startDate == "" {
		startDate = task.StartDate
	}
	if endDate == "" {
		endDate = task.EndDate
	}
	if progressPercent < 0 {
		progressPercent = task.ProgressPercent
	}
	_, err = s.db.ExecContext(ctx, `UPDATE tasks SET start_date = $1, end_date = $2, status = $3, progress_percent = $4, predecessor_task_id = $5, updated_at = $6 WHERE id = $7`, startDate, endDate, status, progressPercent, task.PredecessorTaskID, nowText(), taskID)
	if err != nil {
		return Task{}, err
	}
	return s.taskByID(ctx, taskID)
}

func (s *Service) ListAssignedTasks(ctx context.Context, actor Claims) ([]Task, error) {
	// Non-helper roles have no tasks personally assigned to them; return empty instead of 403.
	if actor.Role != RoleHelper {
		return []Task{}, nil
	}
	rows, err := s.db.QueryContext(ctx, `SELECT id, tenant_id, project_id, title, description, assigned_to_user_id, status, start_date, end_date, predecessor_task_id, expected_finish_quality, technical_spec_text, budget_cents, spent_cents, progress_percent, comparison_photo_url FROM tasks WHERE assigned_to_user_id = $1 ORDER BY end_date`, actor.UserID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	tasks := make([]Task, 0)
	for rows.Next() {
		var task Task
		if err := rows.Scan(&task.ID, &task.TenantID, &task.ProjectID, &task.Title, &task.Description, &task.AssignedToUserID, &task.Status, &task.StartDate, &task.EndDate, &task.PredecessorTaskID, &task.ExpectedFinishQuality, &task.TechnicalSpecText, &task.BudgetCents, &task.SpentCents, &task.ProgressPercent, &task.ComparisonPhotoURL); err != nil {
			return nil, err
		}
		tasks = append(tasks, task)
	}
	return tasks, rows.Err()
}

func (s *Service) RequestUpload(ctx context.Context, actor Claims, taskID, fileName, contentType string, intendedSize int64, lat, lng float64, baseURL, projectID string) (UploadSession, error) {
	if effect := s.permissionEffect(ctx, actor.Role, "evidence.upload"); effect == "deny" {
		return UploadSession{}, errors.New("forbidden")
	}
	if err := validateEvidenceMIME(contentType); err != nil {
		return UploadSession{}, err
	}

	var project Project
	var task Task
	var err error

	if taskID == "SYSTEM" {
		if projectID == "" {
			return UploadSession{}, errors.New("project_id required for system uploads")
		}
		project, err = s.projectByID(ctx, projectID)
		if err != nil {
			return UploadSession{}, err
		}
		if err := s.ensureProjectAccess(ctx, actor, project); err != nil {
			return UploadSession{}, err
		}
		// System uploads don't need geofence
	} else {
		task, err = s.taskByID(ctx, taskID)
		if err != nil {
			return UploadSession{}, err
		}
		project, err = s.projectByID(ctx, task.ProjectID)
		if err != nil {
			return UploadSession{}, err
		}
		if err := s.ensureTaskUploadAccess(ctx, actor, task, project); err != nil {
			return UploadSession{}, err
		}
		// Geofence only enforced for field workers (helper); owners/supervisors work remotely.
		// A radius of 0 means the check is disabled for this project.
		if actor.Role == RoleHelper && project.GeofenceRadiusM > 0 {
			distance := s.distanceMeters(project.LatitudeCenter, project.LongitudeCenter, lat, lng)
			if distance > float64(project.GeofenceRadiusM) {
				return UploadSession{}, fmt.Errorf("geofence violation: %.2f", distance)
			}
		}
	}
	sessionID := newID("upl")
	token, err := GenerateSecureToken(32)
	if err != nil {
		return UploadSession{}, err
	}
	expiresAt := time.Now().Add(15 * time.Minute).UTC().Format(time.RFC3339)
	if baseURL == "" {
		baseURL = strings.TrimSuffix(s.cfg.PublicBase, "/")
	}
	uploadPath := fmt.Sprintf("/uploads/%s?token=%s", sessionID, token)
	uploadURL := uploadPath
	if baseURL != "" {
		uploadURL = strings.TrimSuffix(baseURL, "/") + uploadPath
	}
	_, err = s.db.ExecContext(ctx, `INSERT INTO upload_sessions (id, tenant_id, project_id, task_id, requested_by_user_id, file_name, content_type, intended_size_bytes, latitude, longitude, upload_token, status, expires_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`, sessionID, project.TenantID, project.ID, task.ID, actor.UserID, fileNameSafe(fileName), contentType, intendedSize, lat, lng, token, "issued", expiresAt, nowText())
	if err != nil {
		return UploadSession{}, err
	}
	return UploadSession{ID: sessionID, UploadURL: uploadURL, Method: "PUT", ExpiresAt: expiresAt, FileName: fileName, ContentType: contentType, IntendedSize: intendedSize}, nil
}

func (s *Service) SaveUploadedFile(ctx context.Context, sessionID, token, contentType string, body io.Reader) error {
	var uploadToken, fileName, status, expiresAt string
	var intendedSize int64
	if err := s.db.QueryRowContext(ctx, `SELECT upload_token, file_name, status, expires_at, intended_size_bytes FROM upload_sessions WHERE id = $1`, sessionID).Scan(&uploadToken, &fileName, &status, &expiresAt, &intendedSize); err != nil {
		return err
	}
	if !constantTimeEqual(token, uploadToken) {
		return errors.New("invalid upload token")
	}
	if status != "issued" {
		return errors.New("upload session not available")
	}
	if time.Now().UTC().After(parseTime(expiresAt)) {
		return errors.New("upload session expired")
	}
	filePath, err := s.storage.Save(ctx, fmt.Sprintf("%s-%s", sessionID, fileNameSafe(fileName)), body)
	if err != nil {
		return err
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	_, err = s.db.ExecContext(ctx, `UPDATE upload_sessions SET status = $1, local_path = $2, content_type = $3 WHERE id = $4`, "uploaded", filePath, contentType, sessionID)
	return err
}

func (s *Service) ConfirmUpload(ctx context.Context, actor Claims, sessionID, metadataEXIF string) (Evidence, error) {
	var tenantID, projectID, taskID, requestedByUserID, fileName, contentType, localPath, status string
	var intendedSize int64
	var lat, lng float64
	if err := s.db.QueryRowContext(ctx, `SELECT tenant_id, project_id, task_id, requested_by_user_id, file_name, content_type, intended_size_bytes, latitude, longitude, local_path, status FROM upload_sessions WHERE id = $1`, sessionID).
		Scan(&tenantID, &projectID, &taskID, &requestedByUserID, &fileName, &contentType, &intendedSize, &lat, &lng, &localPath, &status); err != nil {
		return Evidence{}, err
	}
	if actor.UserID != requestedByUserID {
		return Evidence{}, errors.New("forbidden")
	}
	if status != "uploaded" || localPath == "" {
		return Evidence{}, errors.New("upload not completed")
	}
	evidence := Evidence{
		ID:                 newID("evi"),
		TenantID:           tenantID,
		ProjectID:          projectID,
		TaskID:             taskID,
		UploadedByUserID:   actor.UserID,
		FileName:           fileName,
		MimeType:           contentType,
		FileSizeBytes:      intendedSize,
		URLArchivo:         "/api/v1/files/" + newID("tmp"),
		Status:             "pending_approval",
		Latitude:           lat,
		Longitude:          lng,
		MetadataEXIF:       metadataEXIF,
		VisibleToClient:    false,
		AIProcessingStatus: "not_requested",
		CreatedAt:          nowText(),
	}
	evidence.URLArchivo = "/api/v1/files/" + evidence.ID
	_, err := s.db.ExecContext(ctx, `INSERT INTO evidences (id, tenant_id, project_id, task_id, uploaded_by_user_id, file_name, mime_type, file_size_bytes, object_path, url_archivo, status, latitude, longitude, metadata_exif, is_visible_to_client, ai_processing_status, quality_score, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`, evidence.ID, evidence.TenantID, evidence.ProjectID, evidence.TaskID, evidence.UploadedByUserID, evidence.FileName, evidence.MimeType, evidence.FileSizeBytes, localPath, evidence.URLArchivo, evidence.Status, evidence.Latitude, evidence.Longitude, evidence.MetadataEXIF, 0, evidence.AIProcessingStatus, 0, evidence.CreatedAt, evidence.CreatedAt)
	if err != nil {
		return Evidence{}, err
	}
	_, _ = s.db.ExecContext(ctx, `UPDATE upload_sessions SET status = $1 WHERE id = $2`, "confirmed", sessionID)
	return evidence, nil
}

func (s *Service) ListTaskEvidences(ctx context.Context, actor Claims, taskID string) ([]Evidence, error) {
	task, err := s.taskByID(ctx, taskID)
	if err != nil {
		return nil, err
	}
	project, err := s.projectByID(ctx, task.ProjectID)
	if err != nil {
		return nil, err
	}
	if actor.Role == RoleHelper && task.AssignedToUserID != actor.UserID {
		return nil, errors.New("forbidden")
	}
	if actor.Role != RoleHelper {
		if err := s.ensureProjectAccess(ctx, actor, project); err != nil {
			return nil, err
		}
	}
	var taskEvidenceQuery string
	var taskEvidenceArgs []any
	switch actor.Role {
	case RoleClient:
		taskEvidenceQuery = `SELECT id, tenant_id, project_id, task_id, uploaded_by_user_id, approved_by_user_id, file_name, mime_type, file_size_bytes, url_archivo, status, latitude, longitude, metadata_exif, approval_comment, rejection_reason, is_visible_to_client, ai_processing_status, quality_score, created_at FROM evidences WHERE task_id = $1 AND status IN ('committed', 'approved') AND is_visible_to_client = 1 ORDER BY created_at DESC`
		taskEvidenceArgs = []any{taskID}
	case RoleHelper:
		taskEvidenceQuery = `SELECT id, tenant_id, project_id, task_id, uploaded_by_user_id, approved_by_user_id, file_name, mime_type, file_size_bytes, url_archivo, status, latitude, longitude, metadata_exif, approval_comment, rejection_reason, is_visible_to_client, ai_processing_status, quality_score, created_at FROM evidences WHERE task_id = $1 AND status IN ('pending', 'approved') ORDER BY created_at DESC`
		taskEvidenceArgs = []any{taskID}
	default:
		taskEvidenceQuery = `SELECT id, tenant_id, project_id, task_id, uploaded_by_user_id, approved_by_user_id, file_name, mime_type, file_size_bytes, url_archivo, status, latitude, longitude, metadata_exif, approval_comment, rejection_reason, is_visible_to_client, ai_processing_status, quality_score, created_at FROM evidences WHERE task_id = $1 ORDER BY created_at DESC`
		taskEvidenceArgs = []any{taskID}
	}
	rows, err := s.db.QueryContext(ctx, taskEvidenceQuery, taskEvidenceArgs...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	evidences := make([]Evidence, 0)
	for rows.Next() {
		var evidence Evidence
		var visible int
		if err := rows.Scan(&evidence.ID, &evidence.TenantID, &evidence.ProjectID, &evidence.TaskID, &evidence.UploadedByUserID, &evidence.ApprovedByUserID, &evidence.FileName, &evidence.MimeType, &evidence.FileSizeBytes, &evidence.URLArchivo, &evidence.Status, &evidence.Latitude, &evidence.Longitude, &evidence.MetadataEXIF, &evidence.ApprovalComment, &evidence.RejectionReason, &visible, &evidence.AIProcessingStatus, &evidence.QualityScore, &evidence.CreatedAt); err != nil {
			return nil, err
		}
		evidence.VisibleToClient = intToBool(visible)
		evidences = append(evidences, evidence)
	}
	return evidences, rows.Err()
}

func (s *Service) ListProjectEvidences(ctx context.Context, actor Claims, projectID string) ([]Evidence, error) {
	project, err := s.projectByID(ctx, projectID)
	if err != nil {
		return nil, err
	}
	if actor.Role == RoleHelper {
		return nil, errors.New("forbidden")
	}
	if err := s.ensureProjectAccess(ctx, actor, project); err != nil {
		return nil, err
	}
	var projEvidenceQuery string
	switch actor.Role {
	case RoleClient:
		projEvidenceQuery = `SELECT id, tenant_id, project_id, task_id, uploaded_by_user_id, approved_by_user_id, file_name, mime_type, file_size_bytes, url_archivo, status, latitude, longitude, metadata_exif, approval_comment, rejection_reason, is_visible_to_client, ai_processing_status, quality_score, created_at FROM evidences WHERE project_id = $1 AND status IN ('committed', 'approved') AND is_visible_to_client = 1 ORDER BY created_at DESC`
	case RoleHelper:
		projEvidenceQuery = `SELECT id, tenant_id, project_id, task_id, uploaded_by_user_id, approved_by_user_id, file_name, mime_type, file_size_bytes, url_archivo, status, latitude, longitude, metadata_exif, approval_comment, rejection_reason, is_visible_to_client, ai_processing_status, quality_score, created_at FROM evidences WHERE project_id = $1 AND status IN ('pending', 'approved') ORDER BY created_at DESC`
	default:
		projEvidenceQuery = `SELECT id, tenant_id, project_id, task_id, uploaded_by_user_id, approved_by_user_id, file_name, mime_type, file_size_bytes, url_archivo, status, latitude, longitude, metadata_exif, approval_comment, rejection_reason, is_visible_to_client, ai_processing_status, quality_score, created_at FROM evidences WHERE project_id = $1 ORDER BY created_at DESC`
	}
	rows, err := s.db.QueryContext(ctx, projEvidenceQuery, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]Evidence, 0)
	for rows.Next() {
		var evidence Evidence
		var visible int
		if err := rows.Scan(&evidence.ID, &evidence.TenantID, &evidence.ProjectID, &evidence.TaskID, &evidence.UploadedByUserID, &evidence.ApprovedByUserID, &evidence.FileName, &evidence.MimeType, &evidence.FileSizeBytes, &evidence.URLArchivo, &evidence.Status, &evidence.Latitude, &evidence.Longitude, &evidence.MetadataEXIF, &evidence.ApprovalComment, &evidence.RejectionReason, &visible, &evidence.AIProcessingStatus, &evidence.QualityScore, &evidence.CreatedAt); err != nil {
			return nil, err
		}
		evidence.VisibleToClient = intToBool(visible)
		out = append(out, evidence)
	}
	return out, rows.Err()
}

func (s *Service) DeleteEvidence(ctx context.Context, actor Claims, evidenceID string) error {
	evidence, err := s.evidenceByID(ctx, evidenceID)
	if err != nil {
		return err
	}
	project, err := s.projectByID(ctx, evidence.ProjectID)
	if err != nil {
		return err
	}
	switch actor.Role {
	case RoleOwner, RoleSupervisor:
		if err := s.ensureProjectAccess(ctx, actor, project); err != nil {
			return err
		}
	case RoleHelper:
		if evidence.UploadedByUserID != actor.UserID {
			return errors.New("forbidden")
		}
	default:
		return errors.New("forbidden")
	}
	var objectPath string
	if err := s.db.QueryRowContext(ctx, `SELECT object_path FROM evidences WHERE id = $1`, evidenceID).Scan(&objectPath); err != nil {
		return err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM ia_audits WHERE evidence_id = $1`, evidenceID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM quality_alerts WHERE evidence_id = $1`, evidenceID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM evidences WHERE id = $1`, evidenceID); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	_ = s.storage.Delete(ctx, objectPath)
	s.logger.Info("evidence.deleted", "actor_id", actor.UserID, "tenant_id", actor.TenantID, "evidence_id", evidenceID, "project_id", evidence.ProjectID)
	return nil
}

func (s *Service) ApproveEvidence(ctx context.Context, actor Claims, evidenceID, comment string, visibleToClient bool) (Evidence, error) {
	if s.permissionEffect(ctx, actor.Role, "evidence.approve") != "allow" {
		return Evidence{}, errors.New("forbidden")
	}
	var evidence Evidence
	var objectPath string
	var visible int
	if err := s.db.QueryRowContext(ctx, `SELECT id, tenant_id, project_id, task_id, uploaded_by_user_id, approved_by_user_id, file_name, mime_type, file_size_bytes, object_path, url_archivo, status, latitude, longitude, metadata_exif, approval_comment, rejection_reason, is_visible_to_client, ai_processing_status, quality_score, created_at FROM evidences WHERE id = $1`, evidenceID).
		Scan(&evidence.ID, &evidence.TenantID, &evidence.ProjectID, &evidence.TaskID, &evidence.UploadedByUserID, &evidence.ApprovedByUserID, &evidence.FileName, &evidence.MimeType, &evidence.FileSizeBytes, &objectPath, &evidence.URLArchivo, &evidence.Status, &evidence.Latitude, &evidence.Longitude, &evidence.MetadataEXIF, &evidence.ApprovalComment, &evidence.RejectionReason, &visible, &evidence.AIProcessingStatus, &evidence.QualityScore, &evidence.CreatedAt); err != nil {
		return Evidence{}, err
	}
	project, err := s.projectByID(ctx, evidence.ProjectID)
	if err != nil {
		return Evidence{}, err
	}
	if actor.TenantID != project.TenantID {
		return Evidence{}, errors.New("forbidden")
	}
	if err := s.ensureProjectAccess(ctx, actor, project); err != nil {
		return Evidence{}, err
	}
	updatedAt := nowText()
	_, err = s.db.ExecContext(ctx, `UPDATE evidences SET status = $1, approved_by_user_id = $2, approval_comment = $3, is_visible_to_client = $4, ai_processing_status = $5, updated_at = $6, approved_at = $7 WHERE id = $8`, "committed", actor.UserID, comment, boolToInt(visibleToClient), "queued", updatedAt, updatedAt, evidenceID)
	if err != nil {
		return Evidence{}, err
	}
	select {
	case s.auditJobs <- evidenceID:
	default:
		log.Printf("audit queue full, evidence %s will remain in queued state for manual review", evidenceID)
	}
	s.logger.Info("evidence.approved", "actor_id", actor.UserID, "tenant_id", actor.TenantID, "evidence_id", evidenceID, "project_id", evidence.ProjectID, "visible_to_client", visibleToClient)
	return s.evidenceByID(ctx, evidenceID)
}

func (s *Service) RejectEvidence(ctx context.Context, actor Claims, evidenceID, reason string) (Evidence, error) {
	if s.permissionEffect(ctx, actor.Role, "evidence.approve") != "allow" {
		return Evidence{}, errors.New("forbidden")
	}
	evidence, err := s.evidenceByID(ctx, evidenceID)
	if err != nil {
		return Evidence{}, err
	}
	project, err := s.projectByID(ctx, evidence.ProjectID)
	if err != nil {
		return Evidence{}, err
	}
	if actor.TenantID != project.TenantID {
		return Evidence{}, errors.New("forbidden")
	}
	if err := s.ensureProjectAccess(ctx, actor, project); err != nil {
		return Evidence{}, err
	}
	_, err = s.db.ExecContext(ctx, `UPDATE evidences SET status = $1, rejection_reason = $2, updated_at = $3 WHERE id = $4`, "rejected", reason, nowText(), evidenceID)
	if err != nil {
		return Evidence{}, err
	}
	s.logger.Info("evidence.rejected", "actor_id", actor.UserID, "tenant_id", actor.TenantID, "evidence_id", evidenceID, "project_id", evidence.ProjectID)
	return s.evidenceByID(ctx, evidenceID)
}

func (s *Service) evidenceByID(ctx context.Context, evidenceID string) (Evidence, error) {
	var evidence Evidence
	var objectPath string
	var visible int
	err := s.db.QueryRowContext(ctx, `SELECT id, tenant_id, project_id, task_id, uploaded_by_user_id, approved_by_user_id, file_name, mime_type, file_size_bytes, object_path, url_archivo, status, latitude, longitude, metadata_exif, approval_comment, rejection_reason, is_visible_to_client, ai_processing_status, quality_score, created_at FROM evidences WHERE id = $1`, evidenceID).
		Scan(&evidence.ID, &evidence.TenantID, &evidence.ProjectID, &evidence.TaskID, &evidence.UploadedByUserID, &evidence.ApprovedByUserID, &evidence.FileName, &evidence.MimeType, &evidence.FileSizeBytes, &objectPath, &evidence.URLArchivo, &evidence.Status, &evidence.Latitude, &evidence.Longitude, &evidence.MetadataEXIF, &evidence.ApprovalComment, &evidence.RejectionReason, &visible, &evidence.AIProcessingStatus, &evidence.QualityScore, &evidence.CreatedAt)
	evidence.VisibleToClient = intToBool(visible)
	return evidence, err
}

func (s *Service) auditWorker() {
	s.auditWg.Add(1)
	defer s.auditWg.Done()
	for evidenceID := range s.auditJobs {
		s.processAudit(evidenceID)
	}
}

func (s *Service) processAudit(evidenceID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	evidence, err := s.evidenceByID(ctx, evidenceID)
	if err != nil {
		return
	}
	var objectPath string
	if err := s.db.QueryRowContext(ctx, `SELECT object_path FROM evidences WHERE id = $1`, evidenceID).Scan(&objectPath); err != nil {
		return
	}
	rc, err := s.storage.Open(ctx, objectPath)
	if err != nil {
		return
	}
	avanceBytes, err := io.ReadAll(rc)
	rc.Close()
	if err != nil {
		return
	}

	var feedback AuditFeedback
	modelVersion := "gemini-2.0-flash"

	if s.cfg.GeminiAPIKey == "" {
		// Fallback stub when no GEMINI_API_KEY is configured. We derive a
		// deterministic-but-varied response from the evidence ID so demos do
		// not show the same 92-score approval for every photo. A production
		// deploy should set GEMINI_API_KEY for real audits.
		feedback = stubAuditFeedback(evidence, len(avanceBytes))
		modelVersion = "stub-no-api-key"
	} else {
		// Look up comparison photo from task
		var referenceBytes []byte
		var refMime string
		if evidence.TaskID != "" {
			task, taskErr := s.taskByID(ctx, evidence.TaskID)
			if taskErr == nil && task.ComparisonPhotoURL != "" {
				// Extract evidence ID from URL like /api/v1/files/eviXXX
				parts := strings.Split(task.ComparisonPhotoURL, "/")
				if len(parts) > 0 {
					refEviID := parts[len(parts)-1]
					var refPath, refMimeType string
					if err := s.db.QueryRowContext(ctx, `SELECT object_path, mime_type FROM evidences WHERE id = $1`, refEviID).Scan(&refPath, &refMimeType); err == nil {
						refRC, refErr := s.storage.Open(ctx, refPath)
						if refErr == nil {
							referenceBytes, _ = io.ReadAll(refRC)
							refRC.Close()
							refMime = refMimeType
						}
					}
				}
			}
		}

		feedback, err = s.callGeminiVision(ctx, referenceBytes, avanceBytes, refMime, evidence.MimeType)
		if err != nil {
			log.Printf("gemini audit error for %s: %v", evidenceID, err)
			// Fallback: mark as completed without score
			feedback = AuditFeedback{
				IsValidEvidence: true,
				QualityScore:    0,
				AnalysisSummary: "AI analysis unavailable: " + err.Error(),
				DetectedIssues:  []string{},
				Recommendations: "Manual review recommended.",
				StatusLogic:     "approved",
			}
			modelVersion = "gemini-error-fallback"
		}
	}

	payload, _ := json.Marshal(feedback)
	_, _ = s.db.ExecContext(ctx, `INSERT INTO ia_audits (id, tenant_id, evidence_id, score, json_feedback, critical_alert, model_version, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, newID("audit"), evidence.TenantID, evidence.ID, feedback.QualityScore, string(payload), boolToInt(feedback.StatusLogic == "critical_alert"), modelVersion, nowText())

	if feedback.QualityScore < 80 && feedback.QualityScore > 0 {
		// Auto-reject: score below threshold
		_, _ = s.db.ExecContext(ctx, `UPDATE evidences SET status = $1, ai_processing_status = $2, quality_score = $3, rejection_reason = $4, updated_at = $5 WHERE id = $6`,
			"rejected", "completed", feedback.QualityScore, fmt.Sprintf("Calificación IA: %d%% — %s", feedback.QualityScore, feedback.AnalysisSummary), nowText(), evidence.ID)
		_, _ = s.db.ExecContext(ctx, `INSERT INTO quality_alerts (id, tenant_id, project_id, task_id, evidence_id, severity, title, description, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
			newID("alt"), evidence.TenantID, evidence.ProjectID, evidence.TaskID, evidence.ID, "red", "Calidad por debajo del umbral (< 80%)", feedback.AnalysisSummary, "open", nowText())
	} else {
		// Approve
		_, _ = s.db.ExecContext(ctx, `UPDATE evidences SET status = $1, ai_processing_status = $2, quality_score = $3, updated_at = $4 WHERE id = $5`,
			"approved", "completed", feedback.QualityScore, nowText(), evidence.ID)
	}
}

func (s *Service) callGeminiVision(ctx context.Context, referenceImage, avanceImage []byte, refMime, avanceMime string) (AuditFeedback, error) {
	client, err := genai.NewClient(ctx, option.WithAPIKey(s.cfg.GeminiAPIKey))
	if err != nil {
		return AuditFeedback{}, fmt.Errorf("gemini client: %w", err)
	}
	defer client.Close()

	model := client.GenerativeModel("gemini-2.0-flash")
	model.SetTemperature(0.2)
	model.ResponseMIMEType = "application/json"

	var parts []genai.Part

	if len(referenceImage) > 0 {
		// Comparison mode: render vs avance
		if refMime == "" {
			refMime = http.DetectContentType(referenceImage)
		}
		parts = append(parts, genai.Blob{MIMEType: refMime, Data: referenceImage})
		parts = append(parts, genai.Blob{MIMEType: avanceMime, Data: avanceImage})
		parts = append(parts, genai.Text(`Actúa como un Inspector de Calidad Experto en arquitectura, mecanizado, joyería y modelado 3D. Tu tarea es comparar dos imágenes y evaluar objetivamente el progreso de un proyecto.

Se te proporcionan dos imágenes:
1. "Render/Referencia": El diseño final y objetivo del proyecto.
2. "Avance": Una fotografía del estado actual del proyecto en el mundo real.

Instrucciones de análisis:
- IGNORA el ruido del entorno en la imagen de "Avance" (ej. herramientas, andamios, personas, iluminación del taller o fondo).
- ENFÓCATE estrictamente en la geometría, proporciones, ensamblaje, materiales visibles y detalles estructurales de la pieza o proyecto principal.
- COMPARA las similitudes y diferencias clave entre el "Render" y el "Avance".
- CALCULA un porcentaje de similitud del 0 al 100%.

Responde ÚNICAMENTE con un objeto JSON:
{
  "is_valid_evidence": true,
  "quality_score": 85,
  "analysis_summary": "Descripción detallada de las similitudes y diferencias",
  "detected_issues": ["lista de problemas encontrados"],
  "recommendations": "Recomendaciones para mejorar",
  "status_logic": "approved"
}

status_logic debe ser "approved" si quality_score >= 80, o "critical_alert" si < 80.`))
	} else {
		// Single image quality evaluation
		parts = append(parts, genai.Blob{MIMEType: avanceMime, Data: avanceImage})
		parts = append(parts, genai.Text(`Actúa como un Inspector de Calidad. Evalúa la calidad de esta imagen como evidencia fotográfica de un proyecto (construcción, manufactura, joyería, etc).

Evalúa:
- Claridad y enfoque de la imagen
- Si muestra evidencia útil del progreso del trabajo
- Calidad general como documentación profesional

Responde ÚNICAMENTE con un objeto JSON:
{
  "is_valid_evidence": true,
  "quality_score": 85,
  "analysis_summary": "Descripción de la evaluación",
  "detected_issues": ["lista de problemas"],
  "recommendations": "Recomendaciones",
  "status_logic": "approved"
}

status_logic debe ser "approved" si quality_score >= 80, o "critical_alert" si < 80.`))
	}

	resp, err := model.GenerateContent(ctx, parts...)
	if err != nil {
		return AuditFeedback{}, fmt.Errorf("gemini generate: %w", err)
	}

	if len(resp.Candidates) == 0 || len(resp.Candidates[0].Content.Parts) == 0 {
		return AuditFeedback{}, errors.New("gemini returned empty response")
	}

	text, ok := resp.Candidates[0].Content.Parts[0].(genai.Text)
	if !ok {
		return AuditFeedback{}, errors.New("gemini response is not text")
	}

	var feedback AuditFeedback
	if err := json.Unmarshal([]byte(text), &feedback); err != nil {
		return AuditFeedback{}, fmt.Errorf("gemini json parse: %w (raw: %s)", err, string(text))
	}

	// Ensure status_logic is consistent with score
	if feedback.QualityScore < 80 {
		feedback.StatusLogic = "critical_alert"
	} else {
		feedback.StatusLogic = "approved"
	}

	return feedback, nil
}

func (s *Service) OwnerDashboard(ctx context.Context, actor Claims) (Dashboard, error) {
	if actor.Role != RoleOwner {
		return Dashboard{}, errors.New("forbidden")
	}
	projects, err := s.ListProjects(ctx, actor)
	if err != nil {
		return Dashboard{}, err
	}
	cards := make([]ProjectCard, 0, len(projects))
	openAlerts := 0
	budgetDelta := int64(0)
	for _, project := range projects {
		var totalTasks, completedTasks, avgQuality, dueDeliverables int
		_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*), COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END),0), COALESCE((SELECT AVG(quality_score) FROM evidences WHERE project_id = $1 AND status = 'approved'),0), COALESCE((SELECT COUNT(*) FROM deliverables WHERE project_id = $2 AND status != 'approved'),0) FROM tasks WHERE project_id = $3`, project.ID, project.ID, project.ID).Scan(&totalTasks, &completedTasks, &avgQuality, &dueDeliverables)
		progress := 0
		if totalTasks > 0 {
			progress = int(float64(completedTasks) / float64(totalTasks) * 100)
		}
		budgetConsumed := 0
		if project.BudgetTotalCents > 0 {
			budgetConsumed = int(float64(project.SpentTotalCents) / float64(project.BudgetTotalCents) * 100)
		}
		budgetDelta += project.SpentTotalCents - project.BudgetTotalCents
		var countAlerts int
		_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM quality_alerts WHERE project_id = $1 AND status = 'open'`, project.ID).Scan(&countAlerts)
		openAlerts += countAlerts
		if avgQuality == 0 {
			avgQuality = 100
		}
		cards = append(cards, ProjectCard{ID: project.ID, Name: project.Name, Status: project.Status, TimelineProgress: progress, BudgetConsumed: budgetConsumed, QualityScore: avgQuality, DeliverablesDue: dueDeliverables})
	}
	health := 100.0
	if len(cards) > 0 {
		total := 0
		for _, card := range cards {
			total += card.QualityScore
		}
		health = float64(total) / float64(len(cards))
	}
	variance := "0%"
	if len(projects) > 0 {
		variance = fmt.Sprintf("%+.1f%%", float64(budgetDelta)/1000000)
	}
	return Dashboard{ProductName: "ProjectPulse", Portfolio: Portfolio{ActiveProjects: len(projects), OpenAlerts: openAlerts, HealthScore: health, BudgetVariance: variance}, Projects: cards}, nil
}

func (s *Service) BudgetView(ctx context.Context, actor Claims, projectID string) (map[string]any, error) {
	project, err := s.projectByID(ctx, projectID)
	if err != nil {
		return nil, err
	}
	effect := s.permissionEffect(ctx, actor.Role, "budget.view")
	if effect == "deny" {
		return nil, errors.New("forbidden")
	}
	if actor.Role == RoleSupervisor || actor.Role == RoleClient {
		if err := s.ensureProjectAccess(ctx, actor, project); err != nil {
			return nil, err
		}
	}
	response := map[string]any{
		"project_id":         project.ID,
		"budget_total_cents": project.BudgetTotalCents,
		"spent_total_cents":  project.SpentTotalCents,
	}
	if actor.Role == RoleClient {
		response["summary_only"] = true
		response["budget_spent_percent"] = percent(project.SpentTotalCents, project.BudgetTotalCents)
		return response, nil
	}
	response["summary_only"] = false
	response["budget_spent_percent"] = percent(project.SpentTotalCents, project.BudgetTotalCents)
	return response, nil
}

func (s *Service) UpdateProject(ctx context.Context, actor Claims, projectID string, patch Project) (Project, error) {
	if actor.Role != RoleOwner && actor.Role != RoleSupervisor {
		return Project{}, errors.New("forbidden")
	}
	project, err := s.projectByID(ctx, projectID)
	if err != nil {
		return Project{}, err
	}
	if actor.TenantID != project.TenantID {
		return Project{}, errors.New("forbidden")
	}
	// Validate assigned users belong to same tenant
	if patch.SupervisorUserID != "" {
		var supTenant string
		if err := s.db.QueryRowContext(ctx, `SELECT tenant_id FROM users WHERE id = $1`, patch.SupervisorUserID).Scan(&supTenant); err != nil || supTenant != actor.TenantID {
			return Project{}, errors.New("supervisor must belong to same organization")
		}
	}
	if patch.ClientUserID != "" {
		var cliTenant string
		if err := s.db.QueryRowContext(ctx, `SELECT tenant_id FROM users WHERE id = $1`, patch.ClientUserID).Scan(&cliTenant); err != nil || cliTenant != actor.TenantID {
			return Project{}, errors.New("client must belong to same organization")
		}
	}
	now := nowText()
	_, err = s.db.ExecContext(ctx,
		`UPDATE projects SET name=$1, description=$2, status=$3, start_date=$4, planned_end_date=$5, supervisor_user_id=$6, client_user_id=$7, latitude_center=$8, longitude_center=$9, geofence_radius_m=$10, updated_at=$11 WHERE id=$12`,
		patch.Name, patch.Description, patch.Status, patch.StartDate, patch.PlannedEndDate,
		patch.SupervisorUserID, patch.ClientUserID,
		patch.LatitudeCenter, patch.LongitudeCenter, patch.GeofenceRadiusM,
		now, projectID,
	)
	if err != nil {
		return Project{}, err
	}
	return s.projectByID(ctx, projectID)
}

func (s *Service) UpdateProjectBudget(ctx context.Context, actor Claims, projectID string, budgetTotal, spentTotal int64) (Project, error) {
	if s.permissionEffect(ctx, actor.Role, "budget.manage") != "allow" {
		return Project{}, errors.New("forbidden")
	}
	if budgetTotal < 0 || spentTotal < 0 {
		return Project{}, errors.New("budget values cannot be negative")
	}
	project, err := s.projectByID(ctx, projectID)
	if err != nil {
		return Project{}, err
	}
	if actor.TenantID != project.TenantID {
		return Project{}, errors.New("forbidden")
	}
	_, err = s.db.ExecContext(ctx, `UPDATE projects SET budget_total_cents = $1, spent_total_cents = $2, updated_at = $3 WHERE id = $4`, budgetTotal, spentTotal, nowText(), projectID)
	if err != nil {
		return Project{}, err
	}
	return s.projectByID(ctx, projectID)
}

func (s *Service) ClientSummaryView(ctx context.Context, actor Claims, projectID string) (ClientSummary, error) {
	project, err := s.projectByID(ctx, projectID)
	if err != nil {
		return ClientSummary{}, err
	}
	if actor.Role == RoleClient {
		if err := s.ensureProjectAccess(ctx, actor, project); err != nil {
			return ClientSummary{}, err
		}
	}
	if actor.Role != RoleClient && actor.Role != RoleOwner && actor.Role != RoleSupervisor {
		return ClientSummary{}, errors.New("forbidden")
	}
	deliverables := make([]Deliverable, 0)
	rows, err := s.db.QueryContext(ctx, `SELECT id, tenant_id, project_id, task_id, title, description, due_date, status, client_visible FROM deliverables WHERE project_id = $1 AND client_visible = 1 ORDER BY due_date`, projectID)
	if err != nil {
		return ClientSummary{}, err
	}
	for rows.Next() {
		var deliverable Deliverable
		var visible int
		if err := rows.Scan(&deliverable.ID, &deliverable.TenantID, &deliverable.ProjectID, &deliverable.TaskID, &deliverable.Title, &deliverable.Description, &deliverable.DueDate, &deliverable.Status, &visible); err != nil {
			rows.Close()
			return ClientSummary{}, err
		}
		deliverable.ClientVisible = intToBool(visible)
		deliverables = append(deliverables, deliverable)
	}
	rows.Close()
	gallery, err := s.ClientGallery(ctx, actor, projectID)
	if err != nil {
		return ClientSummary{}, err
	}
	var totalTasks, completedTasks int
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*), COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END),0) FROM tasks WHERE project_id = $1`, projectID).Scan(&totalTasks, &completedTasks)
	progress := 0
	if totalTasks > 0 {
		progress = int(float64(completedTasks) / float64(totalTasks) * 100)
	}
	return ClientSummary{ProjectID: project.ID, ProjectName: project.Name, TimelineProgress: progress, BudgetSpentPercent: percent(project.SpentTotalCents, project.BudgetTotalCents), Deliverables: deliverables, Gallery: gallery}, nil
}

func (s *Service) ClientGallery(ctx context.Context, actor Claims, projectID string) ([]Evidence, error) {
	project, err := s.projectByID(ctx, projectID)
	if err != nil {
		return nil, err
	}
	if actor.Role == RoleClient {
		if err := s.ensureProjectAccess(ctx, actor, project); err != nil {
			return nil, err
		}
	}
	rows, err := s.db.QueryContext(ctx, `SELECT id, tenant_id, project_id, task_id, uploaded_by_user_id, approved_by_user_id, file_name, mime_type, file_size_bytes, url_archivo, status, latitude, longitude, metadata_exif, approval_comment, rejection_reason, is_visible_to_client, ai_processing_status, quality_score, created_at FROM evidences WHERE project_id = $1 AND status IN ('committed', 'approved') AND is_visible_to_client = 1 ORDER BY created_at DESC`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	evidenceList := make([]Evidence, 0)
	for rows.Next() {
		var evidence Evidence
		var visible int
		if err := rows.Scan(&evidence.ID, &evidence.TenantID, &evidence.ProjectID, &evidence.TaskID, &evidence.UploadedByUserID, &evidence.ApprovedByUserID, &evidence.FileName, &evidence.MimeType, &evidence.FileSizeBytes, &evidence.URLArchivo, &evidence.Status, &evidence.Latitude, &evidence.Longitude, &evidence.MetadataEXIF, &evidence.ApprovalComment, &evidence.RejectionReason, &visible, &evidence.AIProcessingStatus, &evidence.QualityScore, &evidence.CreatedAt); err != nil {
			return nil, err
		}
		evidence.VisibleToClient = intToBool(visible)
		evidenceList = append(evidenceList, evidence)
	}
	return evidenceList, rows.Err()
}

func (s *Service) EvidenceFile(ctx context.Context, actor Claims, evidenceID string) (io.ReadCloser, string, error) {
	var projectID, objectPath, mimeType string
	var visible int
	if err := s.db.QueryRowContext(ctx, `SELECT project_id, object_path, mime_type, is_visible_to_client FROM evidences WHERE id = $1 AND tenant_id = $2`, evidenceID, actor.TenantID).Scan(&projectID, &objectPath, &mimeType, &visible); err != nil {
		return nil, "", err
	}
	project, err := s.projectByID(ctx, projectID)
	if err != nil {
		return nil, "", err
	}
	switch actor.Role {
	case RoleOwner, RoleSupervisor:
		if err := s.ensureProjectAccess(ctx, actor, project); err != nil {
			return nil, "", err
		}
	case RoleHelper:
		// Helpers can view evidence they uploaded
		var uploaderID string
		if err := s.db.QueryRowContext(ctx, `SELECT uploaded_by_user_id FROM evidences WHERE id = $1`, evidenceID).Scan(&uploaderID); err != nil {
			return nil, "", err
		}
		if uploaderID != actor.UserID {
			return nil, "", errors.New("forbidden")
		}
	case RoleClient:
		if !intToBool(visible) {
			return nil, "", errors.New("forbidden")
		}
		if err := s.ensureProjectAccess(ctx, actor, project); err != nil {
			return nil, "", err
		}
	default:
		return nil, "", errors.New("forbidden")
	}
	rc, err := s.storage.Open(ctx, objectPath)
	return rc, mimeType, err
}

func (s *Service) ExportProjectCSV(ctx context.Context, actor Claims, projectID string) ([]byte, error) {
	if s.permissionEffect(ctx, actor.Role, "export.csv") == "deny" {
		return nil, errors.New("forbidden")
	}
	project, err := s.projectByID(ctx, projectID)
	if err != nil {
		return nil, err
	}
	if err := s.ensureProjectAccess(ctx, actor, project); err != nil {
		return nil, err
	}
	buf := &bytes.Buffer{}
	writer := csv.NewWriter(buf)
	_ = writer.Write([]string{"project_id", "project_name", "task_title", "task_status", "task_budget_cents", "task_spent_cents", "deliverable_title", "deliverable_status"})
	rows, err := s.db.QueryContext(ctx, `SELECT t.title, t.status, t.budget_cents, t.spent_cents, d.title, d.status FROM tasks t LEFT JOIN deliverables d ON d.task_id = t.id WHERE t.project_id = $1 ORDER BY t.created_at`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var taskTitle, taskStatus, deliverableTitle, deliverableStatus string
		var taskBudget, taskSpent int64
		if err := rows.Scan(&taskTitle, &taskStatus, &taskBudget, &taskSpent, &deliverableTitle, &deliverableStatus); err != nil {
			return nil, err
		}
		_ = writer.Write([]string{project.ID, project.Name, taskTitle, taskStatus, fmt.Sprintf("%d", taskBudget), fmt.Sprintf("%d", taskSpent), deliverableTitle, deliverableStatus})
	}
	writer.Flush()
	return buf.Bytes(), writer.Error()
}

func percent(numerator, denominator int64) int {
	if denominator <= 0 {
		return 0
	}
	return int(float64(numerator) / float64(denominator) * 100)
}

func parseTime(value string) time.Time {
	parsed, _ := time.Parse(time.RFC3339, value)
	return parsed
}

func (s *Service) DemoDashboard(ctx context.Context) (Dashboard, error) {
	var userID string
	if err := s.db.QueryRowContext(ctx, `SELECT id FROM users WHERE email = $1`, "owner@demo.local").Scan(&userID); err != nil {
		return Dashboard{}, err
	}
	return s.OwnerDashboard(ctx, Claims{UserID: userID, TenantID: demoTenantID(ctx, s.db), Role: RoleOwner, Email: "owner@demo.local"})
}

func demoTenantID(ctx context.Context, db *sql.DB) string {
	var tenantID string
	_ = db.QueryRowContext(ctx, `SELECT tenant_id FROM users WHERE email = $1`, "owner@demo.local").Scan(&tenantID)
	return tenantID
}

func fileExtension(name string) string {
	if idx := strings.LastIndex(name, "."); idx >= 0 && idx < len(name)-1 {
		return name[idx:]
	}
	return ""
}

func mimeTypeForBlueprint(fileType string) string {
	switch strings.ToLower(strings.TrimPrefix(fileType, ".")) {
	case "pdf":
		return "application/pdf"
	case "png":
		return "image/png"
	case "jpg", "jpeg":
		return "image/jpeg"
	case "webp":
		return "image/webp"
	case "svg":
		return "image/svg+xml"
	case "dxf":
		return "image/vnd.dxf"
	case "dwg":
		return "application/acad"
	default:
		return "application/octet-stream"
	}
}

func (s *Service) ListProjectTasks(ctx context.Context, actor Claims, projectID string) ([]Task, error) {
	project, err := s.projectByID(ctx, projectID)
	if err != nil {
		return nil, err
	}
	if actor.Role == RoleHelper {
		return nil, errors.New("forbidden")
	}
	if err := s.ensureProjectAccess(ctx, actor, project); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT id, tenant_id, project_id, title, description, assigned_to_user_id, status, start_date, end_date, predecessor_task_id, expected_finish_quality, technical_spec_text, budget_cents, spent_cents, progress_percent, comparison_photo_url FROM tasks WHERE project_id = $1 ORDER BY created_at`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	tasks := make([]Task, 0)
	for rows.Next() {
		var task Task
		if err := rows.Scan(&task.ID, &task.TenantID, &task.ProjectID, &task.Title, &task.Description, &task.AssignedToUserID, &task.Status, &task.StartDate, &task.EndDate, &task.PredecessorTaskID, &task.ExpectedFinishQuality, &task.TechnicalSpecText, &task.BudgetCents, &task.SpentCents, &task.ProgressPercent, &task.ComparisonPhotoURL); err != nil {
			return nil, err
		}
		tasks = append(tasks, task)
	}
	return tasks, rows.Err()
}

func (s *Service) ListProjectDeliverables(ctx context.Context, actor Claims, projectID string) ([]Deliverable, error) {
	project, err := s.projectByID(ctx, projectID)
	if err != nil {
		return nil, err
	}
	if actor.Role == RoleHelper {
		return nil, errors.New("forbidden")
	}
	if actor.Role != RoleOwner {
		if err := s.ensureProjectAccess(ctx, actor, project); err != nil {
			return nil, err
		}
	}
	rows, err := s.db.QueryContext(ctx, `SELECT id, tenant_id, project_id, task_id, title, description, due_date, status, client_visible FROM deliverables WHERE project_id = $1 ORDER BY due_date`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	deliverables := make([]Deliverable, 0)
	for rows.Next() {
		var deliverable Deliverable
		var clientVisible int
		if err := rows.Scan(&deliverable.ID, &deliverable.TenantID, &deliverable.ProjectID, &deliverable.TaskID, &deliverable.Title, &deliverable.Description, &deliverable.DueDate, &deliverable.Status, &clientVisible); err != nil {
			return nil, err
		}
		deliverable.ClientVisible = intToBool(clientVisible)
		deliverables = append(deliverables, deliverable)
	}
	return deliverables, rows.Err()
}

func (s *Service) ListExpenses(ctx context.Context, actor Claims, projectID string) ([]Expense, error) {
	project, err := s.projectByID(ctx, projectID)
	if err != nil {
		return nil, err
	}
	if err := s.ensureProjectAccess(ctx, actor, project); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT id, tenant_id, project_id, task_id, title, amount_cents, category, vendor, status, evidence_id, uploaded_by_user_id, date, created_at FROM expenses WHERE project_id = $1 ORDER BY date DESC`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	expenses := make([]Expense, 0)
	for rows.Next() {
		var exp Expense
		if err := rows.Scan(&exp.ID, &exp.TenantID, &exp.ProjectID, &exp.TaskID, &exp.Title, &exp.AmountCents, &exp.Category, &exp.Vendor, &exp.Status, &exp.EvidenceID, &exp.UploadedByUserID, &exp.Date, &exp.CreatedAt); err != nil {
			return nil, err
		}
		expenses = append(expenses, exp)
	}
	return expenses, rows.Err()
}

func (s *Service) expenseByID(ctx context.Context, expenseID string) (Expense, error) {
	var exp Expense
	err := s.db.QueryRowContext(ctx, `SELECT id, tenant_id, project_id, task_id, title, amount_cents, category, vendor, status, evidence_id, uploaded_by_user_id, date, created_at FROM expenses WHERE id = $1`, expenseID).
		Scan(&exp.ID, &exp.TenantID, &exp.ProjectID, &exp.TaskID, &exp.Title, &exp.AmountCents, &exp.Category, &exp.Vendor, &exp.Status, &exp.EvidenceID, &exp.UploadedByUserID, &exp.Date, &exp.CreatedAt)
	return exp, err
}

func (s *Service) CreateExpense(ctx context.Context, actor Claims, exp Expense) (Expense, error) {
	if strings.TrimSpace(exp.Title) == "" {
		return Expense{}, errors.New("expense title is required")
	}
	if exp.AmountCents <= 0 {
		return Expense{}, errors.New("amount must be greater than zero")
	}
	project, err := s.projectByID(ctx, exp.ProjectID)
	if err != nil {
		return Expense{}, err
	}
	if actor.Role != RoleOwner && actor.Role != RoleSupervisor {
		return Expense{}, errors.New("forbidden")
	}
	if err := s.ensureProjectAccess(ctx, actor, project); err != nil {
		return Expense{}, err
	}
	exp.ID = newID("exp")
	exp.TenantID = project.TenantID
	if exp.Status == "" {
		exp.Status = "pending"
	}
	now := nowText()
	exp.CreatedAt = now
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Expense{}, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `INSERT INTO expenses (id, tenant_id, project_id, task_id, title, amount_cents, category, vendor, status, evidence_id, uploaded_by_user_id, date, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`, exp.ID, exp.TenantID, exp.ProjectID, exp.TaskID, exp.Title, exp.AmountCents, exp.Category, exp.Vendor, exp.Status, exp.EvidenceID, actor.UserID, exp.Date, exp.CreatedAt); err != nil {
		return Expense{}, err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE projects SET spent_total_cents = spent_total_cents + $1, updated_at = $2 WHERE id = $3`, exp.AmountCents, now, project.ID); err != nil {
		return Expense{}, err
	}
	if err := tx.Commit(); err != nil {
		return Expense{}, err
	}
	return exp, nil
}

func (s *Service) UpdateExpense(ctx context.Context, actor Claims, expenseID string, patch Expense) (Expense, error) {
	exp, err := s.expenseByID(ctx, expenseID)
	if err != nil {
		return Expense{}, err
	}
	project, err := s.projectByID(ctx, exp.ProjectID)
	if err != nil {
		return Expense{}, err
	}
	if actor.Role != RoleOwner && actor.Role != RoleSupervisor {
		return Expense{}, errors.New("forbidden")
	}
	if err := s.ensureProjectAccess(ctx, actor, project); err != nil {
		return Expense{}, err
	}
	oldAmount := exp.AmountCents
	if patch.Title != "" {
		exp.Title = patch.Title
	}
	if patch.AmountCents != 0 || exp.AmountCents == 0 {
		exp.AmountCents = patch.AmountCents
	}
	if patch.Category != "" {
		exp.Category = patch.Category
	}
	if patch.Vendor != "" {
		exp.Vendor = patch.Vendor
	}
	if patch.Status != "" {
		exp.Status = patch.Status
	}
	if patch.Date != "" {
		exp.Date = patch.Date
	}
	if patch.TaskID != "" {
		exp.TaskID = patch.TaskID
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Expense{}, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `UPDATE expenses SET task_id = $1, title = $2, amount_cents = $3, category = $4, vendor = $5, status = $6, date = $7 WHERE id = $8`,
		exp.TaskID, exp.Title, exp.AmountCents, exp.Category, exp.Vendor, exp.Status, exp.Date, expenseID); err != nil {
		return Expense{}, err
	}
	delta := exp.AmountCents - oldAmount
	if delta != 0 {
		if _, err := tx.ExecContext(ctx, `UPDATE projects SET spent_total_cents = spent_total_cents + $1, updated_at = $2 WHERE id = $3`, delta, nowText(), project.ID); err != nil {
			return Expense{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return Expense{}, err
	}
	return s.expenseByID(ctx, expenseID)
}

func (s *Service) DeleteExpense(ctx context.Context, actor Claims, expenseID string) error {
	exp, err := s.expenseByID(ctx, expenseID)
	if err != nil {
		return err
	}
	project, err := s.projectByID(ctx, exp.ProjectID)
	if err != nil {
		return err
	}
	if actor.Role != RoleOwner && actor.Role != RoleSupervisor {
		return errors.New("forbidden")
	}
	if err := s.ensureProjectAccess(ctx, actor, project); err != nil {
		return err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM expenses WHERE id = $1`, expenseID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE projects SET spent_total_cents = spent_total_cents - $1, updated_at = $2 WHERE id = $3`, exp.AmountCents, nowText(), project.ID); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Service) ListDailyLogs(ctx context.Context, actor Claims, projectID string) ([]DailyLog, error) {
	project, err := s.projectByID(ctx, projectID)
	if err != nil {
		return nil, err
	}
	if err := s.ensureProjectAccess(ctx, actor, project); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT id, tenant_id, project_id, date, weather, headcount, manpower_json, narrative, accidents, status, uploaded_by_user_id, created_at FROM daily_logs WHERE project_id = $1 ORDER BY date DESC`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	logs := make([]DailyLog, 0)
	for rows.Next() {
		var log DailyLog
		if err := rows.Scan(&log.ID, &log.TenantID, &log.ProjectID, &log.Date, &log.Weather, &log.Headcount, &log.ManpowerJSON, &log.Narrative, &log.Accidents, &log.Status, &log.UploadedByUserID, &log.CreatedAt); err != nil {
			return nil, err
		}
		logs = append(logs, log)
	}
	return logs, rows.Err()
}

func (s *Service) dailyLogByID(ctx context.Context, logID string) (DailyLog, error) {
	var log DailyLog
	err := s.db.QueryRowContext(ctx, `SELECT id, tenant_id, project_id, date, weather, headcount, manpower_json, narrative, accidents, status, uploaded_by_user_id, created_at FROM daily_logs WHERE id = $1`, logID).
		Scan(&log.ID, &log.TenantID, &log.ProjectID, &log.Date, &log.Weather, &log.Headcount, &log.ManpowerJSON, &log.Narrative, &log.Accidents, &log.Status, &log.UploadedByUserID, &log.CreatedAt)
	return log, err
}

func (s *Service) CreateDailyLog(ctx context.Context, actor Claims, log DailyLog) (DailyLog, error) {
	if strings.TrimSpace(log.Date) == "" {
		return DailyLog{}, errors.New("date is required")
	}
	project, err := s.projectByID(ctx, log.ProjectID)
	if err != nil {
		return DailyLog{}, err
	}
	if actor.Role != RoleOwner && actor.Role != RoleSupervisor {
		return DailyLog{}, errors.New("forbidden")
	}
	if err := s.ensureProjectAccess(ctx, actor, project); err != nil {
		return DailyLog{}, err
	}
	log.ID = newID("log")
	log.TenantID = project.TenantID
	if log.Status == "" {
		log.Status = "submitted"
	}
	log.CreatedAt = nowText()
	_, err = s.db.ExecContext(ctx, `INSERT INTO daily_logs (id, tenant_id, project_id, date, weather, headcount, manpower_json, narrative, accidents, status, uploaded_by_user_id, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`, log.ID, log.TenantID, log.ProjectID, log.Date, log.Weather, log.Headcount, log.ManpowerJSON, log.Narrative, log.Accidents, log.Status, actor.UserID, log.CreatedAt)
	return log, err
}

func (s *Service) UpdateDailyLog(ctx context.Context, actor Claims, logID string, patch DailyLog) (DailyLog, error) {
	log, err := s.dailyLogByID(ctx, logID)
	if err != nil {
		return DailyLog{}, err
	}
	project, err := s.projectByID(ctx, log.ProjectID)
	if err != nil {
		return DailyLog{}, err
	}
	if actor.Role != RoleOwner && actor.Role != RoleSupervisor {
		return DailyLog{}, errors.New("forbidden")
	}
	if err := s.ensureProjectAccess(ctx, actor, project); err != nil {
		return DailyLog{}, err
	}
	if patch.Date != "" {
		log.Date = patch.Date
	}
	if patch.Weather != "" {
		log.Weather = patch.Weather
	}
	if patch.Headcount != 0 || log.Headcount == 0 {
		log.Headcount = patch.Headcount
	}
	if patch.Narrative != "" {
		log.Narrative = patch.Narrative
	}
	if patch.Accidents != "" || patch.Accidents == "" {
		log.Accidents = patch.Accidents
	}
	if patch.Status != "" {
		log.Status = patch.Status
	}
	if patch.ManpowerJSON != "" {
		log.ManpowerJSON = patch.ManpowerJSON
	}
	_, err = s.db.ExecContext(ctx, `UPDATE daily_logs SET date = $1, weather = $2, headcount = $3, narrative = $4, accidents = $5, status = $6, manpower_json = $7 WHERE id = $8`,
		log.Date, log.Weather, log.Headcount, log.Narrative, log.Accidents, log.Status, log.ManpowerJSON, logID)
	if err != nil {
		return DailyLog{}, err
	}
	return s.dailyLogByID(ctx, logID)
}

func (s *Service) DeleteDailyLog(ctx context.Context, actor Claims, logID string) error {
	log, err := s.dailyLogByID(ctx, logID)
	if err != nil {
		return err
	}
	project, err := s.projectByID(ctx, log.ProjectID)
	if err != nil {
		return err
	}
	if actor.Role != RoleOwner && actor.Role != RoleSupervisor {
		return errors.New("forbidden")
	}
	if err := s.ensureProjectAccess(ctx, actor, project); err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `DELETE FROM daily_logs WHERE id = $1`, logID)
	return err
}

func normalizeMessageType(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	if value == "" {
		return "chat"
	}
	return value
}

func validMessageType(value string) bool {
	switch value {
	case "chat", "rfi", "announcement":
		return true
	default:
		return false
	}
}

func normalizeMessageStatus(value string) string {
	return strings.TrimSpace(strings.ToLower(value))
}

func validMessageStatus(value string) bool {
	switch value {
	case "unread", "read":
		return true
	default:
		return false
	}
}

func (s *Service) projectMessageParticipants(ctx context.Context, project Project) (map[string]struct{}, error) {
	participants := make(map[string]struct{})
	if project.SupervisorUserID != "" {
		participants[project.SupervisorUserID] = struct{}{}
	}
	if project.ClientUserID != "" {
		participants[project.ClientUserID] = struct{}{}
	}
	ownerRows, err := s.db.QueryContext(ctx, `SELECT id FROM users WHERE tenant_id = $1 AND role = $2`, project.TenantID, RoleOwner)
	if err != nil {
		return nil, err
	}
	defer ownerRows.Close()
	for ownerRows.Next() {
		var userID string
		if err := ownerRows.Scan(&userID); err != nil {
			return nil, err
		}
		participants[userID] = struct{}{}
	}
	if err := ownerRows.Err(); err != nil {
		return nil, err
	}
	taskRows, err := s.db.QueryContext(ctx, `SELECT DISTINCT assigned_to_user_id FROM tasks WHERE project_id = $1 AND assigned_to_user_id <> ''`, project.ID)
	if err != nil {
		return nil, err
	}
	defer taskRows.Close()
	for taskRows.Next() {
		var userID string
		if err := taskRows.Scan(&userID); err != nil {
			return nil, err
		}
		participants[userID] = struct{}{}
	}
	if err := taskRows.Err(); err != nil {
		return nil, err
	}
	return participants, nil
}

func (s *Service) ListProjectMessages(ctx context.Context, actor Claims, projectID string) ([]ProjectMessage, error) {
	project, err := s.projectByID(ctx, projectID)
	if err != nil {
		return nil, err
	}
	if err := s.ensureProjectAccess(ctx, actor, project); err != nil {
		return nil, err
	}
	query := `SELECT id, tenant_id, project_id, from_user_id, to_user_id, text, type, status, created_at FROM project_messages WHERE project_id = $1 ORDER BY created_at ASC`
	args := []any{projectID}
	if actor.Role != RoleOwner && actor.Role != RoleSupervisor {
		query = `SELECT id, tenant_id, project_id, from_user_id, to_user_id, text, type, status, created_at
			FROM project_messages
			WHERE project_id = $1 AND (to_user_id = '' OR from_user_id = $2 OR to_user_id = $2)
			ORDER BY created_at ASC`
		args = append(args, actor.UserID)
	}
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	msgs := make([]ProjectMessage, 0)
	for rows.Next() {
		var m ProjectMessage
		if err := rows.Scan(&m.ID, &m.TenantID, &m.ProjectID, &m.FromUserID, &m.ToUserID, &m.Text, &m.Type, &m.Status, &m.CreatedAt); err != nil {
			return nil, err
		}
		msgs = append(msgs, m)
	}
	return msgs, rows.Err()
}

func (s *Service) projectMessageByID(ctx context.Context, messageID string) (ProjectMessage, error) {
	var msg ProjectMessage
	err := s.db.QueryRowContext(ctx, `SELECT id, tenant_id, project_id, from_user_id, to_user_id, text, type, status, created_at FROM project_messages WHERE id = $1`, messageID).
		Scan(&msg.ID, &msg.TenantID, &msg.ProjectID, &msg.FromUserID, &msg.ToUserID, &msg.Text, &msg.Type, &msg.Status, &msg.CreatedAt)
	return msg, err
}

func (s *Service) SendProjectMessage(ctx context.Context, actor Claims, msg ProjectMessage) (ProjectMessage, error) {
	msg.Text = strings.TrimSpace(msg.Text)
	msg.Type = normalizeMessageType(msg.Type)
	msg.ToUserID = strings.TrimSpace(msg.ToUserID)
	if msg.Text == "" {
		return ProjectMessage{}, errors.New("message text is required")
	}
	if !validMessageType(msg.Type) {
		return ProjectMessage{}, errors.New("invalid message type")
	}
	project, err := s.projectByID(ctx, msg.ProjectID)
	if err != nil {
		return ProjectMessage{}, err
	}
	if err := s.ensureProjectAccess(ctx, actor, project); err != nil {
		return ProjectMessage{}, err
	}
	participants, err := s.projectMessageParticipants(ctx, project)
	if err != nil {
		return ProjectMessage{}, err
	}
	participants[actor.UserID] = struct{}{}
	if msg.ToUserID != "" {
		if _, ok := participants[msg.ToUserID]; !ok {
			return ProjectMessage{}, errors.New("recipient is not part of this project")
		}
		if msg.Type == "announcement" {
			return ProjectMessage{}, errors.New("announcement messages must use the project channel")
		}
	}
	msg.ID = newID("msg")
	msg.TenantID = project.TenantID
	msg.FromUserID = actor.UserID
	if msg.Status == "" {
		if msg.ToUserID == "" {
			msg.Status = "read"
		} else {
			msg.Status = "unread"
		}
	}
	msg.Status = normalizeMessageStatus(msg.Status)
	if !validMessageStatus(msg.Status) {
		return ProjectMessage{}, errors.New("invalid message status")
	}
	msg.CreatedAt = nowText()
	_, err = s.db.ExecContext(ctx, `INSERT INTO project_messages (id, tenant_id, project_id, from_user_id, to_user_id, text, type, status, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, msg.ID, msg.TenantID, msg.ProjectID, msg.FromUserID, msg.ToUserID, msg.Text, msg.Type, msg.Status, msg.CreatedAt)
	return msg, err
}

func (s *Service) UpdateProjectMessage(ctx context.Context, actor Claims, messageID string, patch ProjectMessage) (ProjectMessage, error) {
	msg, err := s.projectMessageByID(ctx, messageID)
	if err != nil {
		return ProjectMessage{}, err
	}
	project, err := s.projectByID(ctx, msg.ProjectID)
	if err != nil {
		return ProjectMessage{}, err
	}
	if err := s.ensureProjectAccess(ctx, actor, project); err != nil {
		return ProjectMessage{}, err
	}
	canManageContent := actor.Role == RoleOwner || actor.Role == RoleSupervisor || actor.UserID == msg.FromUserID
	canManageReadState := actor.Role == RoleOwner || actor.Role == RoleSupervisor || actor.UserID == msg.ToUserID
	if !canManageContent && !canManageReadState {
		return ProjectMessage{}, errors.New("forbidden")
	}
	if patch.Text != "" {
		if !canManageContent {
			return ProjectMessage{}, errors.New("forbidden")
		}
		trimmed := strings.TrimSpace(patch.Text)
		if trimmed == "" {
			return ProjectMessage{}, errors.New("message text is required")
		}
		msg.Text = trimmed
	}
	if patch.Type != "" {
		if !canManageContent {
			return ProjectMessage{}, errors.New("forbidden")
		}
		msg.Type = normalizeMessageType(patch.Type)
		if !validMessageType(msg.Type) {
			return ProjectMessage{}, errors.New("invalid message type")
		}
		if msg.Type == "announcement" && msg.ToUserID != "" {
			return ProjectMessage{}, errors.New("announcement messages must use the project channel")
		}
	}
	if patch.Status != "" {
		if !canManageReadState {
			return ProjectMessage{}, errors.New("forbidden")
		}
		if msg.ToUserID == "" {
			return ProjectMessage{}, errors.New("project channel messages do not track read state")
		}
		msg.Status = normalizeMessageStatus(patch.Status)
		if !validMessageStatus(msg.Status) {
			return ProjectMessage{}, errors.New("invalid message status")
		}
	}
	_, err = s.db.ExecContext(ctx, `UPDATE project_messages SET text = $1, type = $2, status = $3 WHERE id = $4`, msg.Text, msg.Type, msg.Status, messageID)
	if err != nil {
		return ProjectMessage{}, err
	}
	return s.projectMessageByID(ctx, messageID)
}

func (s *Service) DeleteProjectMessage(ctx context.Context, actor Claims, messageID string) error {
	msg, err := s.projectMessageByID(ctx, messageID)
	if err != nil {
		return err
	}
	project, err := s.projectByID(ctx, msg.ProjectID)
	if err != nil {
		return err
	}
	if err := s.ensureProjectAccess(ctx, actor, project); err != nil {
		return err
	}
	if actor.Role != RoleOwner && actor.Role != RoleSupervisor && actor.UserID != msg.FromUserID {
		return errors.New("forbidden")
	}
	_, err = s.db.ExecContext(ctx, `DELETE FROM project_messages WHERE id = $1`, messageID)
	return err
}

func (s *Service) ListBudgetAdjustments(ctx context.Context, actor Claims, projectID string) ([]BudgetAdjustment, error) {
	project, err := s.projectByID(ctx, projectID)
	if err != nil {
		return nil, err
	}
	if err := s.ensureProjectAccess(ctx, actor, project); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT id, tenant_id, project_id, amount_cents, reason, approved_by_user_id, date, created_at FROM budget_adjustments WHERE project_id = $1 ORDER BY date DESC`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	adjustments := make([]BudgetAdjustment, 0)
	for rows.Next() {
		var ba BudgetAdjustment
		if err := rows.Scan(&ba.ID, &ba.TenantID, &ba.ProjectID, &ba.AmountCents, &ba.Reason, &ba.ApprovedByUserID, &ba.Date, &ba.CreatedAt); err != nil {
			return nil, err
		}
		adjustments = append(adjustments, ba)
	}
	return adjustments, rows.Err()
}

func (s *Service) CreateBudgetAdjustment(ctx context.Context, actor Claims, ba BudgetAdjustment) (BudgetAdjustment, error) {
	project, err := s.projectByID(ctx, ba.ProjectID)
	if err != nil {
		return BudgetAdjustment{}, err
	}
	if actor.Role != RoleOwner {
		return BudgetAdjustment{}, errors.New("forbidden: only owners can adjust budget")
	}
	if actor.TenantID != project.TenantID {
		return BudgetAdjustment{}, errors.New("forbidden")
	}
	ba.ID = newID("adj")
	ba.TenantID = project.TenantID
	ba.ApprovedByUserID = actor.UserID
	ba.CreatedAt = nowText()
	if ba.Date == "" {
		ba.Date = nowText()[:10]
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return BudgetAdjustment{}, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `INSERT INTO budget_adjustments (id, tenant_id, project_id, amount_cents, reason, approved_by_user_id, date, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, ba.ID, ba.TenantID, ba.ProjectID, ba.AmountCents, ba.Reason, ba.ApprovedByUserID, ba.Date, ba.CreatedAt); err != nil {
		return BudgetAdjustment{}, err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE projects SET budget_total_cents = budget_total_cents + $1, updated_at = $2 WHERE id = $3`, ba.AmountCents, ba.CreatedAt, project.ID); err != nil {
		return BudgetAdjustment{}, err
	}
	if err := tx.Commit(); err != nil {
		return BudgetAdjustment{}, err
	}
	return ba, nil
}
