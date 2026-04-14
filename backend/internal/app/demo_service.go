package app

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base32"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"
)

type DemoRequestInput struct {
	Name      string
	Email     string
	Company   string
	Source    string
	IPAddress string
	UserAgent string
}

type DemoRequestResult struct {
	LeadID    string
	ExpiresAt time.Time
}

// RequestDemo provisions an ephemeral demo tenant for a lead, inserts the
// lead row, and emails the temporary credentials. Returns once the email
// send has been attempted (logged but non-fatal on failure).
func (s *Service) RequestDemo(ctx context.Context, in DemoRequestInput) (DemoRequestResult, error) {
	name := strings.TrimSpace(in.Name)
	email := strings.ToLower(strings.TrimSpace(in.Email))
	company := strings.TrimSpace(in.Company)

	if name == "" || len(name) > 200 {
		return DemoRequestResult{}, errors.New("name required (≤200 chars)")
	}
	if !emailRegex.MatchString(email) {
		return DemoRequestResult{}, errors.New("invalid email")
	}
	if len(company) > 200 {
		return DemoRequestResult{}, errors.New("company too long")
	}

	// Cooldown per email: 10 minutes between requests.
	var lastCreatedAt sql.NullTime
	_ = s.db.QueryRowContext(ctx,
		`SELECT MAX(created_at) FROM demo_leads WHERE email = $1`, email,
	).Scan(&lastCreatedAt)
	if lastCreatedAt.Valid && time.Since(lastCreatedAt.Time) < 10*time.Minute {
		return DemoRequestResult{}, errors.New("a demo was already requested for this email recently; please check your inbox")
	}

	slug, err := randomDemoSlug()
	if err != nil {
		return DemoRequestResult{}, err
	}
	password, err := generateDemoPassword(16)
	if err != nil {
		return DemoRequestResult{}, err
	}
	passwordHash, err := HashPassword(password)
	if err != nil {
		return DemoRequestResult{}, err
	}

	tenantID := newID("ten")
	userID := newID("usr")
	projectID := newID("prj")
	taskID := newID("tsk")
	deliverableID := newID("del")
	now := nowText()
	expiresAt := time.Now().Add(72 * time.Hour)

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return DemoRequestResult{}, err
	}
	defer tx.Rollback()

	tenantName := company
	if tenantName == "" {
		tenantName = name + " · Demo"
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO tenants (id, name, slug, created_at) VALUES ($1, $2, $3, $4)`,
		tenantID, tenantName, slug, now,
	); err != nil {
		return DemoRequestResult{}, fmt.Errorf("create tenant: %w", err)
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO users (id, tenant_id, email, password_hash, full_name, role, email_verified, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		userID, tenantID, email, passwordHash, name, RoleOwner, true, now,
	); err != nil {
		return DemoRequestResult{}, fmt.Errorf("create user: %w", err)
	}

	// Sample content so the UI isn't empty.
	if _, err := tx.ExecContext(ctx, `INSERT INTO projects (id, tenant_id, name, description, status, client_user_id, supervisor_user_id, budget_total_cents, spent_total_cents, start_date, planned_end_date, latitude_center, longitude_center, geofence_radius_m, created_by_user_id, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
		projectID, tenantID, "Demo Product Launch", "Sample project with end-to-end tracking", "active", userID, userID, 180000000, 92000000, "2026-03-01", "2026-05-30", 19.4326, -99.1332, 120, userID, now, now); err != nil {
		return DemoRequestResult{}, fmt.Errorf("create project: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO tasks (id, tenant_id, project_id, title, description, assigned_to_user_id, status, start_date, end_date, expected_finish_quality, technical_spec_text, budget_cents, spent_cents, progress_percent, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
		taskID, tenantID, projectID, "Precision assembly batch A", "Primary production line quality checkpoint", userID, "in_progress", "2026-03-10", "2026-04-10", "Uniform polished finish without visible seams", "2mm joint tolerance, exact leveling, no edge chipping", 48000000, 26000000, 55, now, now); err != nil {
		return DemoRequestResult{}, fmt.Errorf("create task: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO deliverables (id, tenant_id, project_id, task_id, title, description, due_date, status, client_visible, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
		deliverableID, tenantID, projectID, taskID, "Finished assembly delivery", "Completed and quality-checked output", "2026-04-10", "pending", 1, now, now); err != nil {
		return DemoRequestResult{}, fmt.Errorf("create deliverable: %w", err)
	}
	// Subscription row for demo tenant — forced enterprise/active (same policy as legacy demo).
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO subscriptions (id, tenant_id, plan, status, trial_ends_at, current_period_ends_at)
		 VALUES ($1, $2, 'enterprise', 'active', NULL, NOW() + INTERVAL '100 years')`,
		newID("sub"), tenantID,
	); err != nil {
		return DemoRequestResult{}, fmt.Errorf("create subscription: %w", err)
	}

	leadID := newID("led")
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO demo_leads (id, email, name, company, source, ip_address, user_agent, tenant_id, demo_user_id, expires_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
		leadID, email, name, company, in.Source, in.IPAddress, in.UserAgent, tenantID, userID, expiresAt,
	); err != nil {
		return DemoRequestResult{}, fmt.Errorf("insert lead: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return DemoRequestResult{}, err
	}

	s.logger.Info("demo.provisioned", "lead_id", leadID, "email", email, "tenant_id", tenantID, "expires_at", expiresAt)

	// Send credentials email (non-fatal — we already committed the tenant).
	baseURL := s.cfg.DemoBaseURL
	if baseURL == "" {
		baseURL = s.cfg.PublicBase
	}
	if baseURL == "" {
		baseURL = "https://projpul.com"
	}
	subject, html := RenderDemoCredentialsEmail(name, baseURL, email, password, expiresAt)
	go func(to, subj, body string) {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		if err := s.mailer.SendHTML(ctx, to, subj, body); err != nil {
			s.logger.Error("demo.email_failed", "to", to, "err", err)
		}
	}(email, subject, html)

	return DemoRequestResult{LeadID: leadID, ExpiresAt: expiresAt}, nil
}

// PurgeExpiredDemos deletes all data belonging to demo tenants whose TTL
// has passed. The demo_leads row is preserved (as a permanent lead record)
// but tenant/user identifiers are cleared and purged_at is stamped.
func (s *Service) PurgeExpiredDemos(ctx context.Context) (int, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, tenant_id FROM demo_leads
		 WHERE expires_at < NOW() AND purged_at IS NULL AND tenant_id <> ''`,
	)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	type expired struct{ leadID, tenantID string }
	var items []expired
	for rows.Next() {
		var it expired
		if err := rows.Scan(&it.leadID, &it.tenantID); err != nil {
			return 0, err
		}
		items = append(items, it)
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}

	for _, it := range items {
		if err := s.purgeDemoTenant(ctx, it.leadID, it.tenantID); err != nil {
			s.logger.Error("demo.purge_failed", "lead_id", it.leadID, "tenant_id", it.tenantID, "err", err)
			continue
		}
	}
	return len(items), nil
}

func (s *Service) purgeDemoTenant(ctx context.Context, leadID, tenantID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// FK order: children → parents.
	stmts := []string{
		`DELETE FROM evidences WHERE tenant_id = $1`,
		`DELETE FROM deliverables WHERE tenant_id = $1`,
		`DELETE FROM tasks WHERE tenant_id = $1`,
		`DELETE FROM projects WHERE tenant_id = $1`,
		`DELETE FROM daily_logs WHERE tenant_id = $1`,
		`DELETE FROM verifications WHERE tenant_id = $1`,
		`DELETE FROM payment_events WHERE tenant_id = $1`,
		`DELETE FROM usage_metrics WHERE tenant_id = $1`,
		`DELETE FROM subscriptions WHERE tenant_id = $1`,
		`DELETE FROM users WHERE tenant_id = $1`,
		`DELETE FROM tenants WHERE id = $1`,
	}
	for _, q := range stmts {
		if _, err := tx.ExecContext(ctx, q, tenantID); err != nil {
			// Tables may not exist in all environments — log and continue.
			s.logger.Warn("demo.purge_stmt", "stmt", q, "err", err)
		}
	}
	if _, err := tx.ExecContext(ctx,
		`UPDATE demo_leads SET tenant_id = '', demo_user_id = '', purged_at = NOW(), updated_at = NOW() WHERE id = $1`,
		leadID,
	); err != nil {
		return err
	}
	return tx.Commit()
}

// demoPurgeWorker runs PurgeExpiredDemos every 15 minutes.
func (s *Service) demoPurgeWorker(ctx context.Context) {
	t := time.NewTicker(15 * time.Minute)
	defer t.Stop()
	// Run once shortly after boot so that a restart doesn't stretch TTLs.
	initial := time.NewTimer(2 * time.Minute)
	defer initial.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-initial.C:
		case <-t.C:
		}
		n, err := s.PurgeExpiredDemos(ctx)
		if err != nil {
			s.logger.Error("demo.purge_error", "err", err)
			continue
		}
		if n > 0 {
			s.logger.Info("demo.purged", "count", n)
		}
	}
}

func randomDemoSlug() (string, error) {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	encoded := strings.ToLower(base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b))
	if len(encoded) > 10 {
		encoded = encoded[:10]
	}
	return "demo-" + encoded, nil
}

func generateDemoPassword(length int) (string, error) {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
	max := big.NewInt(int64(len(alphabet)))
	out := make([]byte, length)
	for i := range out {
		n, err := rand.Int(rand.Reader, max)
		if err != nil {
			return "", err
		}
		out[i] = alphabet[n.Int64()]
	}
	return string(out), nil
}
