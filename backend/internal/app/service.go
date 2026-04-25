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
	"github.com/lib/pq"
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

func (s *Service) RegisterCompanyOwner(ctx context.Context, companyName, companySlug, ownerName, ownerEmail, password, industry string) (LoginResponse, error) {
	companyName = strings.TrimSpace(companyName)
	companySlug = strings.ToLower(strings.TrimSpace(companySlug))
	ownerName = strings.TrimSpace(ownerName)
	ownerEmail = strings.TrimSpace(strings.ToLower(ownerEmail))
	industry = strings.TrimSpace(strings.ToLower(industry))
	if industry == "" || !ValidIndustryKey(industry) {
		industry = PresetGeneric
	}
	if err := validateRegistration(companyName, companySlug, ownerName, ownerEmail, password); err != nil {
		return LoginResponse{}, err
	}
	passwordHash, err := HashPassword(password)
	if err != nil {
		return LoginResponse{}, err
	}
	tenant := Tenant{ID: newID("ten"), Name: companyName, Slug: companySlug, Industry: industry}
	user := User{ID: newID("usr"), TenantID: tenant.ID, Email: ownerEmail, FullName: ownerName, Role: RoleOwner}
	now := nowText()

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return LoginResponse{}, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `INSERT INTO tenants (id, name, slug, industry, created_at) VALUES ($1, $2, $3, $4, $5)`, tenant.ID, tenant.Name, tenant.Slug, tenant.Industry, now); err != nil {
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
	if ok, retryAfter := s.loginGuard.check(email); !ok {
		s.logger.Warn("login locked: too many failures", "email", email, "retry_after_seconds", int(retryAfter.Seconds()))
		return LoginResponse{}, errors.New("too many failed attempts; try again later")
	}
	row := s.db.QueryRowContext(ctx, `SELECT id, tenant_id, email, password_hash, full_name, role, email_verified, COALESCE(is_active, TRUE), deleted_at FROM users WHERE email = $1`, email)
	var user User
	var passwordHash string
	var deletedAt sql.NullString
	if err := row.Scan(&user.ID, &user.TenantID, &user.Email, &passwordHash, &user.FullName, &user.Role, &user.EmailVerified, &user.IsActive, &deletedAt); err != nil {
		s.loginGuard.recordFailure(email)
		return LoginResponse{}, errors.New("invalid credentials")
	}
	if err := ComparePassword(passwordHash, password); err != nil {
		s.loginGuard.recordFailure(email)
		s.logger.Warn("invalid login attempt", "email", email)
		return LoginResponse{}, errors.New("invalid credentials")
	}
	if !user.IsActive || deletedAt.Valid {
		s.loginGuard.recordFailure(email)
		s.logger.Warn("login blocked: inactive user", "email", email)
		return LoginResponse{}, errors.New("invalid credentials")
	}
	s.loginGuard.recordSuccess(email)
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

// validateManagedRole allows role promotion/demotion within a tenant, including
// to owner. The platform admin role is still forbidden — it is never tenant-
// scoped.
func validateManagedRole(role string) error {
	if role == RoleAdmin {
		return errors.New("cannot assign platform admin role")
	}
	if role != RoleOwner && role != RoleSupervisor && role != RoleHelper && role != RoleClient {
		return errors.New("invalid role")
	}
	return nil
}

// normalizeHexColor accepts strings like "#3B82F6", "3b82f6", "#abc" and returns
// the canonical lowercase 7-char form (#rrggbb). Empty input returns "" (meaning
// "clear the value"). Any non-hex input returns "" as well — callers should
// treat non-empty-but-invalid input as a validation error.
func normalizeHexColor(in string) string {
	s := strings.TrimSpace(in)
	if s == "" {
		return ""
	}
	s = strings.TrimPrefix(s, "#")
	if len(s) == 3 {
		s = string([]byte{s[0], s[0], s[1], s[1], s[2], s[2]})
	}
	if len(s) != 6 {
		return ""
	}
	for i := 0; i < 6; i++ {
		c := s[i]
		isHex := (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')
		if !isHex {
			return ""
		}
	}
	return "#" + strings.ToLower(s)
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
	return fmt.Sprintf("%s/app?invite=%s", baseURL, url.QueryEscape(token))
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

func (s *Service) LookupInvite(ctx context.Context, token string) (InviteLookupResponse, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return InviteLookupResponse{}, errors.New("invalid or expired invite")
	}
	var email, fullName, role, companyName, expiresAt string
	err := s.db.QueryRowContext(ctx, `
		SELECT u.email, u.full_name, u.role, t.name, v.expires_at
		FROM verifications v
		JOIN users u ON u.id = v.user_id
		JOIN tenants t ON t.id = v.tenant_id
		WHERE v.token = $1 AND v.type = 'account_setup'
	`, token).Scan(&email, &fullName, &role, &companyName, &expiresAt)
	if err != nil {
		return InviteLookupResponse{}, errors.New("invalid or expired invite")
	}
	if time.Now().UTC().After(parseTime(expiresAt)) {
		return InviteLookupResponse{}, errors.New("invalid or expired invite")
	}
	return InviteLookupResponse{
		Email:       email,
		FullName:    fullName,
		Role:        role,
		CompanyName: companyName,
		ExpiresAt:   expiresAt,
	}, nil
}

// RequestPasswordReset generates a 1h-TTL token for the given email, emails
// the reset link, and always returns nil error so callers can't enumerate
// valid accounts. Safe to call anonymously. Rate-limited by a simple
// in-memory best-effort check (see httpapi layer).
func (s *Service) RequestPasswordReset(ctx context.Context, email string) error {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" {
		return nil
	}
	var userID, tenantID, fullName string
	var isActive bool
	err := s.db.QueryRowContext(ctx, `SELECT id, tenant_id, full_name, COALESCE(is_active, TRUE) FROM users WHERE email = $1 AND deleted_at IS NULL`, email).Scan(&userID, &tenantID, &fullName, &isActive)
	if err != nil || !isActive {
		s.logger.Info("password_reset.requested_missing", "email", email)
		return nil
	}
	tok, err := GenerateSecureToken(32)
	if err != nil {
		return nil
	}
	expiresAt := time.Now().UTC().Add(1 * time.Hour).Format(time.RFC3339)
	_, _ = s.db.ExecContext(ctx, `DELETE FROM verifications WHERE user_id = $1 AND type = 'password_reset'`, userID)
	if _, err := s.db.ExecContext(ctx, `INSERT INTO verifications (id, tenant_id, user_id, type, token, expires_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`, newID("ver"), tenantID, userID, "password_reset", tok, expiresAt, nowText()); err != nil {
		return nil
	}
	baseURL := strings.TrimSuffix(s.cfg.PublicBase, "/")
	if baseURL == "" {
		baseURL = "http://localhost:1212"
	}
	resetURL := baseURL + "/app?reset=" + url.QueryEscape(tok)
	go func() {
		_ = s.mailer.Send(context.Background(), email, "ProjectPulse password reset", fmt.Sprintf("Hello %s,\n\nA password reset was requested for your ProjectPulse account. Click below to set a new password:\n%s\n\nThis link expires in 1 hour. If you did not request this, you can safely ignore this email.", fullName, resetURL))
	}()
	s.logger.Info("password_reset.requested", "user_id", userID, "tenant_id", tenantID)
	return nil
}

// LookupPasswordReset verifies a reset token and returns the associated email
// so the frontend can show "Resetting password for foo@bar". 404 if invalid.
func (s *Service) LookupPasswordReset(ctx context.Context, token string) (InviteLookupResponse, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return InviteLookupResponse{}, errors.New("invalid or expired reset link")
	}
	var email, fullName, role, companyName, expiresAt string
	err := s.db.QueryRowContext(ctx, `
		SELECT u.email, u.full_name, u.role, t.name, v.expires_at
		FROM verifications v
		JOIN users u ON u.id = v.user_id
		JOIN tenants t ON t.id = v.tenant_id
		WHERE v.token = $1 AND v.type = 'password_reset' AND u.deleted_at IS NULL
	`, token).Scan(&email, &fullName, &role, &companyName, &expiresAt)
	if err != nil {
		return InviteLookupResponse{}, errors.New("invalid or expired reset link")
	}
	if time.Now().UTC().After(parseTime(expiresAt)) {
		return InviteLookupResponse{}, errors.New("invalid or expired reset link")
	}
	return InviteLookupResponse{Email: email, FullName: fullName, Role: role, CompanyName: companyName, ExpiresAt: expiresAt}, nil
}

// CompletePasswordReset consumes a reset token and sets a new password. Also
// logs the user in immediately, mirroring CompleteAccountSetup behavior.
func (s *Service) CompletePasswordReset(ctx context.Context, token, password string) (LoginResponse, error) {
	token = strings.TrimSpace(token)
	password = strings.TrimSpace(password)
	if token == "" || password == "" {
		return LoginResponse{}, errors.New("missing required fields")
	}
	if err := validateAccountSetupPassword(password); err != nil {
		return LoginResponse{}, err
	}
	passwordHash, err := HashPassword(password)
	if err != nil {
		return LoginResponse{}, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return LoginResponse{}, err
	}
	defer tx.Rollback()
	var userID, tenantID, expiresAt string
	if err := tx.QueryRowContext(ctx,
		`DELETE FROM verifications WHERE token = $1 AND type = 'password_reset' RETURNING user_id, tenant_id, expires_at`,
		token,
	).Scan(&userID, &tenantID, &expiresAt); err != nil {
		return LoginResponse{}, errors.New("invalid or expired reset link")
	}
	if time.Now().UTC().After(parseTime(expiresAt)) {
		return LoginResponse{}, errors.New("reset link expired")
	}
	if _, err := tx.ExecContext(ctx, `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, passwordHash, userID); err != nil {
		return LoginResponse{}, err
	}
	// Invalidate any other outstanding reset tokens for the same user.
	if _, err := tx.ExecContext(ctx, `DELETE FROM verifications WHERE user_id = $1 AND type = 'password_reset'`, userID); err != nil {
		return LoginResponse{}, err
	}
	if err := tx.Commit(); err != nil {
		return LoginResponse{}, err
	}

	user, err := s.UserByID(ctx, userID)
	if err != nil {
		return LoginResponse{}, err
	}
	tokenStr, err := IssueToken(s.jwtSecret, user)
	if err != nil {
		return LoginResponse{}, err
	}
	s.logger.Info("password_reset.completed", "user_id", userID, "tenant_id", tenantID)
	return LoginResponse{AccessToken: tokenStr, User: user}, nil
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

	passwordHash, err := HashPassword(password)
	if err != nil {
		return LoginResponse{}, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return LoginResponse{}, err
	}
	defer tx.Rollback()
	var userID, tenantID, expiresAt string
	if err := tx.QueryRowContext(ctx,
		`DELETE FROM verifications WHERE token = $1 AND type = 'account_setup' RETURNING user_id, tenant_id, expires_at`,
		token,
	).Scan(&userID, &tenantID, &expiresAt); err != nil {
		return LoginResponse{}, errors.New("invalid or expired invite")
	}
	if time.Now().UTC().After(parseTime(expiresAt)) {
		return LoginResponse{}, errors.New("invite expired")
	}
	if _, err := tx.ExecContext(ctx, `UPDATE users SET password_hash = $1, email_verified = true WHERE id = $2`, passwordHash, userID); err != nil {
		return LoginResponse{}, err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM verifications WHERE user_id = $1 AND type IN ('account_setup', 'email_verification')`, userID); err != nil {
		return LoginResponse{}, err
	}
	if err := tx.Commit(); err != nil {
		return LoginResponse{}, err
	}

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
	if tenantID != actor.TenantID {
		return Blueprint{}, ErrForbidden
	}
	if status != "uploaded" || localPath == "" {
		return Blueprint{}, errors.New("upload not completed")
	}
	if err := s.CheckBlueprintQuota(ctx, tenantID); err != nil {
		return Blueprint{}, err
	}
	if err := s.CheckStorageQuota(ctx, tenantID, intendedSize); err != nil {
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
	if intendedSize > 200*1024*1024 {
		return UploadSession{}, errors.New("blueprint file exceeds 200 MB limit")
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
	// Per-tenant storage quota gate. See audit-findings.md F4.
	if err := s.CheckStorageQuota(ctx, actor.TenantID, intendedSize); err != nil {
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
	err := s.db.QueryRowContext(ctx, `SELECT id, tenant_id, email, full_name, role, COALESCE(is_active, TRUE) FROM users WHERE id = $1`, userID).Scan(&user.ID, &user.TenantID, &user.Email, &user.FullName, &user.Role, &user.IsActive)
	return user, err
}

func (s *Service) ListUsers(ctx context.Context, actor Claims) ([]User, error) {
	if actor.Role != RoleOwner && actor.Role != RoleSupervisor {
		return nil, errors.New("forbidden")
	}
	rows, err := s.db.QueryContext(ctx, `SELECT id, tenant_id, email, full_name, role, COALESCE(is_active, TRUE) FROM users WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY role, full_name`, actor.TenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	users := make([]User, 0)
	for rows.Next() {
		var user User
		if err := rows.Scan(&user.ID, &user.TenantID, &user.Email, &user.FullName, &user.Role, &user.IsActive); err != nil {
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

// AdminUpdateUser updates role/full_name/is_active for a user in the same tenant.
// Guards: only owner/admin can manage; can't modify self; can't demote the last
// active owner of a tenant.
func (s *Service) AdminUpdateUser(ctx context.Context, actor Claims, userID string, patch AdminUserPatch) (User, error) {
	if s.permissionEffect(ctx, actor.Role, "user.manage") != "allow" {
		return User{}, errors.New("forbidden")
	}
	target, err := s.UserByID(ctx, userID)
	if err != nil {
		return User{}, errors.New("user not found")
	}
	if target.TenantID != actor.TenantID {
		return User{}, errors.New("forbidden")
	}
	if target.ID == actor.UserID && patch.Role != nil && *patch.Role != actor.Role {
		return User{}, errors.New("you cannot change your own role")
	}
	if target.ID == actor.UserID && patch.IsActive != nil && !*patch.IsActive {
		return User{}, errors.New("you cannot deactivate yourself")
	}
	if patch.Role != nil {
		if err := validateManagedRole(*patch.Role); err != nil {
			return User{}, err
		}
		if target.Role == RoleOwner && *patch.Role != RoleOwner {
			var ownerCount int
			if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE tenant_id = $1 AND role = 'owner' AND is_active = TRUE AND deleted_at IS NULL`, actor.TenantID).Scan(&ownerCount); err != nil {
				return User{}, err
			}
			if ownerCount <= 1 {
				return User{}, errors.New("cannot demote the last active owner")
			}
		}
	}
	setClauses := []string{}
	args := []any{}
	i := 1
	if patch.Role != nil {
		setClauses = append(setClauses, fmt.Sprintf("role = $%d", i))
		args = append(args, *patch.Role)
		i++
	}
	if patch.FullName != nil {
		name := strings.TrimSpace(*patch.FullName)
		if name == "" {
			return User{}, errors.New("full_name cannot be empty")
		}
		setClauses = append(setClauses, fmt.Sprintf("full_name = $%d", i))
		args = append(args, name)
		i++
	}
	if patch.IsActive != nil {
		setClauses = append(setClauses, fmt.Sprintf("is_active = $%d", i))
		args = append(args, *patch.IsActive)
		i++
	}
	if len(setClauses) == 0 {
		return target, nil
	}
	setClauses = append(setClauses, "updated_at = NOW()")
	args = append(args, userID)
	query := fmt.Sprintf("UPDATE users SET %s WHERE id = $%d", strings.Join(setClauses, ", "), i)
	if _, err := s.db.ExecContext(ctx, query, args...); err != nil {
		return User{}, err
	}
	s.logger.Info("user.admin_updated", "actor_id", actor.UserID, "user_id", userID, "tenant_id", actor.TenantID)
	return s.UserByID(ctx, userID)
}

// ChangeOwnPassword lets an authenticated user rotate their own password. The
// current password is verified before the rotation; we return a generic error
// on mismatch so a timing/probe attack can't distinguish wrong-password from
// no-user-found.
func (s *Service) ChangeOwnPassword(ctx context.Context, actor Claims, currentPassword, newPassword string) error {
	if actor.UserID == "" {
		return errors.New("forbidden")
	}
	if err := validateAccountSetupPassword(newPassword); err != nil {
		return err
	}
	var hash string
	if err := s.db.QueryRowContext(ctx, `SELECT password_hash FROM users WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND is_active = TRUE`, actor.UserID, actor.TenantID).Scan(&hash); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return errors.New("user not found")
		}
		return err
	}
	if err := ComparePassword(hash, currentPassword); err != nil {
		return errors.New("current password is incorrect")
	}
	newHash, err := HashPassword(newPassword)
	if err != nil {
		return err
	}
	if _, err := s.db.ExecContext(ctx, `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, newHash, actor.UserID); err != nil {
		return err
	}
	s.logger.Info("user.password_self_change", "user_id", actor.UserID, "tenant_id", actor.TenantID)
	return nil
}

// AdminSetUserPassword hashes and stores a new password for a user in the
// same tenant. Used by owners for offline-bootstrapping or forced resets.
func (s *Service) AdminSetUserPassword(ctx context.Context, actor Claims, userID, password string) error {
	if s.permissionEffect(ctx, actor.Role, "user.manage") != "allow" {
		return errors.New("forbidden")
	}
	target, err := s.UserByID(ctx, userID)
	if err != nil {
		return errors.New("user not found")
	}
	if target.TenantID != actor.TenantID {
		return errors.New("forbidden")
	}
	if err := validateAccountSetupPassword(password); err != nil {
		return err
	}
	hash, err := HashPassword(password)
	if err != nil {
		return err
	}
	if _, err := s.db.ExecContext(ctx, `UPDATE users SET password_hash = $1, email_verified = true, updated_at = NOW() WHERE id = $2`, hash, userID); err != nil {
		return err
	}
	s.logger.Info("user.password_set_by_admin", "actor_id", actor.UserID, "user_id", userID, "tenant_id", actor.TenantID)
	return nil
}

// AdminDeleteUser soft-deletes a user: marks deleted_at, flips is_active.
// Keeps the row so FK references from projects/tasks/evidence stay intact.
func (s *Service) AdminDeleteUser(ctx context.Context, actor Claims, userID string) error {
	if s.permissionEffect(ctx, actor.Role, "user.manage") != "allow" {
		return errors.New("forbidden")
	}
	target, err := s.UserByID(ctx, userID)
	if err != nil {
		return errors.New("user not found")
	}
	if target.TenantID != actor.TenantID {
		return errors.New("forbidden")
	}
	if target.ID == actor.UserID {
		return errors.New("you cannot delete yourself")
	}
	if target.Role == RoleOwner {
		var ownerCount int
		if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE tenant_id = $1 AND role = 'owner' AND is_active = TRUE AND deleted_at IS NULL`, actor.TenantID).Scan(&ownerCount); err != nil {
			return err
		}
		if ownerCount <= 1 {
			return errors.New("cannot delete the last active owner")
		}
	}
	if _, err := s.db.ExecContext(ctx, `UPDATE users SET is_active = FALSE, deleted_at = NOW(), updated_at = NOW() WHERE id = $1`, userID); err != nil {
		return err
	}
	_, _ = s.db.ExecContext(ctx, `DELETE FROM verifications WHERE user_id = $1`, userID)
	s.logger.Info("user.deleted", "actor_id", actor.UserID, "user_id", userID, "tenant_id", actor.TenantID)
	return nil
}

// AdminResendInvite regenerates the invite token for a user that hasn't
// completed setup yet (email_verified=false). Returns a fresh invite URL.
func (s *Service) AdminResendInvite(ctx context.Context, actor Claims, userID string) (UserInviteResponse, error) {
	if s.permissionEffect(ctx, actor.Role, "user.manage") != "allow" {
		return UserInviteResponse{}, errors.New("forbidden")
	}
	target, err := s.UserByID(ctx, userID)
	if err != nil {
		return UserInviteResponse{}, errors.New("user not found")
	}
	if target.TenantID != actor.TenantID {
		return UserInviteResponse{}, errors.New("forbidden")
	}
	inviteToken, err := GenerateSecureToken(32)
	if err != nil {
		return UserInviteResponse{}, err
	}
	expiresAt := time.Now().UTC().Add(72 * time.Hour).Format(time.RFC3339)
	_, _ = s.db.ExecContext(ctx, `DELETE FROM verifications WHERE user_id = $1 AND type = 'account_setup'`, target.ID)
	if _, err := s.db.ExecContext(ctx, `INSERT INTO verifications (id, tenant_id, user_id, type, token, expires_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`, newID("ver"), target.TenantID, target.ID, "account_setup", inviteToken, expiresAt, nowText()); err != nil {
		return UserInviteResponse{}, err
	}
	inviteURL := s.inviteURLForToken(inviteToken)
	go func() {
		_ = s.mailer.Send(context.Background(), target.Email, "ProjectPulse account setup", fmt.Sprintf("Hello %s,\n\nYour ProjectPulse invite was re-sent. Activate your account here:\n%s\n\nThis link expires on %s UTC.", target.FullName, inviteURL, expiresAt))
	}()
	s.logger.Info("user.invite_resent", "actor_id", actor.UserID, "user_id", userID, "tenant_id", actor.TenantID)
	return UserInviteResponse{User: target, InviteURL: inviteURL, InviteExpiresAt: expiresAt}, nil
}

// NotificationPrefKeys is the fixed set of notification toggles exposed to
// users. Anything outside this list is rejected to keep storage bounded.
var NotificationPrefKeys = []string{
	"evidence_pending",
	"task_due",
	"deliverable_approved",
	"budget_alert",
	"weekly_summary",
	"critical_alerts",
}

func isValidNotificationKey(key string) bool {
	for _, k := range NotificationPrefKeys {
		if k == key {
			return true
		}
	}
	return false
}

// GetNotificationPrefs returns the caller's notification preferences. Keys
// never written default to true so new users see a sensible initial state.
func (s *Service) GetNotificationPrefs(ctx context.Context, userID string) (map[string]bool, error) {
	prefs := make(map[string]bool, len(NotificationPrefKeys))
	for _, k := range NotificationPrefKeys {
		prefs[k] = true
	}
	rows, err := s.db.QueryContext(ctx, `SELECT key, enabled FROM user_notification_preferences WHERE user_id = $1`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var key string
		var enabled bool
		if err := rows.Scan(&key, &enabled); err != nil {
			return nil, err
		}
		if _, ok := prefs[key]; ok {
			prefs[key] = enabled
		}
	}
	return prefs, rows.Err()
}

// UpdateNotificationPrefs upserts the provided keys for the caller.
func (s *Service) UpdateNotificationPrefs(ctx context.Context, userID string, patch map[string]bool) (map[string]bool, error) {
	for key := range patch {
		if !isValidNotificationKey(key) {
			return nil, fmt.Errorf("unknown notification key: %s", key)
		}
	}
	for key, enabled := range patch {
		if _, err := s.db.ExecContext(ctx, `
			INSERT INTO user_notification_preferences (user_id, key, enabled, updated_at)
			VALUES ($1, $2, $3, NOW())
			ON CONFLICT (user_id, key) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()
		`, userID, key, enabled); err != nil {
			return nil, err
		}
	}
	return s.GetNotificationPrefs(ctx, userID)
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

// GetCurrentTenant returns the tenant the caller belongs to, with full
// company-settings fields. Any authenticated tenant user may read it.
func (s *Service) GetCurrentTenant(ctx context.Context, actor Claims) (Tenant, error) {
	if actor.TenantID == "" {
		return Tenant{}, ErrForbidden
	}
	var t Tenant
	var suspendedAt sql.NullTime
	err := s.db.QueryRowContext(ctx, `SELECT id, name, slug, COALESCE(website,''), COALESCE(country,''), COALESCE(timezone,'UTC'), COALESCE(currency,'USD'), COALESCE(industry,'generic'), COALESCE(public_dashboard_enabled, TRUE), COALESCE(public_gallery_enabled, FALSE), COALESCE(logo_url,''), COALESCE(primary_color,''), COALESCE(secondary_color,''), suspended_at, COALESCE(suspension_reason,'') FROM tenants WHERE id = $1 AND deleted_at IS NULL`, actor.TenantID).Scan(&t.ID, &t.Name, &t.Slug, &t.Website, &t.Country, &t.Timezone, &t.Currency, &t.Industry, &t.PublicDashboardEnabled, &t.PublicGalleryEnabled, &t.LogoURL, &t.PrimaryColor, &t.SecondaryColor, &suspendedAt, &t.SuspensionReason)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Tenant{}, errors.New("tenant not found")
		}
		return Tenant{}, err
	}
	if suspendedAt.Valid {
		ts := suspendedAt.Time
		t.SuspendedAt = &ts
	}
	return t, nil
}

// UpdateCurrentTenant patches the caller's tenant. Only owner/admin may edit.
func (s *Service) UpdateCurrentTenant(ctx context.Context, actor Claims, patch TenantPatch) (Tenant, error) {
	if actor.TenantID == "" {
		return Tenant{}, ErrForbidden
	}
	if actor.Role != RoleOwner && actor.Role != RoleAdmin {
		return Tenant{}, ErrForbidden
	}
	sets := []string{}
	args := []any{}
	add := func(col string, val any) {
		args = append(args, val)
		sets = append(sets, fmt.Sprintf("%s = $%d", col, len(args)))
	}
	if patch.Name != nil {
		name := strings.TrimSpace(*patch.Name)
		if name == "" {
			return Tenant{}, errors.New("name cannot be empty")
		}
		add("name", name)
	}
	if patch.Website != nil {
		add("website", strings.TrimSpace(*patch.Website))
	}
	if patch.Country != nil {
		add("country", strings.TrimSpace(*patch.Country))
	}
	if patch.Timezone != nil {
		add("timezone", strings.TrimSpace(*patch.Timezone))
	}
	if patch.Currency != nil {
		add("currency", strings.TrimSpace(*patch.Currency))
	}
	if patch.Industry != nil {
		ind := strings.TrimSpace(strings.ToLower(*patch.Industry))
		if !ValidIndustryKey(ind) {
			return Tenant{}, errors.New("unknown industry; valid: generic, construction, manufacturing, field_service, facilities")
		}
		add("industry", ind)
	}
	if patch.PublicDashboardEnabled != nil {
		add("public_dashboard_enabled", *patch.PublicDashboardEnabled)
	}
	if patch.PublicGalleryEnabled != nil {
		add("public_gallery_enabled", *patch.PublicGalleryEnabled)
	}
	if patch.LogoURL != nil {
		add("logo_url", *patch.LogoURL)
	}
	if patch.PrimaryColor != nil {
		c := normalizeHexColor(*patch.PrimaryColor)
		if c == "" && strings.TrimSpace(*patch.PrimaryColor) != "" {
			return Tenant{}, errors.New("primary_color must be a hex color like #3b82f6")
		}
		add("primary_color", c)
	}
	if patch.SecondaryColor != nil {
		c := normalizeHexColor(*patch.SecondaryColor)
		if c == "" && strings.TrimSpace(*patch.SecondaryColor) != "" {
			return Tenant{}, errors.New("secondary_color must be a hex color like #8b5cf6")
		}
		add("secondary_color", c)
	}
	if len(sets) > 0 {
		sets = append(sets, "updated_at = NOW()")
		args = append(args, actor.TenantID)
		query := fmt.Sprintf("UPDATE tenants SET %s WHERE id = $%d", strings.Join(sets, ", "), len(args))
		if _, err := s.db.ExecContext(ctx, query, args...); err != nil {
			return Tenant{}, err
		}
		s.logger.Info("tenant.updated", "actor_id", actor.UserID, "tenant_id", actor.TenantID, "fields", len(sets)-1)
	}
	return s.GetCurrentTenant(ctx, actor)
}

// RequestTenantLogoUpload creates an upload session for a tenant logo image.
func (s *Service) RequestTenantLogoUpload(ctx context.Context, actor Claims, fileName, contentType string, intendedSize int64, baseURL string) (UploadSession, error) {
	if actor.TenantID == "" {
		return UploadSession{}, ErrForbidden
	}
	if actor.Role != RoleOwner && actor.Role != RoleAdmin {
		return UploadSession{}, ErrForbidden
	}
	allowed := map[string]bool{"image/png": true, "image/jpeg": true, "image/svg+xml": true, "image/webp": true}
	if !allowed[contentType] {
		return UploadSession{}, errors.New("unsupported image type; allowed: png, jpeg, svg, webp")
	}
	if intendedSize > 5*1024*1024 {
		return UploadSession{}, errors.New("logo must be under 5 MB")
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
	_, err = s.db.ExecContext(ctx, `INSERT INTO upload_sessions (id, tenant_id, project_id, task_id, requested_by_user_id, file_name, content_type, intended_size_bytes, latitude, longitude, upload_token, status, expires_at, created_at) VALUES ($1, $2, '', 'SYSTEM', $3, $4, $5, $6, 0, 0, $7, 'issued', $8, $9)`,
		sessionID, actor.TenantID, actor.UserID, fileNameSafe(fileName), contentType, intendedSize, token, expiresAt, nowText())
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

// ConfirmTenantLogo finalises a tenant logo upload and sets the logo_url on the tenant.
func (s *Service) ConfirmTenantLogo(ctx context.Context, actor Claims, sessionID string) (Tenant, error) {
	if actor.TenantID == "" {
		return Tenant{}, ErrForbidden
	}
	if actor.Role != RoleOwner && actor.Role != RoleAdmin {
		return Tenant{}, ErrForbidden
	}
	var us struct {
		TenantID string
		FileName string
		Status   string
	}
	err := s.db.QueryRowContext(ctx, `SELECT tenant_id, file_name, status FROM upload_sessions WHERE id = $1`, sessionID).Scan(&us.TenantID, &us.FileName, &us.Status)
	if err != nil {
		return Tenant{}, errors.New("upload session not found")
	}
	if us.TenantID != actor.TenantID {
		return Tenant{}, ErrForbidden
	}
	if us.Status != "uploaded" {
		return Tenant{}, errors.New("file has not been uploaded yet")
	}
	logoURL := "/uploads/" + us.FileName
	if _, err := s.db.ExecContext(ctx, `UPDATE tenants SET logo_url = $1, updated_at = NOW() WHERE id = $2`, logoURL, actor.TenantID); err != nil {
		return Tenant{}, err
	}
	if _, err := s.db.ExecContext(ctx, `UPDATE upload_sessions SET status = 'confirmed' WHERE id = $1`, sessionID); err != nil {
		s.logger.Warn("failed to confirm upload session", "session_id", sessionID, "err", err)
	}
	s.logger.Info("tenant.logo.updated", "actor_id", actor.UserID, "tenant_id", actor.TenantID, "logo_url", logoURL)
	return s.GetCurrentTenant(ctx, actor)
}

// RequestProjectLogoUpload creates an upload session for a project logo image.
func (s *Service) RequestProjectLogoUpload(ctx context.Context, actor Claims, projectID, fileName, contentType string, intendedSize int64, baseURL string) (UploadSession, error) {
	if actor.TenantID == "" {
		return UploadSession{}, ErrForbidden
	}
	if actor.Role != RoleOwner && actor.Role != RoleSupervisor && actor.Role != RoleAdmin {
		return UploadSession{}, ErrForbidden
	}
	project, err := s.projectByID(ctx, projectID)
	if err != nil {
		return UploadSession{}, err
	}
	if project.TenantID != actor.TenantID {
		return UploadSession{}, sql.ErrNoRows
	}
	allowed := map[string]bool{"image/png": true, "image/jpeg": true, "image/svg+xml": true, "image/webp": true}
	if !allowed[contentType] {
		return UploadSession{}, errors.New("unsupported image type; allowed: png, jpeg, svg, webp")
	}
	if intendedSize > 5*1024*1024 {
		return UploadSession{}, errors.New("logo must be under 5 MB")
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
	_, err = s.db.ExecContext(ctx, `INSERT INTO upload_sessions (id, tenant_id, project_id, task_id, requested_by_user_id, file_name, content_type, intended_size_bytes, latitude, longitude, upload_token, status, expires_at, created_at) VALUES ($1, $2, $3, 'SYSTEM', $4, $5, $6, $7, 0, 0, $8, 'issued', $9, $10)`,
		sessionID, actor.TenantID, projectID, actor.UserID, fileNameSafe(fileName), contentType, intendedSize, token, expiresAt, nowText())
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

// ConfirmProjectLogo finalises a project logo upload and sets the logo_url on the project.
func (s *Service) ConfirmProjectLogo(ctx context.Context, actor Claims, projectID, sessionID string) (Project, error) {
	if actor.TenantID == "" {
		return Project{}, ErrForbidden
	}
	if actor.Role != RoleOwner && actor.Role != RoleSupervisor && actor.Role != RoleAdmin {
		return Project{}, ErrForbidden
	}
	project, err := s.projectByID(ctx, projectID)
	if err != nil {
		return Project{}, err
	}
	if project.TenantID != actor.TenantID {
		return Project{}, sql.ErrNoRows
	}
	var us struct {
		TenantID  string
		ProjectID string
		FileName  string
		Status    string
	}
	err = s.db.QueryRowContext(ctx, `SELECT tenant_id, project_id, file_name, status FROM upload_sessions WHERE id = $1`, sessionID).Scan(&us.TenantID, &us.ProjectID, &us.FileName, &us.Status)
	if err != nil {
		return Project{}, errors.New("upload session not found")
	}
	if us.TenantID != actor.TenantID || us.ProjectID != projectID {
		return Project{}, ErrForbidden
	}
	if us.Status != "uploaded" {
		return Project{}, errors.New("file has not been uploaded yet")
	}
	logoURL := "/uploads/" + us.FileName
	if _, err := s.db.ExecContext(ctx, `UPDATE projects SET logo_url = $1, updated_at = NOW() WHERE id = $2`, logoURL, projectID); err != nil {
		return Project{}, err
	}
	if _, err := s.db.ExecContext(ctx, `UPDATE upload_sessions SET status = 'confirmed' WHERE id = $1`, sessionID); err != nil {
		s.logger.Warn("failed to confirm upload session", "session_id", sessionID, "err", err)
	}
	s.logger.Info("project.logo.updated", "actor_id", actor.UserID, "project_id", projectID, "logo_url", logoURL)
	return s.projectByID(ctx, projectID)
}

// UpdateProjectLogo sets or clears the project logo_url directly (no upload flow).
func (s *Service) UpdateProjectLogo(ctx context.Context, actor Claims, projectID, logoURL string) (Project, error) {
	if actor.TenantID == "" {
		return Project{}, ErrForbidden
	}
	if actor.Role != RoleOwner && actor.Role != RoleSupervisor && actor.Role != RoleAdmin {
		return Project{}, ErrForbidden
	}
	project, err := s.projectByID(ctx, projectID)
	if err != nil {
		return Project{}, err
	}
	if project.TenantID != actor.TenantID {
		return Project{}, sql.ErrNoRows
	}
	if _, err := s.db.ExecContext(ctx, `UPDATE projects SET logo_url = $1, updated_at = NOW() WHERE id = $2`, logoURL, projectID); err != nil {
		return Project{}, err
	}
	return s.projectByID(ctx, projectID)
}

// DeleteCurrentTenant soft-deletes the caller's tenant and blocks future
// logins. Only owner/admin can trigger this; actor must also pass the slug
// confirmation to avoid accidental deletion.
func (s *Service) DeleteCurrentTenant(ctx context.Context, actor Claims, confirmSlug string) error {
	if actor.TenantID == "" {
		return ErrForbidden
	}
	if actor.Role != RoleOwner && actor.Role != RoleAdmin {
		return ErrForbidden
	}
	var slug string
	if err := s.db.QueryRowContext(ctx, `SELECT slug FROM tenants WHERE id = $1 AND deleted_at IS NULL`, actor.TenantID).Scan(&slug); err != nil {
		return errors.New("tenant not found")
	}
	if strings.TrimSpace(confirmSlug) != slug {
		return errors.New("confirmation slug does not match")
	}
	if _, err := s.db.ExecContext(ctx, `UPDATE tenants SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`, actor.TenantID); err != nil {
		return err
	}
	if _, err := s.db.ExecContext(ctx, `UPDATE users SET is_active = FALSE, deleted_at = NOW(), updated_at = NOW() WHERE tenant_id = $1`, actor.TenantID); err != nil {
		return err
	}
	s.logger.Info("tenant.deleted", "actor_id", actor.UserID, "tenant_id", actor.TenantID)
	return nil
}

func (s *Service) ListTenants(ctx context.Context, actor Claims) ([]Tenant, error) {
	if err := s.requirePlatformAdmin(actor); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT id, name, slug, COALESCE(website,''), COALESCE(country,''), COALESCE(timezone,'UTC'), COALESCE(currency,'USD'), COALESCE(industry,'generic'), COALESCE(public_dashboard_enabled, TRUE), COALESCE(public_gallery_enabled, FALSE), COALESCE(logo_url,''), COALESCE(primary_color,''), COALESCE(secondary_color,''), suspended_at, COALESCE(suspension_reason,'') FROM tenants WHERE deleted_at IS NULL ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	tenants := make([]Tenant, 0)
	for rows.Next() {
		var tenant Tenant
		var suspendedAt sql.NullTime
		if err := rows.Scan(&tenant.ID, &tenant.Name, &tenant.Slug, &tenant.Website, &tenant.Country, &tenant.Timezone, &tenant.Currency, &tenant.Industry, &tenant.PublicDashboardEnabled, &tenant.PublicGalleryEnabled, &tenant.LogoURL, &tenant.PrimaryColor, &tenant.SecondaryColor, &suspendedAt, &tenant.SuspensionReason); err != nil {
			return nil, err
		}
		if suspendedAt.Valid {
			t := suspendedAt.Time
			tenant.SuspendedAt = &t
		}
		tenants = append(tenants, tenant)
	}
	return tenants, rows.Err()
}

// ImpersonateTenant mints a 1-hour magic-link token scoped to the target
// tenant's owner. Platform admin only. Used for support sessions where the
// operator needs to see exactly what the customer sees without asking for a
// password. The resulting JWT carries ImpersonatedBy=admin.UserID so downstream
// audit logs can attribute actions back to the real operator.
func (s *Service) ImpersonateTenant(ctx context.Context, actor Claims, tenantID string) (LoginResponse, error) {
	if err := s.requirePlatformAdmin(actor); err != nil {
		return LoginResponse{}, err
	}
	if tenantID == "" {
		return LoginResponse{}, errors.New("tenant_id required")
	}
	// Prefer owner; fall back to any active user if no owner exists.
	var target User
	err := s.db.QueryRowContext(ctx, `SELECT id, tenant_id, email, full_name, role, email_verified, is_active FROM users WHERE tenant_id = $1 AND role = 'owner' AND is_active = TRUE AND deleted_at IS NULL ORDER BY created_at LIMIT 1`, tenantID).
		Scan(&target.ID, &target.TenantID, &target.Email, &target.FullName, &target.Role, &target.EmailVerified, &target.IsActive)
	if errors.Is(err, sql.ErrNoRows) {
		err = s.db.QueryRowContext(ctx, `SELECT id, tenant_id, email, full_name, role, email_verified, is_active FROM users WHERE tenant_id = $1 AND is_active = TRUE AND deleted_at IS NULL ORDER BY created_at LIMIT 1`, tenantID).
			Scan(&target.ID, &target.TenantID, &target.Email, &target.FullName, &target.Role, &target.EmailVerified, &target.IsActive)
	}
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return LoginResponse{}, errors.New("no active user found for tenant")
		}
		return LoginResponse{}, err
	}
	token, err := IssueImpersonationToken(s.jwtSecret, target, actor.UserID)
	if err != nil {
		return LoginResponse{}, err
	}
	s.logger.Warn("admin.impersonation", "admin_id", actor.UserID, "admin_email", actor.Email, "target_tenant", tenantID, "target_user", target.ID, "target_email", target.Email)
	return LoginResponse{AccessToken: token, User: target}, nil
}

// SuspendTenant freezes a tenant: non-admin users lose write access and the
// tenant is flagged in the admin UI. Data is preserved. Reactivation is a
// simple NULL on suspended_at.
func (s *Service) SuspendTenant(ctx context.Context, actor Claims, tenantID, reason string) error {
	if err := s.requirePlatformAdmin(actor); err != nil {
		return err
	}
	if tenantID == "" {
		return errors.New("tenant_id required")
	}
	reason = strings.TrimSpace(reason)
	if len(reason) > 500 {
		reason = reason[:500]
	}
	res, err := s.db.ExecContext(ctx, `UPDATE tenants SET suspended_at = NOW(), suspension_reason = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL`, reason, tenantID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return errors.New("tenant not found")
	}
	s.logger.Warn("admin.tenant_suspended", "admin_id", actor.UserID, "tenant_id", tenantID, "reason", reason)
	return nil
}

// ReactivateTenant clears the suspension flag.
func (s *Service) ReactivateTenant(ctx context.Context, actor Claims, tenantID string) error {
	if err := s.requirePlatformAdmin(actor); err != nil {
		return err
	}
	if tenantID == "" {
		return errors.New("tenant_id required")
	}
	res, err := s.db.ExecContext(ctx, `UPDATE tenants SET suspended_at = NULL, suspension_reason = '', updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL`, tenantID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return errors.New("tenant not found")
	}
	s.logger.Info("admin.tenant_reactivated", "admin_id", actor.UserID, "tenant_id", tenantID)
	return nil
}

// IsTenantSuspended is a fast lookup used by middleware to block requests from
// suspended tenants. Returns (suspended, reason, err).
func (s *Service) IsTenantSuspended(ctx context.Context, tenantID string) (bool, string, error) {
	if tenantID == "" {
		return false, "", nil
	}
	var suspendedAt sql.NullTime
	var reason string
	err := s.db.QueryRowContext(ctx, `SELECT suspended_at, COALESCE(suspension_reason,'') FROM tenants WHERE id = $1`, tenantID).Scan(&suspendedAt, &reason)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, "", nil
		}
		return false, "", err
	}
	return suspendedAt.Valid, reason, nil
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
		rows, err = s.db.QueryContext(ctx, `SELECT id, tenant_id, name, description, status, client_user_id, supervisor_user_id, budget_total_cents, spent_total_cents, start_date, planned_end_date, latitude_center, longitude_center, geofence_radius_m, COALESCE(logo_url,''), COALESCE(daily_log_preset,'') FROM projects WHERE tenant_id = $1 ORDER BY created_at DESC`, actor.TenantID)
	case RoleSupervisor:
		rows, err = s.db.QueryContext(ctx, `SELECT id, tenant_id, name, description, status, client_user_id, supervisor_user_id, budget_total_cents, spent_total_cents, start_date, planned_end_date, latitude_center, longitude_center, geofence_radius_m, COALESCE(logo_url,''), COALESCE(daily_log_preset,'') FROM projects WHERE supervisor_user_id = $1 ORDER BY created_at DESC`, actor.UserID)
	case RoleClient:
		rows, err = s.db.QueryContext(ctx, `SELECT id, tenant_id, name, description, status, client_user_id, supervisor_user_id, budget_total_cents, spent_total_cents, start_date, planned_end_date, latitude_center, longitude_center, geofence_radius_m, COALESCE(logo_url,''), COALESCE(daily_log_preset,'') FROM projects WHERE client_user_id = $1 ORDER BY created_at DESC`, actor.UserID)
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
		if err := rows.Scan(&project.ID, &project.TenantID, &project.Name, &project.Description, &project.Status, &project.ClientUserID, &project.SupervisorUserID, &project.BudgetTotalCents, &project.SpentTotalCents, &project.StartDate, &project.PlannedEndDate, &project.LatitudeCenter, &project.LongitudeCenter, &project.GeofenceRadiusM, &project.LogoURL, &project.DailyLogPreset); err != nil {
			return nil, err
		}
		projects = append(projects, project)
	}
	return projects, rows.Err()
}

func (s *Service) projectByID(ctx context.Context, projectID string) (Project, error) {
	var project Project
	err := s.db.QueryRowContext(ctx, `SELECT id, tenant_id, name, description, status, client_user_id, supervisor_user_id, budget_total_cents, spent_total_cents, start_date, planned_end_date, latitude_center, longitude_center, geofence_radius_m, COALESCE(logo_url,''), COALESCE(daily_log_preset,'') FROM projects WHERE id = $1`, projectID).
		Scan(&project.ID, &project.TenantID, &project.Name, &project.Description, &project.Status, &project.ClientUserID, &project.SupervisorUserID, &project.BudgetTotalCents, &project.SpentTotalCents, &project.StartDate, &project.PlannedEndDate, &project.LatitudeCenter, &project.LongitudeCenter, &project.GeofenceRadiusM, &project.LogoURL, &project.DailyLogPreset)
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
	if err := s.RequireWriteAccess(ctx, actor.TenantID); err != nil {
		return Task{}, err
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
	if err := s.RequireWriteAccess(ctx, actor.TenantID); err != nil {
		return Task{}, Deliverable{}, err
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

// UpdateMyTaskProgress lets a helper bump the progress_percent of a task they
// are assigned to — used right after uploading evidence from the capture panel.
// Intentionally narrow: only progress_percent changes, and only on the helper's
// own task. Owners/supervisors go through UpdateTask or UpdateTaskTimeline.
func (s *Service) UpdateMyTaskProgress(ctx context.Context, actor Claims, taskID string, progressPercent int) (Task, error) {
	if actor.Role != RoleHelper {
		return Task{}, errors.New("forbidden")
	}
	if progressPercent < 0 || progressPercent > 100 {
		return Task{}, errors.New("progress_percent must be between 0 and 100")
	}
	if err := s.RequireWriteAccess(ctx, actor.TenantID); err != nil {
		return Task{}, err
	}
	task, err := s.taskByID(ctx, taskID)
	if err != nil {
		return Task{}, err
	}
	if task.TenantID != actor.TenantID || task.AssignedToUserID != actor.UserID {
		return Task{}, errors.New("forbidden")
	}
	if _, err := s.db.ExecContext(ctx, `UPDATE tasks SET progress_percent = $1, updated_at = $2 WHERE id = $3`, progressPercent, nowText(), taskID); err != nil {
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
	if intendedSize > 500*1024*1024 {
		return UploadSession{}, errors.New("file exceeds 500 MB limit")
	}
	// Per-tenant storage quota check before reserving an upload slot. See
	// audit-findings.md F4. CheckStorageQuota is a no-op for demo tenants and
	// for plans with MaxStorageBytes == -1 (Enterprise).
	if err := s.CheckStorageQuota(ctx, actor.TenantID, intendedSize); err != nil {
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
	var uploadToken, fileName, status, expiresAt, intendedContentType string
	var intendedSize int64
	if err := s.db.QueryRowContext(ctx, `SELECT upload_token, file_name, status, expires_at, intended_size_bytes, content_type FROM upload_sessions WHERE id = $1`, sessionID).Scan(&uploadToken, &fileName, &status, &expiresAt, &intendedSize, &intendedContentType); err != nil {
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
	// Enforce MIME whitelist: must match what was declared at RequestUpload (which
	// was already validated). If the PUT sends a different Content-Type, reject.
	effectiveCT := contentType
	if effectiveCT == "" {
		effectiveCT = intendedContentType
	}
	if !isAllowedUploadMIME(effectiveCT) {
		return fmt.Errorf("mime type not allowed: %s", effectiveCT)
	}
	// Cap the stream at the declared size + 1 so we detect oversends.
	limited := io.LimitReader(body, intendedSize+1)
	counting := &countingReader{r: limited}
	filePath, err := s.storage.Save(ctx, fmt.Sprintf("%s-%s", sessionID, fileNameSafe(fileName)), counting)
	if err != nil {
		return err
	}
	if counting.n > intendedSize {
		return fmt.Errorf("upload exceeds declared size: %d > %d", counting.n, intendedSize)
	}
	if _, err := s.db.ExecContext(ctx, `UPDATE upload_sessions SET status = $1, local_path = $2, content_type = $3 WHERE id = $4`, "uploaded", filePath, effectiveCT, sessionID); err != nil {
		return err
	}
	return nil
}

type countingReader struct {
	r io.Reader
	n int64
}

func (c *countingReader) Read(p []byte) (int, error) {
	n, err := c.r.Read(p)
	c.n += int64(n)
	return n, err
}

func isAllowedUploadMIME(ct string) bool {
	ct = strings.ToLower(strings.TrimSpace(strings.SplitN(ct, ";", 2)[0]))
	switch ct {
	case "image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif",
		"video/mp4", "video/quicktime", "video/webm",
		"application/pdf",
		"application/octet-stream",
		"application/vnd.dwg", "application/acad", "image/vnd.dwg", "application/dxf", "image/vnd.dxf",
		"model/gltf-binary", "model/gltf+json", "application/vnd.ms-pki.stl", "model/stl",
		"image/vnd.dwf", "application/vnd.dwf":
		return true
	}
	return false
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
	if tenantID != actor.TenantID {
		return Evidence{}, ErrForbidden
	}
	if status != "uploaded" || localPath == "" {
		return Evidence{}, errors.New("upload not completed")
	}
	// Enforce monthly capture quota and total storage quota before persisting.
	if err := s.CheckCaptureQuota(ctx, tenantID); err != nil {
		return Evidence{}, err
	}
	if err := s.CheckStorageQuota(ctx, tenantID, intendedSize); err != nil {
		return Evidence{}, err
	}
	isReference := strings.Contains(metadataEXIF, "comparison_reference")
	initialStatus := "pending_approval"
	initialAIStatus := "queued"
	if isReference {
		initialStatus = "committed"
		initialAIStatus = "not_requested"
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
		Status:             initialStatus,
		Latitude:           lat,
		Longitude:          lng,
		MetadataEXIF:       metadataEXIF,
		VisibleToClient:    false,
		AIProcessingStatus: initialAIStatus,
		CreatedAt:          nowText(),
	}
	evidence.URLArchivo = "/api/v1/files/" + evidence.ID
	_, err := s.db.ExecContext(ctx, `INSERT INTO evidences (id, tenant_id, project_id, task_id, uploaded_by_user_id, file_name, mime_type, file_size_bytes, object_path, url_archivo, status, latitude, longitude, metadata_exif, is_visible_to_client, ai_processing_status, quality_score, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`, evidence.ID, evidence.TenantID, evidence.ProjectID, evidence.TaskID, evidence.UploadedByUserID, evidence.FileName, evidence.MimeType, evidence.FileSizeBytes, localPath, evidence.URLArchivo, evidence.Status, evidence.Latitude, evidence.Longitude, evidence.MetadataEXIF, 0, evidence.AIProcessingStatus, 0, evidence.CreatedAt, evidence.CreatedAt)
	if err != nil {
		return Evidence{}, err
	}
	if _, err := s.db.ExecContext(ctx, `UPDATE upload_sessions SET status = $1 WHERE id = $2`, "confirmed", sessionID); err != nil {
		return Evidence{}, err
	}
	s.IncrementUsage(ctx, tenantID, "captures_per_month", 1)
	if !isReference {
		select {
		case s.auditJobs <- evidence.ID:
		default:
			log.Printf("audit queue full on upload, evidence %s will stay queued until manual trigger", evidence.ID)
		}
	}
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
	baseSelect := `SELECT e.id, e.tenant_id, e.project_id, e.task_id, e.uploaded_by_user_id, e.approved_by_user_id, e.file_name, e.mime_type, e.file_size_bytes, e.url_archivo, e.status, e.latitude, e.longitude, e.metadata_exif, e.approval_comment, e.rejection_reason, e.is_visible_to_client, e.ai_processing_status, e.quality_score, e.created_at,
		COALESCE(u.full_name, '') AS uploader_name,
		COALESCE(t.title, '') AS task_title,
		COALESCE(t.comparison_photo_url, '') AS reference_photo_url,
		COALESCE(ia.json_feedback, '') AS ai_feedback,
		COALESCE(ia.model_version, '') AS ai_model_version
		FROM evidences e
		LEFT JOIN users u ON u.id = e.uploaded_by_user_id
		LEFT JOIN tasks t ON t.id = e.task_id
		LEFT JOIN LATERAL (
			SELECT json_feedback, model_version FROM ia_audits WHERE evidence_id = e.id ORDER BY created_at DESC LIMIT 1
		) ia ON true`
	var taskEvidenceQuery string
	var taskEvidenceArgs []any
	switch actor.Role {
	case RoleClient:
		taskEvidenceQuery = baseSelect + ` WHERE e.task_id = $1 AND e.status IN ('committed', 'approved') AND e.is_visible_to_client = 1 AND COALESCE(e.metadata_exif, '') NOT LIKE '%comparison_reference%' ORDER BY e.created_at DESC`
		taskEvidenceArgs = []any{taskID}
	case RoleHelper:
		taskEvidenceQuery = baseSelect + ` WHERE e.task_id = $1 AND e.status IN ('pending_approval', 'approved', 'committed', 'rejected') AND COALESCE(e.metadata_exif, '') NOT LIKE '%comparison_reference%' ORDER BY e.created_at DESC`
		taskEvidenceArgs = []any{taskID}
	default:
		taskEvidenceQuery = baseSelect + ` WHERE e.task_id = $1 AND COALESCE(e.metadata_exif, '') NOT LIKE '%comparison_reference%' ORDER BY e.created_at DESC`
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
		var aiFeedback string
		if err := rows.Scan(&evidence.ID, &evidence.TenantID, &evidence.ProjectID, &evidence.TaskID, &evidence.UploadedByUserID, &evidence.ApprovedByUserID, &evidence.FileName, &evidence.MimeType, &evidence.FileSizeBytes, &evidence.URLArchivo, &evidence.Status, &evidence.Latitude, &evidence.Longitude, &evidence.MetadataEXIF, &evidence.ApprovalComment, &evidence.RejectionReason, &visible, &evidence.AIProcessingStatus, &evidence.QualityScore, &evidence.CreatedAt, &evidence.UploaderName, &evidence.TaskTitle, &evidence.ReferencePhotoURL, &aiFeedback, &evidence.AIModelVersion); err != nil {
			return nil, err
		}
		evidence.VisibleToClient = intToBool(visible)
		if aiFeedback != "" {
			evidence.AIFeedback = json.RawMessage(aiFeedback)
		}
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
	baseSelect := `SELECT e.id, e.tenant_id, e.project_id, e.task_id, e.uploaded_by_user_id, e.approved_by_user_id, e.file_name, e.mime_type, e.file_size_bytes, e.url_archivo, e.status, e.latitude, e.longitude, e.metadata_exif, e.approval_comment, e.rejection_reason, e.is_visible_to_client, e.ai_processing_status, e.quality_score, e.created_at,
		COALESCE(u.full_name, '') AS uploader_name,
		COALESCE(t.title, '') AS task_title,
		COALESCE(t.comparison_photo_url, '') AS reference_photo_url,
		COALESCE(ia.json_feedback, '') AS ai_feedback,
		COALESCE(ia.model_version, '') AS ai_model_version
		FROM evidences e
		LEFT JOIN users u ON u.id = e.uploaded_by_user_id
		LEFT JOIN tasks t ON t.id = e.task_id
		LEFT JOIN LATERAL (
			SELECT json_feedback, model_version FROM ia_audits WHERE evidence_id = e.id ORDER BY created_at DESC LIMIT 1
		) ia ON true`
	var projEvidenceQuery string
	switch actor.Role {
	case RoleClient:
		projEvidenceQuery = baseSelect + ` WHERE e.project_id = $1 AND e.status IN ('committed', 'approved') AND e.is_visible_to_client = 1 AND COALESCE(e.metadata_exif, '') NOT LIKE '%comparison_reference%' ORDER BY e.created_at DESC`
	case RoleHelper:
		projEvidenceQuery = baseSelect + ` WHERE e.project_id = $1 AND e.status IN ('pending_approval', 'approved', 'committed', 'rejected') AND COALESCE(e.metadata_exif, '') NOT LIKE '%comparison_reference%' ORDER BY e.created_at DESC`
	default:
		projEvidenceQuery = baseSelect + ` WHERE e.project_id = $1 AND COALESCE(e.metadata_exif, '') NOT LIKE '%comparison_reference%' ORDER BY e.created_at DESC`
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
		var aiFeedback string
		if err := rows.Scan(&evidence.ID, &evidence.TenantID, &evidence.ProjectID, &evidence.TaskID, &evidence.UploadedByUserID, &evidence.ApprovedByUserID, &evidence.FileName, &evidence.MimeType, &evidence.FileSizeBytes, &evidence.URLArchivo, &evidence.Status, &evidence.Latitude, &evidence.Longitude, &evidence.MetadataEXIF, &evidence.ApprovalComment, &evidence.RejectionReason, &visible, &evidence.AIProcessingStatus, &evidence.QualityScore, &evidence.CreatedAt, &evidence.UploaderName, &evidence.TaskTitle, &evidence.ReferencePhotoURL, &aiFeedback, &evidence.AIModelVersion); err != nil {
			return nil, err
		}
		evidence.VisibleToClient = intToBool(visible)
		if aiFeedback != "" {
			evidence.AIFeedback = json.RawMessage(aiFeedback)
		}
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
	// Idempotent approval: if AI audit already completed, preserve the score and DO NOT re-queue.
	// Re-queuing a completed audit would waste Gemini quota and could overwrite a valid score.
	alreadyAudited := evidence.AIProcessingStatus == "completed"
	if alreadyAudited {
		_, err = s.db.ExecContext(ctx, `UPDATE evidences SET status = $1, approved_by_user_id = $2, approval_comment = $3, is_visible_to_client = $4, updated_at = $5, approved_at = $6 WHERE id = $7`, "committed", actor.UserID, comment, boolToInt(visibleToClient), updatedAt, updatedAt, evidenceID)
	} else {
		_, err = s.db.ExecContext(ctx, `UPDATE evidences SET status = $1, approved_by_user_id = $2, approval_comment = $3, is_visible_to_client = $4, ai_processing_status = $5, updated_at = $6, approved_at = $7 WHERE id = $8`, "committed", actor.UserID, comment, boolToInt(visibleToClient), "queued", updatedAt, updatedAt, evidenceID)
	}
	if err != nil {
		return Evidence{}, err
	}
	if !alreadyAudited {
		select {
		case s.auditJobs <- evidenceID:
		default:
			log.Printf("audit queue full, evidence %s will remain in queued state for manual review", evidenceID)
		}
	}
	s.logger.Info("evidence.approved", "actor_id", actor.UserID, "tenant_id", actor.TenantID, "evidence_id", evidenceID, "project_id", evidence.ProjectID, "visible_to_client", visibleToClient, "re_audited", !alreadyAudited)
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
	var visible int
	var aiFeedback string
	err := s.db.QueryRowContext(ctx, `SELECT e.id, e.tenant_id, e.project_id, e.task_id, e.uploaded_by_user_id, e.approved_by_user_id, e.file_name, e.mime_type, e.file_size_bytes, e.url_archivo, e.status, e.latitude, e.longitude, e.metadata_exif, e.approval_comment, e.rejection_reason, e.is_visible_to_client, e.ai_processing_status, e.quality_score, e.created_at,
		COALESCE(u.full_name, '') AS uploader_name,
		COALESCE(t.title, '') AS task_title,
		COALESCE(t.comparison_photo_url, '') AS reference_photo_url,
		COALESCE(ia.json_feedback, '') AS ai_feedback,
		COALESCE(ia.model_version, '') AS ai_model_version
		FROM evidences e
		LEFT JOIN users u ON u.id = e.uploaded_by_user_id
		LEFT JOIN tasks t ON t.id = e.task_id
		LEFT JOIN LATERAL (
			SELECT json_feedback, model_version FROM ia_audits WHERE evidence_id = e.id ORDER BY created_at DESC LIMIT 1
		) ia ON true
		WHERE e.id = $1`, evidenceID).
		Scan(&evidence.ID, &evidence.TenantID, &evidence.ProjectID, &evidence.TaskID, &evidence.UploadedByUserID, &evidence.ApprovedByUserID, &evidence.FileName, &evidence.MimeType, &evidence.FileSizeBytes, &evidence.URLArchivo, &evidence.Status, &evidence.Latitude, &evidence.Longitude, &evidence.MetadataEXIF, &evidence.ApprovalComment, &evidence.RejectionReason, &visible, &evidence.AIProcessingStatus, &evidence.QualityScore, &evidence.CreatedAt, &evidence.UploaderName, &evidence.TaskTitle, &evidence.ReferencePhotoURL, &aiFeedback, &evidence.AIModelVersion)
	evidence.VisibleToClient = intToBool(visible)
	if aiFeedback != "" {
		evidence.AIFeedback = json.RawMessage(aiFeedback)
	}
	return evidence, err
}

// ReAuditEvidence lets the supervisor manually re-run the AI audit for an
// evidence that ended up in a dead-end state (disabled, needs_review,
// not_requested, queued). Rate-limited to 1 request per evidence per 30s to
// prevent burning Gemini quota via rapid clicks.
func (s *Service) ReAuditEvidence(ctx context.Context, actor Claims, evidenceID string) (Evidence, error) {
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
	if s.cfg.GeminiAPIKey == "" {
		return Evidence{}, errors.New("ai_disabled: GEMINI_API_KEY not configured")
	}
	// Rate limit: 1 re-audit per evidence per 30s.
	s.reAuditMu.Lock()
	if last, ok := s.reAuditLastAt[evidenceID]; ok {
		if delta := time.Since(last); delta < 30*time.Second {
			s.reAuditMu.Unlock()
			return Evidence{}, fmt.Errorf("rate_limited: wait %ds", int(30-delta.Seconds()))
		}
	}
	s.reAuditLastAt[evidenceID] = time.Now()
	// Opportunistic GC of the map when it grows past 1k entries.
	if len(s.reAuditLastAt) > 1024 {
		cutoff := time.Now().Add(-10 * time.Minute)
		for k, v := range s.reAuditLastAt {
			if v.Before(cutoff) {
				delete(s.reAuditLastAt, k)
			}
		}
	}
	s.reAuditMu.Unlock()

	if _, err := s.db.ExecContext(ctx, `UPDATE evidences SET ai_processing_status = $1, updated_at = $2 WHERE id = $3`, "queued", nowText(), evidenceID); err != nil {
		return Evidence{}, err
	}
	select {
	case s.auditJobs <- evidenceID:
	default:
		log.Printf("audit queue full on re-audit, evidence %s will stay queued until worker drains", evidenceID)
	}
	s.logger.Info("evidence.re_audit", "actor_id", actor.UserID, "tenant_id", actor.TenantID, "evidence_id", evidenceID, "project_id", evidence.ProjectID)
	return s.evidenceByID(ctx, evidenceID)
}

// recoverQueuedAudits re-queues evidences stuck in 'queued' or 'processing' at
// boot — typically orphaned by a previous restart. Best-effort: the channel is
// 128 slots wide, so we cap at 128 and trust the worker to drain. No-op if
// there's nothing stuck.
func (s *Service) recoverQueuedAudits() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	rows, err := s.db.QueryContext(ctx, `SELECT id FROM evidences WHERE ai_processing_status IN ('queued','processing') ORDER BY created_at DESC LIMIT 128`)
	if err != nil {
		log.Printf("audit recovery: query failed: %v", err)
		return
	}
	defer rows.Close()
	count := 0
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			continue
		}
		select {
		case s.auditJobs <- id:
			count++
		default:
			log.Printf("audit recovery: queue full at %d evidences", count)
			return
		}
	}
	if count > 0 {
		log.Printf("audit recovery: requeued %d stuck evidences", count)
	}
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
	// Mark as 'processing' so UI distinguishes queued from running.
	if _, err := s.db.ExecContext(ctx, `UPDATE evidences SET ai_processing_status = $1, updated_at = $2 WHERE id = $3`, "processing", nowText(), evidenceID); err != nil {
		log.Printf("audit worker: failed to mark processing for evidence=%s: %v", evidenceID, err)
	}
	var objectPath string
	if err := s.db.QueryRowContext(ctx, `SELECT object_path FROM evidences WHERE id = $1`, evidenceID).Scan(&objectPath); err != nil {
		return
	}
	rc, err := s.storage.Open(ctx, objectPath)
	if err != nil {
		return
	}
	// Cap at 50MB to prevent OOM — images larger than this are not useful for AI audit.
	const maxAuditImageSize = 50 << 20
	avanceBytes, err := io.ReadAll(io.LimitReader(rc, maxAuditImageSize+1))
	rc.Close()
	if err != nil {
		return
	}
	if len(avanceBytes) > maxAuditImageSize {
		log.Printf("AI audit skipped: image too large (%d bytes) for evidence=%s", len(avanceBytes), evidenceID)
		return
	}

	var feedback AuditFeedback
	modelVersion := "gemini-2.0-flash"

	// Deterministic mock for local/CI testing: when GEMINI_API_KEY is the
	// literal "mock", produce a stable score derived from the evidence ID
	// so tests can assert quality_score>0 + status=approved without hitting
	// a real Gemini quota.
	if s.cfg.GeminiAPIKey == "mock" {
		seed := 0
		for _, c := range evidenceID {
			seed = (seed*31 + int(c)) & 0x7fffffff
		}
		feedback = AuditFeedback{
			IsValidEvidence: true,
			QualityScore:    85 + (seed % 13), // 85..97
			AnalysisSummary: "mock audit (GEMINI_API_KEY=mock)",
			DetectedIssues:  []string{},
			Recommendations: "",
			StatusLogic:     "approved_quality",
		}
		modelVersion = "mock"
		payload, _ := json.Marshal(feedback)
		if _, err := s.db.ExecContext(ctx, `INSERT INTO ia_audits (id, tenant_id, evidence_id, score, json_feedback, critical_alert, model_version, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, newID("audit"), evidence.TenantID, evidence.ID, feedback.QualityScore, string(payload), 0, modelVersion, nowText()); err != nil {
			log.Printf("audit worker: failed to insert mock audit for evidence=%s: %v", evidenceID, err)
		}
		if _, err := s.db.ExecContext(ctx, `UPDATE evidences SET status = $1, ai_processing_status = $2, quality_score = $3, updated_at = $4 WHERE id = $5`,
			"approved", "completed", feedback.QualityScore, nowText(), evidence.ID); err != nil {
			log.Printf("audit worker: failed to mock-approve evidence=%s: %v", evidenceID, err)
		}
		return
	}

	if s.cfg.GeminiAPIKey == "" {
		// Fail-loud: no fake scores in production. Persist a disabled audit row
		// and leave the evidence as pending_approval for manual review.
		log.Printf("AI audit disabled: GEMINI_API_KEY not set (evidence=%s)", evidenceID)
		disabledPayload := `{"status":"ai_disabled","message":"AI audits disabled: GEMINI_API_KEY not set"}`
		if _, err := s.db.ExecContext(ctx, `INSERT INTO ia_audits (id, tenant_id, evidence_id, score, json_feedback, critical_alert, model_version, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
			newID("audit"), evidence.TenantID, evidence.ID, 0, disabledPayload, 0, "disabled", nowText()); err != nil {
			log.Printf("audit worker: failed to insert disabled audit for evidence=%s: %v", evidenceID, err)
		}
		if _, err := s.db.ExecContext(ctx, `UPDATE evidences SET ai_processing_status = $1, updated_at = $2 WHERE id = $3`,
			"disabled", nowText(), evidence.ID); err != nil {
			log.Printf("audit worker: failed to update evidence status=%s: %v", evidenceID, err)
		}
		return
	}

	// Look up comparison photo from task
	var referenceBytes []byte
	var refMime string
	if evidence.TaskID != "" {
		task, taskErr := s.taskByID(ctx, evidence.TaskID)
		if taskErr == nil && task.ComparisonPhotoURL != "" {
			parts := strings.Split(task.ComparisonPhotoURL, "/")
			if len(parts) > 0 {
				refEviID := parts[len(parts)-1]
				var refPath, refMimeType string
				if err := s.db.QueryRowContext(ctx, `SELECT object_path, mime_type FROM evidences WHERE id = $1 AND tenant_id = $2`, refEviID, evidence.TenantID).Scan(&refPath, &refMimeType); err == nil {
					refRC, refErr := s.storage.Open(ctx, refPath)
					if refErr == nil {
						referenceBytes, _ = io.ReadAll(io.LimitReader(refRC, maxAuditImageSize))
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
		// Fail-safe: leave the evidence pending_approval for manual review.
		// Do NOT auto-approve with score=0 — that silently passes everything.
		errPayload := fmt.Sprintf(`{"status":"needs_review","error":%q}`, err.Error())
		if _, dbErr := s.db.ExecContext(ctx, `INSERT INTO ia_audits (id, tenant_id, evidence_id, score, json_feedback, critical_alert, model_version, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
			newID("audit"), evidence.TenantID, evidence.ID, 0, errPayload, 0, "gemini-error", nowText()); dbErr != nil {
			log.Printf("audit worker: failed to insert error audit for evidence=%s: %v", evidenceID, dbErr)
		}
		if _, dbErr := s.db.ExecContext(ctx, `UPDATE evidences SET ai_processing_status = $1, updated_at = $2 WHERE id = $3`,
			"needs_review", nowText(), evidence.ID); dbErr != nil {
			log.Printf("audit worker: failed to update evidence status=%s: %v", evidenceID, dbErr)
		}
		return
	}

	payload, _ := json.Marshal(feedback)
	if _, err := s.db.ExecContext(ctx, `INSERT INTO ia_audits (id, tenant_id, evidence_id, score, json_feedback, critical_alert, model_version, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, newID("audit"), evidence.TenantID, evidence.ID, feedback.QualityScore, string(payload), boolToInt(feedback.StatusLogic == "critical_alert"), modelVersion, nowText()); err != nil {
		log.Printf("audit worker: failed to insert audit result for evidence=%s: %v", evidenceID, err)
	}

	if feedback.QualityScore < 80 && feedback.QualityScore > 0 {
		// Auto-reject: score below threshold
		if _, err := s.db.ExecContext(ctx, `UPDATE evidences SET status = $1, ai_processing_status = $2, quality_score = $3, rejection_reason = $4, updated_at = $5 WHERE id = $6`,
			"rejected", "completed", feedback.QualityScore, fmt.Sprintf("Calificación IA: %d%% — %s", feedback.QualityScore, feedback.AnalysisSummary), nowText(), evidence.ID); err != nil {
			log.Printf("audit worker: failed to reject evidence=%s: %v", evidenceID, err)
		}
		if _, err := s.db.ExecContext(ctx, `INSERT INTO quality_alerts (id, tenant_id, project_id, task_id, evidence_id, severity, title, description, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
			newID("alt"), evidence.TenantID, evidence.ProjectID, evidence.TaskID, evidence.ID, "red", "Calidad por debajo del umbral (< 80%)", feedback.AnalysisSummary, "open", nowText()); err != nil {
			log.Printf("audit worker: failed to insert quality alert for evidence=%s: %v", evidenceID, err)
		}
	} else {
		// Approve
		if _, err := s.db.ExecContext(ctx, `UPDATE evidences SET status = $1, ai_processing_status = $2, quality_score = $3, updated_at = $4 WHERE id = $5`,
			"approved", "completed", feedback.QualityScore, nowText(), evidence.ID); err != nil {
			log.Printf("audit worker: failed to approve evidence=%s: %v", evidenceID, err)
		}
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
		// Log raw text server-side only; never return it in error — could contain sensitive data.
		log.Printf("gemini json parse failed: %v (raw length=%d)", err, len(text))
		return AuditFeedback{}, fmt.Errorf("gemini json parse: %w", err)
	}

	// Clamp quality score to 0-100 range
	if feedback.QualityScore < 0 {
		feedback.QualityScore = 0
	} else if feedback.QualityScore > 100 {
		feedback.QualityScore = 100
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

func (s *Service) UpdateProject(ctx context.Context, actor Claims, projectID string, patch Project) (Project, error) {
	if actor.Role != RoleOwner && actor.Role != RoleSupervisor {
		return Project{}, errors.New("forbidden")
	}
	if err := s.RequireWriteAccess(ctx, actor.TenantID); err != nil {
		return Project{}, err
	}
	project, err := s.projectByID(ctx, projectID)
	if err != nil {
		return Project{}, err
	}
	if actor.TenantID != project.TenantID {
		return Project{}, sql.ErrNoRows
	}
	// PATCH merge: empty/zero in `patch` means "leave unchanged". Without this,
	// a partial PATCH (e.g. {"daily_log_preset":"manufacturing"}) would zero
	// out name, supervisor, client, dates — breaking the project entirely.
	if patch.Name == "" {
		patch.Name = project.Name
	}
	if patch.Description == "" {
		patch.Description = project.Description
	}
	if patch.Status == "" {
		patch.Status = project.Status
	}
	if patch.StartDate == "" {
		patch.StartDate = project.StartDate
	}
	if patch.PlannedEndDate == "" {
		patch.PlannedEndDate = project.PlannedEndDate
	}
	if patch.SupervisorUserID == "" {
		patch.SupervisorUserID = project.SupervisorUserID
	}
	if patch.ClientUserID == "" {
		patch.ClientUserID = project.ClientUserID
	}
	if patch.LatitudeCenter == 0 {
		patch.LatitudeCenter = project.LatitudeCenter
	}
	if patch.LongitudeCenter == 0 {
		patch.LongitudeCenter = project.LongitudeCenter
	}
	if patch.GeofenceRadiusM == 0 {
		patch.GeofenceRadiusM = project.GeofenceRadiusM
	}
	if patch.DailyLogPreset == "" {
		patch.DailyLogPreset = project.DailyLogPreset
	}
	// Validate assigned users belong to same tenant (only if changing).
	if patch.SupervisorUserID != "" && patch.SupervisorUserID != project.SupervisorUserID {
		var supTenant string
		if err := s.db.QueryRowContext(ctx, `SELECT tenant_id FROM users WHERE id = $1`, patch.SupervisorUserID).Scan(&supTenant); err != nil || supTenant != actor.TenantID {
			return Project{}, errors.New("supervisor must belong to same organization")
		}
	}
	if patch.ClientUserID != "" && patch.ClientUserID != project.ClientUserID {
		var cliTenant string
		if err := s.db.QueryRowContext(ctx, `SELECT tenant_id FROM users WHERE id = $1`, patch.ClientUserID).Scan(&cliTenant); err != nil || cliTenant != actor.TenantID {
			return Project{}, errors.New("client must belong to same organization")
		}
	}
	if !ValidPresetKey(patch.DailyLogPreset) {
		return Project{}, errors.New("unknown daily_log_preset")
	}
	now := nowText()
	_, err = s.db.ExecContext(ctx,
		`UPDATE projects SET name=$1, description=$2, status=$3, start_date=$4, planned_end_date=$5, supervisor_user_id=$6, client_user_id=$7, latitude_center=$8, longitude_center=$9, geofence_radius_m=$10, daily_log_preset=$11, updated_at=$12 WHERE id=$13`,
		patch.Name, patch.Description, patch.Status, patch.StartDate, patch.PlannedEndDate,
		patch.SupervisorUserID, patch.ClientUserID,
		patch.LatitudeCenter, patch.LongitudeCenter, patch.GeofenceRadiusM,
		strings.TrimSpace(strings.ToLower(patch.DailyLogPreset)),
		now, projectID,
	)
	if err != nil {
		return Project{}, err
	}
	return s.projectByID(ctx, projectID)
}

// DeleteProject hard-deletes a project and all its related rows (tasks,
// deliverables, evidences, blueprints, messages, expenses, journal, alerts,
// upload sessions, budget adjustments). Only the owner may call this. This is
// irreversible — the UI must confirm before calling.
//
// Uploaded files on disk are NOT removed; they become orphaned. This keeps the
// operation fast and avoids fragile file-system work inside a DB transaction.
func (s *Service) DeleteProject(ctx context.Context, actor Claims, projectID string) error {
	if actor.Role != RoleOwner {
		return errors.New("forbidden")
	}
	project, err := s.projectByID(ctx, projectID)
	if err != nil {
		return err
	}
	if actor.TenantID != project.TenantID {
		return sql.ErrNoRows
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	// Order matters: child-of-child first (ia_audits via evidence), then siblings.
	cascades := []string{
		`DELETE FROM ia_audits WHERE evidence_id IN (SELECT id FROM evidences WHERE project_id = $1)`,
		`DELETE FROM evidences WHERE project_id = $1`,
		`DELETE FROM upload_sessions WHERE project_id = $1`,
		`DELETE FROM quality_alerts WHERE project_id = $1`,
		`DELETE FROM expenses WHERE project_id = $1`,
		`DELETE FROM daily_logs WHERE project_id = $1`,
		`DELETE FROM budget_adjustments WHERE project_id = $1`,
		`DELETE FROM project_messages WHERE project_id = $1`,
		`DELETE FROM blueprints WHERE project_id = $1`,
		`DELETE FROM deliverables WHERE project_id = $1`,
		`DELETE FROM tasks WHERE project_id = $1`,
		`DELETE FROM projects WHERE id = $1`,
	}
	for _, stmt := range cascades {
		if _, err := tx.ExecContext(ctx, stmt, projectID); err != nil {
			return fmt.Errorf("delete project: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	s.logger.Warn("project.deleted", "actor", actor.UserID, "tenant", actor.TenantID, "project_id", projectID)
	return nil
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
	var projectID, objectPath, mimeType, metadata string
	var visible int
	var uploaderID string
	if err := s.db.QueryRowContext(ctx, `SELECT project_id, object_path, mime_type, is_visible_to_client, uploaded_by_user_id, COALESCE(metadata_exif, '') FROM evidences WHERE id = $1 AND tenant_id = $2`, evidenceID, actor.TenantID).Scan(&projectID, &objectPath, &mimeType, &visible, &uploaderID, &metadata); err != nil {
		return nil, "", err
	}
	isComparison := strings.Contains(metadata, "comparison_reference")
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
		// Helpers can view evidence they uploaded, plus comparison references of their tenant.
		if uploaderID != actor.UserID && !isComparison {
			return nil, "", errors.New("forbidden")
		}
	case RoleClient:
		if !intToBool(visible) && !isComparison {
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

// deliverableByID loads a deliverable row. Ownership check is the caller's job.
func (s *Service) deliverableByID(ctx context.Context, deliverableID string) (Deliverable, string, error) {
	var d Deliverable
	var clientVisible int
	var approvedAt sql.NullString
	var approvedBy, rejectionReason string
	err := s.db.QueryRowContext(ctx, `SELECT id, tenant_id, project_id, task_id, title, description, due_date, status, client_visible, COALESCE(approved_at::text,''), COALESCE(approved_by_user_id,''), COALESCE(rejection_reason,'') FROM deliverables WHERE id = $1`, deliverableID).
		Scan(&d.ID, &d.TenantID, &d.ProjectID, &d.TaskID, &d.Title, &d.Description, &d.DueDate, &d.Status, &clientVisible, &approvedAt, &approvedBy, &rejectionReason)
	if err != nil {
		return Deliverable{}, "", err
	}
	d.ClientVisible = intToBool(clientVisible)
	return d, rejectionReason, nil
}

// ApproveDeliverable transitions a deliverable to 'approved' state. Allowed to
// owner/supervisor of the tenant or the client assigned to the project.
// Only deliverables that are client_visible and in pending/in_review status
// can be approved.
func (s *Service) ApproveDeliverable(ctx context.Context, actor Claims, deliverableID string) (Deliverable, error) {
	d, _, err := s.deliverableByID(ctx, deliverableID)
	if err != nil {
		return Deliverable{}, err
	}
	project, err := s.projectByID(ctx, d.ProjectID)
	if err != nil {
		return Deliverable{}, err
	}
	if err := s.ensureProjectAccess(ctx, actor, project); err != nil {
		return Deliverable{}, err
	}
	if actor.Role != RoleOwner && actor.Role != RoleSupervisor && actor.Role != RoleClient {
		return Deliverable{}, errors.New("forbidden")
	}
	if actor.Role == RoleClient && !d.ClientVisible {
		return Deliverable{}, errors.New("forbidden")
	}
	if d.Status == "approved" {
		return d, nil
	}
	if d.Status != "pending" && d.Status != "in_review" && d.Status != "rejected" {
		return Deliverable{}, fmt.Errorf("cannot approve deliverable in status %q", d.Status)
	}
	if _, err := s.db.ExecContext(ctx,
		`UPDATE deliverables SET status='approved', approved_at=NOW(), approved_by_user_id=$1, rejection_reason='', updated_at=$2 WHERE id = $3`,
		actor.UserID, nowText(), deliverableID); err != nil {
		return Deliverable{}, err
	}
	s.logger.Info("deliverable.approved", "deliverable_id", deliverableID, "actor_id", actor.UserID, "tenant_id", d.TenantID)
	// Notify owners (respects pref).
	go s.notifyOwnersWithPref(context.Background(), d.TenantID, "deliverable_approved",
		"Entregable aprobado: "+d.Title,
		fmt.Sprintf("El entregable \"%s\" fue aprobado en el proyecto %s.\n\n— ProjectPulse", d.Title, project.Name))
	d.Status = "approved"
	d.ApprovedByUserID = actor.UserID
	return d, nil
}

// RejectDeliverable flips status to rejected with an optional reason.
// Same RBAC as Approve.
func (s *Service) RejectDeliverable(ctx context.Context, actor Claims, deliverableID, reason string) (Deliverable, error) {
	d, _, err := s.deliverableByID(ctx, deliverableID)
	if err != nil {
		return Deliverable{}, err
	}
	project, err := s.projectByID(ctx, d.ProjectID)
	if err != nil {
		return Deliverable{}, err
	}
	if err := s.ensureProjectAccess(ctx, actor, project); err != nil {
		return Deliverable{}, err
	}
	if actor.Role != RoleOwner && actor.Role != RoleSupervisor && actor.Role != RoleClient {
		return Deliverable{}, errors.New("forbidden")
	}
	if actor.Role == RoleClient && !d.ClientVisible {
		return Deliverable{}, errors.New("forbidden")
	}
	if d.Status == "approved" {
		return Deliverable{}, errors.New("deliverable already approved; cannot reject")
	}
	reason = strings.TrimSpace(reason)
	if len(reason) > 2000 {
		reason = reason[:2000]
	}
	if _, err := s.db.ExecContext(ctx,
		`UPDATE deliverables SET status='rejected', rejection_reason=$1, updated_at=$2 WHERE id = $3`,
		reason, nowText(), deliverableID); err != nil {
		return Deliverable{}, err
	}
	s.logger.Info("deliverable.rejected", "deliverable_id", deliverableID, "actor_id", actor.UserID, "reason", reason)
	d.Status = "rejected"
	return d, nil
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
	if err := s.RequireWriteAccess(ctx, actor.TenantID); err != nil {
		return Expense{}, err
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

// ensureDailyLogAccess extends project access to include helpers that have at
// least one task assigned in the project (they live the work, they write the
// log). Supervisor/client/owner use the normal project-access rules.
func (s *Service) ensureDailyLogAccess(ctx context.Context, actor Claims, project Project) error {
	if err := s.ensureProjectAccess(ctx, actor, project); err == nil {
		return nil
	}
	if actor.Role == RoleHelper {
		if actor.TenantID != project.TenantID {
			return errors.New("forbidden")
		}
		var count int
		if err := s.db.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM tasks WHERE project_id = $1 AND assigned_to_user_id = $2`,
			project.ID, actor.UserID,
		).Scan(&count); err != nil {
			return err
		}
		if count > 0 {
			return nil
		}
	}
	return errors.New("forbidden")
}

// effectivePresetForProject resolves the preset key: project override wins;
// otherwise the tenant's industry; otherwise generic.
func (s *Service) effectivePresetForProject(ctx context.Context, project Project) string {
	if project.DailyLogPreset != "" {
		return project.DailyLogPreset
	}
	var industry string
	if err := s.db.QueryRowContext(ctx,
		`SELECT COALESCE(industry, 'generic') FROM tenants WHERE id = $1`,
		project.TenantID,
	).Scan(&industry); err != nil {
		return PresetGeneric
	}
	if industry == "" {
		return PresetGeneric
	}
	return industry
}

const dailyLogSelect = `SELECT id, tenant_id, project_id,
	COALESCE(NULLIF(log_date,''), date),
	date,
	COALESCE(weather,''), COALESCE(headcount,0), COALESCE(manpower_json,'{}'),
	narrative, COALESCE(accidents,''),
	COALESCE(sections_json,'{}'),
	status,
	COALESCE(NULLIF(author_user_id,''), uploaded_by_user_id),
	uploaded_by_user_id,
	submitted_at, COALESCE(approved_by_user_id,''), approved_at,
	COALESCE(reviewer_comment,''),
	created_at, updated_at
FROM daily_logs`

func scanDailyLog(row interface {
	Scan(...any) error
}) (DailyLog, error) {
	var log DailyLog
	var sections string
	var submittedAt, approvedAt, updatedAt sql.NullTime
	if err := row.Scan(
		&log.ID, &log.TenantID, &log.ProjectID,
		&log.LogDate, &log.Date,
		&log.Weather, &log.Headcount, &log.ManpowerJSON,
		&log.Narrative, &log.Accidents,
		&sections,
		&log.Status,
		&log.AuthorUserID, &log.UploadedByUserID,
		&submittedAt, &log.ApprovedByUserID, &approvedAt,
		&log.ReviewerComment,
		&log.CreatedAt, &updatedAt,
	); err != nil {
		return DailyLog{}, err
	}
	log.Sections = json.RawMessage(sections)
	if submittedAt.Valid {
		t := submittedAt.Time
		log.SubmittedAt = &t
	}
	if approvedAt.Valid {
		t := approvedAt.Time
		log.ApprovedAt = &t
	}
	if updatedAt.Valid {
		t := updatedAt.Time
		log.UpdatedAt = &t
	}
	return log, nil
}

func (s *Service) hydrateLogPhotos(ctx context.Context, logs []DailyLog) error {
	if len(logs) == 0 {
		return nil
	}
	ids := make([]string, 0, len(logs))
	for _, l := range logs {
		ids = append(ids, l.ID)
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, tenant_id, log_id, url, COALESCE(caption,''), COALESCE(section,''), uploaded_by_user_id, created_at
		FROM daily_log_photos WHERE log_id = ANY($1) ORDER BY created_at`, pq.Array(ids))
	if err != nil {
		return err
	}
	defer rows.Close()
	byLog := make(map[string][]DailyLogPhoto)
	for rows.Next() {
		var p DailyLogPhoto
		var createdAt time.Time
		if err := rows.Scan(&p.ID, &p.TenantID, &p.LogID, &p.URL, &p.Caption, &p.Section, &p.UploadedByUserID, &createdAt); err != nil {
			return err
		}
		p.CreatedAt = createdAt.UTC().Format(time.RFC3339)
		byLog[p.LogID] = append(byLog[p.LogID], p)
	}
	for i := range logs {
		logs[i].Photos = byLog[logs[i].ID]
		if logs[i].Photos == nil {
			logs[i].Photos = []DailyLogPhoto{}
		}
	}
	return rows.Err()
}

func (s *Service) ListDailyLogs(ctx context.Context, actor Claims, projectID string) ([]DailyLog, error) {
	project, err := s.projectByID(ctx, projectID)
	if err != nil {
		return nil, err
	}
	if err := s.ensureDailyLogAccess(ctx, actor, project); err != nil {
		return nil, err
	}
	preset := s.effectivePresetForProject(ctx, project)
	rows, err := s.db.QueryContext(ctx, dailyLogSelect+` WHERE project_id = $1 ORDER BY COALESCE(NULLIF(log_date,''), date) DESC, created_at DESC`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	logs := make([]DailyLog, 0)
	for rows.Next() {
		log, err := scanDailyLog(rows)
		if err != nil {
			return nil, err
		}
		log.Preset = preset
		logs = append(logs, log)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if err := s.hydrateLogPhotos(ctx, logs); err != nil {
		return nil, err
	}
	return logs, nil
}

func (s *Service) dailyLogByID(ctx context.Context, logID string) (DailyLog, error) {
	return scanDailyLog(s.db.QueryRowContext(ctx, dailyLogSelect+` WHERE id = $1`, logID))
}

// canEditDailyLog: author may edit their own draft or rejected log; owner and
// supervisor may edit anything on a project they access.
func (s *Service) canEditDailyLog(actor Claims, log DailyLog) bool {
	if actor.Role == RoleOwner || actor.Role == RoleSupervisor {
		return true
	}
	if actor.UserID == log.AuthorUserID {
		return log.Status == "draft" || log.Status == "rejected"
	}
	return false
}

func (s *Service) CreateDailyLog(ctx context.Context, actor Claims, log DailyLog) (DailyLog, error) {
	if actor.Role != RoleOwner && actor.Role != RoleSupervisor && actor.Role != RoleHelper {
		return DailyLog{}, errors.New("forbidden")
	}
	if err := s.RequireWriteAccess(ctx, actor.TenantID); err != nil {
		return DailyLog{}, err
	}
	project, err := s.projectByID(ctx, log.ProjectID)
	if err != nil {
		return DailyLog{}, err
	}
	if err := s.ensureDailyLogAccess(ctx, actor, project); err != nil {
		return DailyLog{}, err
	}
	logDate := strings.TrimSpace(log.LogDate)
	if logDate == "" {
		logDate = strings.TrimSpace(log.Date)
	}
	if logDate == "" {
		logDate = time.Now().UTC().Format("2006-01-02")
	}
	preset := s.effectivePresetForProject(ctx, project)
	sections, err := NormalizeSections(preset, log.Sections)
	if err != nil {
		return DailyLog{}, err
	}
	// Optional weather auto-fetch for presets that include it.
	presetCfg := PresetByKey(preset)
	if presetCfg.IncludesWeather && (project.LatitudeCenter != 0 || project.LongitudeCenter != 0) {
		var current map[string]json.RawMessage
		_ = json.Unmarshal(sections, &current)
		if current == nil {
			current = map[string]json.RawMessage{}
		}
		if _, has := current["weather"]; !has {
			if snap := FetchWeather(ctx, project.LatitudeCenter, project.LongitudeCenter, logDate); snap != nil {
				if buf, err := json.Marshal(snap); err == nil {
					current["weather"] = buf
					if reencoded, err := json.Marshal(current); err == nil {
						sections = reencoded
					}
				}
			}
		}
	}

	status := strings.TrimSpace(strings.ToLower(log.Status))
	if status == "" {
		status = "draft"
	}
	if !ValidLogStatus(status) {
		return DailyLog{}, ErrInvalidLogStatus
	}
	// Helpers may not self-approve; force their initial status to draft or
	// submitted (owner/supervisor may create directly as approved for
	// back-dating).
	if actor.Role == RoleHelper && status != "draft" && status != "submitted" {
		status = "draft"
	}
	narrative := strings.TrimSpace(log.Narrative)
	now := nowText()
	logID := newID("log")
	var submittedAt any
	if status == "submitted" || status == "approved" {
		submittedAt = time.Now().UTC()
	}
	_, err = s.db.ExecContext(ctx, `INSERT INTO daily_logs (
		id, tenant_id, project_id,
		date, log_date,
		weather, headcount, manpower_json,
		narrative, accidents,
		sections_json, status,
		author_user_id, uploaded_by_user_id,
		submitted_at, approved_by_user_id, approved_at, reviewer_comment,
		created_at, updated_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'',NULL,'',$16,NOW())`,
		logID, project.TenantID, project.ID,
		logDate, logDate,
		"", 0, "{}",
		narrative, "",
		string(sections), status,
		actor.UserID, actor.UserID,
		submittedAt,
		now,
	)
	if err != nil {
		return DailyLog{}, err
	}
	created, err := s.dailyLogByID(ctx, logID)
	if err != nil {
		return DailyLog{}, err
	}
	created.Preset = preset
	created.Photos = []DailyLogPhoto{}
	return created, nil
}

type DailyLogPatch struct {
	LogDate         *string          `json:"log_date,omitempty"`
	Narrative       *string          `json:"narrative,omitempty"`
	Sections        *json.RawMessage `json:"sections,omitempty"`
	Status          *string          `json:"status,omitempty"`
	ReviewerComment *string          `json:"reviewer_comment,omitempty"`
}

func (s *Service) UpdateDailyLog(ctx context.Context, actor Claims, logID string, patch DailyLogPatch) (DailyLog, error) {
	log, err := s.dailyLogByID(ctx, logID)
	if err != nil {
		return DailyLog{}, err
	}
	project, err := s.projectByID(ctx, log.ProjectID)
	if err != nil {
		return DailyLog{}, err
	}
	if err := s.ensureDailyLogAccess(ctx, actor, project); err != nil {
		return DailyLog{}, err
	}
	if !s.canEditDailyLog(actor, log) {
		return DailyLog{}, errors.New("forbidden")
	}
	if err := s.RequireWriteAccess(ctx, actor.TenantID); err != nil {
		return DailyLog{}, err
	}

	sets := []string{}
	args := []any{}
	add := func(col string, val any) {
		args = append(args, val)
		sets = append(sets, fmt.Sprintf("%s = $%d", col, len(args)))
	}
	if patch.LogDate != nil {
		d := strings.TrimSpace(*patch.LogDate)
		if d == "" {
			return DailyLog{}, errors.New("log_date cannot be empty")
		}
		add("log_date", d)
		add("date", d)
	}
	if patch.Narrative != nil {
		add("narrative", strings.TrimSpace(*patch.Narrative))
	}
	if patch.Sections != nil {
		preset := s.effectivePresetForProject(ctx, project)
		cleaned, err := NormalizeSections(preset, *patch.Sections)
		if err != nil {
			return DailyLog{}, err
		}
		add("sections_json", string(cleaned))
	}
	if patch.Status != nil {
		// Generic status set is for owner/supervisor only (e.g. reverting to
		// draft). Normal transitions go through Submit/Approve/Reject.
		if actor.Role != RoleOwner && actor.Role != RoleSupervisor {
			return DailyLog{}, errors.New("forbidden")
		}
		s := strings.TrimSpace(strings.ToLower(*patch.Status))
		if !ValidLogStatus(s) {
			return DailyLog{}, ErrInvalidLogStatus
		}
		add("status", s)
	}
	if patch.ReviewerComment != nil {
		if actor.Role != RoleOwner && actor.Role != RoleSupervisor {
			return DailyLog{}, errors.New("forbidden")
		}
		add("reviewer_comment", strings.TrimSpace(*patch.ReviewerComment))
	}
	if len(sets) == 0 {
		return log, nil
	}
	sets = append(sets, "updated_at = NOW()")
	args = append(args, logID)
	query := fmt.Sprintf("UPDATE daily_logs SET %s WHERE id = $%d", strings.Join(sets, ", "), len(args))
	if _, err := s.db.ExecContext(ctx, query, args...); err != nil {
		return DailyLog{}, err
	}
	updated, err := s.dailyLogByID(ctx, logID)
	if err != nil {
		return DailyLog{}, err
	}
	updated.Preset = s.effectivePresetForProject(ctx, project)
	if err := s.hydrateLogPhotos(ctx, []DailyLog{updated}); err != nil {
		return DailyLog{}, err
	}
	return updated, nil
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

// SubmitDailyLog: author moves a draft (or rejected) log to 'submitted'.
func (s *Service) SubmitDailyLog(ctx context.Context, actor Claims, logID string) (DailyLog, error) {
	log, err := s.dailyLogByID(ctx, logID)
	if err != nil {
		return DailyLog{}, err
	}
	project, err := s.projectByID(ctx, log.ProjectID)
	if err != nil {
		return DailyLog{}, err
	}
	if err := s.ensureDailyLogAccess(ctx, actor, project); err != nil {
		return DailyLog{}, err
	}
	if actor.UserID != log.AuthorUserID && actor.Role != RoleOwner && actor.Role != RoleSupervisor {
		return DailyLog{}, errors.New("forbidden")
	}
	if log.Status != "draft" && log.Status != "rejected" {
		return DailyLog{}, errors.New("only draft or rejected logs can be submitted")
	}
	if _, err := s.db.ExecContext(ctx,
		`UPDATE daily_logs SET status='submitted', submitted_at=NOW(), updated_at=NOW() WHERE id=$1`, logID,
	); err != nil {
		return DailyLog{}, err
	}
	return s.dailyLogByID(ctx, logID)
}

// ApproveDailyLog: owner/supervisor finalises a submitted log. Optional comment.
func (s *Service) ApproveDailyLog(ctx context.Context, actor Claims, logID, comment string) (DailyLog, error) {
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
	if log.Status != "submitted" {
		return DailyLog{}, errors.New("only submitted logs can be approved")
	}
	if _, err := s.db.ExecContext(ctx,
		`UPDATE daily_logs SET status='approved', approved_by_user_id=$1, approved_at=NOW(), reviewer_comment=$2, updated_at=NOW() WHERE id=$3`,
		actor.UserID, strings.TrimSpace(comment), logID,
	); err != nil {
		return DailyLog{}, err
	}
	return s.dailyLogByID(ctx, logID)
}

// RejectDailyLog: owner/supervisor sends log back with a reason.
func (s *Service) RejectDailyLog(ctx context.Context, actor Claims, logID, comment string) (DailyLog, error) {
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
	if log.Status != "submitted" {
		return DailyLog{}, errors.New("only submitted logs can be rejected")
	}
	comment = strings.TrimSpace(comment)
	if comment == "" {
		return DailyLog{}, errors.New("rejection comment is required")
	}
	if _, err := s.db.ExecContext(ctx,
		`UPDATE daily_logs SET status='rejected', approved_by_user_id=$1, approved_at=NOW(), reviewer_comment=$2, updated_at=NOW() WHERE id=$3`,
		actor.UserID, comment, logID,
	); err != nil {
		return DailyLog{}, err
	}
	return s.dailyLogByID(ctx, logID)
}

// RequestDailyLogPhotoUpload creates an upload session scoped to a log.
func (s *Service) RequestDailyLogPhotoUpload(ctx context.Context, actor Claims, logID, fileName, contentType string, intendedSize int64, baseURL string) (UploadSession, error) {
	if actor.TenantID == "" {
		return UploadSession{}, ErrForbidden
	}
	log, err := s.dailyLogByID(ctx, logID)
	if err != nil {
		return UploadSession{}, err
	}
	project, err := s.projectByID(ctx, log.ProjectID)
	if err != nil {
		return UploadSession{}, err
	}
	if err := s.ensureDailyLogAccess(ctx, actor, project); err != nil {
		return UploadSession{}, err
	}
	// Per-tenant storage quota gate. See audit-findings.md F4.
	if err := s.CheckStorageQuota(ctx, actor.TenantID, intendedSize); err != nil {
		return UploadSession{}, err
	}
	if !s.canEditDailyLog(actor, log) {
		return UploadSession{}, ErrForbidden
	}
	allowed := map[string]bool{"image/png": true, "image/jpeg": true, "image/webp": true, "image/heic": true}
	if !allowed[contentType] {
		return UploadSession{}, errors.New("unsupported image type; allowed: png, jpeg, webp, heic")
	}
	if intendedSize > 10*1024*1024 {
		return UploadSession{}, errors.New("photo must be under 10 MB")
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
	_, err = s.db.ExecContext(ctx, `INSERT INTO upload_sessions (id, tenant_id, project_id, task_id, requested_by_user_id, file_name, content_type, intended_size_bytes, latitude, longitude, upload_token, status, expires_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, 0, $9, 'issued', $10, $11)`,
		sessionID, actor.TenantID, project.ID, logID, actor.UserID, fileNameSafe(fileName), contentType, intendedSize, token, expiresAt, nowText())
	if err != nil {
		return UploadSession{}, err
	}
	return UploadSession{
		ID: sessionID, UploadURL: uploadURL, Method: "PUT", ExpiresAt: expiresAt,
		FileName: fileName, ContentType: contentType, IntendedSize: intendedSize,
	}, nil
}

// ConfirmDailyLogPhoto attaches a finished upload to a log.
func (s *Service) ConfirmDailyLogPhoto(ctx context.Context, actor Claims, logID, sessionID, section, caption string) (DailyLogPhoto, error) {
	if actor.TenantID == "" {
		return DailyLogPhoto{}, ErrForbidden
	}
	var us struct {
		TenantID string
		LogID    string
		FileName string
		Status   string
	}
	err := s.db.QueryRowContext(ctx, `SELECT tenant_id, task_id, file_name, status FROM upload_sessions WHERE id = $1`, sessionID).
		Scan(&us.TenantID, &us.LogID, &us.FileName, &us.Status)
	if err != nil {
		return DailyLogPhoto{}, errors.New("upload session not found")
	}
	if us.TenantID != actor.TenantID || us.LogID != logID {
		return DailyLogPhoto{}, ErrForbidden
	}
	if us.Status != "uploaded" {
		return DailyLogPhoto{}, errors.New("file has not been uploaded yet")
	}
	log, err := s.dailyLogByID(ctx, logID)
	if err != nil {
		return DailyLogPhoto{}, err
	}
	project, err := s.projectByID(ctx, log.ProjectID)
	if err != nil {
		return DailyLogPhoto{}, err
	}
	if err := s.ensureDailyLogAccess(ctx, actor, project); err != nil {
		return DailyLogPhoto{}, err
	}
	photo := DailyLogPhoto{
		ID:               newID("dlp"),
		TenantID:         actor.TenantID,
		LogID:            logID,
		URL:              "/uploads/" + us.FileName,
		Caption:          strings.TrimSpace(caption),
		Section:          strings.TrimSpace(section),
		UploadedByUserID: actor.UserID,
		CreatedAt:        nowText(),
	}
	if _, err := s.db.ExecContext(ctx, `INSERT INTO daily_log_photos (id, tenant_id, log_id, url, caption, section, uploaded_by_user_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
		photo.ID, photo.TenantID, photo.LogID, photo.URL, photo.Caption, photo.Section, photo.UploadedByUserID,
	); err != nil {
		return DailyLogPhoto{}, err
	}
	if _, err := s.db.ExecContext(ctx, `UPDATE upload_sessions SET status = 'confirmed' WHERE id = $1`, sessionID); err != nil {
		s.logger.Warn("failed to confirm upload session", "session_id", sessionID, "err", err)
	}
	if _, err := s.db.ExecContext(ctx, `UPDATE daily_logs SET updated_at = NOW() WHERE id = $1`, logID); err != nil {
		s.logger.Warn("failed to bump daily_log updated_at", "log_id", logID, "err", err)
	}
	return photo, nil
}

// RemoveDailyLogPhoto deletes a photo row (the underlying file is left in
// storage; a later janitor can GC orphaned uploads).
func (s *Service) RemoveDailyLogPhoto(ctx context.Context, actor Claims, photoID string) error {
	var p DailyLogPhoto
	err := s.db.QueryRowContext(ctx,
		`SELECT id, tenant_id, log_id, url, COALESCE(caption,''), COALESCE(section,''), uploaded_by_user_id, created_at FROM daily_log_photos WHERE id = $1`, photoID,
	).Scan(&p.ID, &p.TenantID, &p.LogID, &p.URL, &p.Caption, &p.Section, &p.UploadedByUserID, &p.CreatedAt)
	if err != nil {
		return err
	}
	if p.TenantID != actor.TenantID {
		return ErrForbidden
	}
	log, err := s.dailyLogByID(ctx, p.LogID)
	if err != nil {
		return err
	}
	project, err := s.projectByID(ctx, log.ProjectID)
	if err != nil {
		return err
	}
	if err := s.ensureDailyLogAccess(ctx, actor, project); err != nil {
		return err
	}
	if !s.canEditDailyLog(actor, log) {
		return ErrForbidden
	}
	_, err = s.db.ExecContext(ctx, `DELETE FROM daily_log_photos WHERE id = $1`, photoID)
	if err == nil {
		_, _ = s.db.ExecContext(ctx, `UPDATE daily_logs SET updated_at = NOW() WHERE id = $1`, p.LogID)
	}
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
	if err := s.RequireWriteAccess(ctx, actor.TenantID); err != nil {
		return ProjectMessage{}, err
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
	if err := s.RequireWriteAccess(ctx, actor.TenantID); err != nil {
		return BudgetAdjustment{}, err
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
