package app

import (
	"context"
	"crypto/subtle"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"path/filepath"
	"strings"
	"sync"
	"time"

	_ "github.com/lib/pq"

	"arquicheck/backend/internal/billing"
)

type Service struct {
	db        *sql.DB
	storage   FileStorage
	mailer    EmailSender
	logger    *slog.Logger
	cfg       Config
	jwtSecret []byte
	auditJobs chan string
	auditWg   sync.WaitGroup
	stripe    *billing.Client
}

func NewService(cfg Config) (*Service, error) {
	if cfg.DatabaseURL == "" {
		return nil, errors.New("DATABASE_URL is required")
	}
	if cfg.UploadDir == "" {
		cfg.UploadDir = filepath.Join("data", "uploads")
	}
	if len(cfg.JWTSecret) < 32 {
		return nil, errors.New("JWT_SECRET must be at least 32 bytes")
	}
	storage, err := NewLocalStorage(cfg.UploadDir)
	if err != nil {
		return nil, err
	}

	db, err := sql.Open("postgres", cfg.DatabaseURL)
	if err != nil {
		return nil, err
	}

	var mailer EmailSender = &ConsoleEmailSender{}
	if cfg.ResendAPIKey != "" {
		mailer = NewResendEmailSender(cfg.ResendAPIKey, cfg.ResendFromAddr, cfg.ResendReplyTo, slog.Default())
	}
	svc := &Service{
		db:        db,
		storage:   storage,
		mailer:    mailer,
		logger:    slog.Default(),
		cfg:       cfg,
		jwtSecret: []byte(cfg.JWTSecret),
		auditJobs: make(chan string, 128),
		stripe:    billing.NewClient(cfg.StripeSecretKey, cfg.StripeWebhookSecret),
	}
	if err := svc.initSchema(context.Background()); err != nil {
		return nil, err
	}
	if err := svc.seedDefaults(context.Background()); err != nil {
		return nil, err
	}
	if err := svc.normalizeDemoContent(context.Background()); err != nil {
		return nil, err
	}
	if err := svc.ensurePlatformAdmin(context.Background()); err != nil {
		return nil, err
	}
	go svc.auditWorker()
	go svc.demoPurgeWorker(context.Background())
	return svc, nil
}

func (s *Service) Close() error {
	close(s.auditJobs)
	s.auditWg.Wait()
	return s.db.Close()
}

func (s *Service) UploadDir() string {
	return s.cfg.UploadDir
}

func (s *Service) JWTSecret() []byte {
	return s.jwtSecret
}

func (s *Service) AllowedOrigins() []string {
	return s.cfg.AllowedOrigins
}

func (s *Service) initSchema(ctx context.Context) error {
	schema := []string{
		`CREATE TABLE IF NOT EXISTS tenants (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			slug TEXT NOT NULL UNIQUE,
			created_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL DEFAULT '',
			email TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			full_name TEXT NOT NULL,
			role TEXT NOT NULL,
			email_verified BOOLEAN NOT NULL DEFAULT FALSE,
			created_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS role_permissions (
			resource TEXT NOT NULL,
			role TEXT NOT NULL,
			effect TEXT NOT NULL,
			PRIMARY KEY (resource, role)
		);`,
		`CREATE TABLE IF NOT EXISTS projects (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL,
			name TEXT NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			status TEXT NOT NULL,
			client_user_id TEXT NOT NULL DEFAULT '',
			supervisor_user_id TEXT NOT NULL DEFAULT '',
			budget_total_cents BIGINT NOT NULL DEFAULT 0,
			spent_total_cents BIGINT NOT NULL DEFAULT 0,
			start_date TEXT NOT NULL DEFAULT '',
			planned_end_date TEXT NOT NULL DEFAULT '',
			latitude_center DOUBLE PRECISION NOT NULL DEFAULT 0,
			longitude_center DOUBLE PRECISION NOT NULL DEFAULT 0,
			geofence_radius_m INTEGER NOT NULL DEFAULT 100,
			created_by_user_id TEXT NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS tasks (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL,
			project_id TEXT NOT NULL,
			title TEXT NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			assigned_to_user_id TEXT NOT NULL DEFAULT '',
			status TEXT NOT NULL,
			start_date TEXT NOT NULL DEFAULT '',
			end_date TEXT NOT NULL DEFAULT '',
			expected_finish_quality TEXT NOT NULL DEFAULT '',
			technical_spec_text TEXT NOT NULL DEFAULT '',
			budget_cents BIGINT NOT NULL DEFAULT 0,
			spent_cents BIGINT NOT NULL DEFAULT 0,
			progress_percent INTEGER NOT NULL DEFAULT 0,
			predecessor_task_id TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS deliverables (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL,
			project_id TEXT NOT NULL,
			task_id TEXT NOT NULL,
			title TEXT NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			due_date TEXT NOT NULL DEFAULT '',
			status TEXT NOT NULL,
			client_visible INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS upload_sessions (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL,
			project_id TEXT NOT NULL,
			task_id TEXT NOT NULL,
			requested_by_user_id TEXT NOT NULL,
			file_name TEXT NOT NULL,
			content_type TEXT NOT NULL,
			intended_size_bytes BIGINT NOT NULL,
			latitude DOUBLE PRECISION NOT NULL,
			longitude DOUBLE PRECISION NOT NULL,
			upload_token TEXT NOT NULL,
			local_path TEXT NOT NULL DEFAULT '',
			status TEXT NOT NULL,
			expires_at TEXT NOT NULL,
			created_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS evidences (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL,
			project_id TEXT NOT NULL,
			task_id TEXT NOT NULL,
			uploaded_by_user_id TEXT NOT NULL,
			approved_by_user_id TEXT NOT NULL DEFAULT '',
			file_name TEXT NOT NULL,
			mime_type TEXT NOT NULL,
			file_size_bytes BIGINT NOT NULL,
			object_path TEXT NOT NULL,
			url_archivo TEXT NOT NULL,
			status TEXT NOT NULL,
			latitude DOUBLE PRECISION NOT NULL,
			longitude DOUBLE PRECISION NOT NULL,
			metadata_exif TEXT NOT NULL DEFAULT '',
			approval_comment TEXT NOT NULL DEFAULT '',
			rejection_reason TEXT NOT NULL DEFAULT '',
			is_visible_to_client INTEGER NOT NULL DEFAULT 0,
			ai_processing_status TEXT NOT NULL DEFAULT 'not_requested',
			quality_score INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			approved_at TEXT NOT NULL DEFAULT ''
		);`,
		`CREATE TABLE IF NOT EXISTS ia_audits (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL,
			evidence_id TEXT NOT NULL,
			score INTEGER NOT NULL,
			json_feedback TEXT NOT NULL,
			critical_alert INTEGER NOT NULL DEFAULT 0,
			model_version TEXT NOT NULL,
			created_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS blueprints (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL,
			project_id TEXT NOT NULL,
			uploaded_by_user_id TEXT NOT NULL,
			file_name TEXT NOT NULL,
			file_type TEXT NOT NULL,
			file_size_bytes BIGINT NOT NULL,
			url_archivo TEXT NOT NULL,
			url_preview TEXT NOT NULL DEFAULT '',
			status TEXT NOT NULL,
			scale TEXT NOT NULL DEFAULT '1:50',
			version INTEGER NOT NULL DEFAULT 1,
			metadata_json TEXT NOT NULL DEFAULT '{}',
			created_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS quality_alerts (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL,
			project_id TEXT NOT NULL,
			task_id TEXT NOT NULL,
			evidence_id TEXT NOT NULL,
			severity TEXT NOT NULL,
			title TEXT NOT NULL,
			description TEXT NOT NULL,
			status TEXT NOT NULL,
			created_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS expenses (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL,
			project_id TEXT NOT NULL,
			task_id TEXT NOT NULL DEFAULT '',
			title TEXT NOT NULL,
			amount_cents BIGINT NOT NULL,
			category TEXT NOT NULL,
			vendor TEXT NOT NULL,
			status TEXT NOT NULL,
			evidence_id TEXT NOT NULL DEFAULT '',
			uploaded_by_user_id TEXT NOT NULL,
			date TEXT NOT NULL,
			created_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS daily_logs (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL,
			project_id TEXT NOT NULL,
			date TEXT NOT NULL,
			weather TEXT NOT NULL,
			headcount INTEGER NOT NULL,
			manpower_json TEXT NOT NULL DEFAULT '{}',
			narrative TEXT NOT NULL,
			accidents TEXT NOT NULL DEFAULT '',
			status TEXT NOT NULL,
			uploaded_by_user_id TEXT NOT NULL,
			created_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS budget_adjustments (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL,
			project_id TEXT NOT NULL,
			amount_cents BIGINT NOT NULL,
			reason TEXT NOT NULL,
			approved_by_user_id TEXT NOT NULL,
			date TEXT NOT NULL,
			created_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS project_messages (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL,
			project_id TEXT NOT NULL,
			from_user_id TEXT NOT NULL,
			to_user_id TEXT NOT NULL DEFAULT '',
			text TEXT NOT NULL,
			type TEXT NOT NULL,
			status TEXT NOT NULL,
			created_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS verifications (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL,
			user_id TEXT NOT NULL,
			type TEXT NOT NULL,
			token TEXT NOT NULL,
			expires_at TEXT NOT NULL,
			created_at TEXT NOT NULL,
			UNIQUE(token)
		);`,
		`CREATE TABLE IF NOT EXISTS subscriptions (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL UNIQUE REFERENCES tenants(id),
			stripe_customer_id TEXT NOT NULL DEFAULT '',
			stripe_subscription_id TEXT NOT NULL DEFAULT '',
			plan TEXT NOT NULL DEFAULT 'starter',
			status TEXT NOT NULL DEFAULT 'trialing',
			trial_ends_at TIMESTAMPTZ,
			current_period_ends_at TIMESTAMPTZ,
			cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);`,
		`CREATE TABLE IF NOT EXISTS payment_events (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL DEFAULT '',
			stripe_event_id TEXT NOT NULL UNIQUE,
			event_type TEXT NOT NULL,
			amount_cents INTEGER NOT NULL DEFAULT 0,
			currency TEXT NOT NULL DEFAULT 'usd',
			status TEXT NOT NULL DEFAULT '',
			raw_payload TEXT NOT NULL DEFAULT '',
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);`,
		`CREATE TABLE IF NOT EXISTS notifications (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
			user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
			kind TEXT NOT NULL,
			severity TEXT NOT NULL,
			title TEXT NOT NULL,
			body TEXT NOT NULL,
			resource TEXT,
			threshold_pct INT,
			read_at TIMESTAMPTZ,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);`,
		`CREATE INDEX IF NOT EXISTS idx_notifications_tenant_created ON notifications(tenant_id, created_at DESC);`,
		`CREATE TABLE IF NOT EXISTS usage_metrics (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL REFERENCES tenants(id),
			metric_type TEXT NOT NULL,
			value BIGINT NOT NULL DEFAULT 0,
			period_start DATE NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			UNIQUE(tenant_id, metric_type, period_start)
		);`,
	}
	for _, stmt := range schema {
		if _, err := s.db.ExecContext(ctx, stmt); err != nil {
			return fmt.Errorf("initial schema: %w", err)
		}
	}
	return s.runMigrations(ctx)
}

// runMigrations applies ordered, idempotent migrations and records each
// successful step in schema_migrations. Fresh databases and upgraded ones
// converge to the same end state because every step uses IF NOT EXISTS.
func (s *Service) runMigrations(ctx context.Context) error {
	if _, err := s.db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version INTEGER PRIMARY KEY,
			name TEXT NOT NULL,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	type mig struct {
		version int
		name    string
		sql     string
	}
	steps := []mig{
		{1, "alter_tasks_predecessor", `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS predecessor_task_id TEXT NOT NULL DEFAULT ''`},
		{2, "alter_daily_logs_manpower", `ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS manpower_json TEXT NOT NULL DEFAULT '{}'`},
		{3, "alter_tasks_comparison_photo", `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS comparison_photo_url TEXT NOT NULL DEFAULT ''`},
		{4, "idx_projects_tenant", `CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects(tenant_id)`},
		{5, "idx_tasks_project", `CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id)`},
		{6, "idx_tasks_assigned", `CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to_user_id)`},
		{7, "idx_evidences_task", `CREATE INDEX IF NOT EXISTS idx_evidences_task ON evidences(task_id)`},
		{8, "idx_evidences_project", `CREATE INDEX IF NOT EXISTS idx_evidences_project ON evidences(project_id)`},
		{9, "idx_users_tenant", `CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id)`},
		{10, "idx_users_email", `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`},
		{11, "idx_subscriptions_status", `CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status)`},
		{12, "idx_subscriptions_stripe_sub", `CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub ON subscriptions(stripe_subscription_id)`},
		{13, "idx_payment_events_tenant", `CREATE INDEX IF NOT EXISTS idx_payment_events_tenant ON payment_events(tenant_id)`},
		{14, "idx_usage_metrics_tenant", `CREATE INDEX IF NOT EXISTS idx_usage_metrics_tenant ON usage_metrics(tenant_id)`},
		{15, "idx_evidences_tenant", `CREATE INDEX IF NOT EXISTS idx_evidences_tenant ON evidences(tenant_id)`},
		{16, "idx_tasks_tenant", `CREATE INDEX IF NOT EXISTS idx_tasks_tenant ON tasks(tenant_id)`},
		{17, "idx_deliverables_task", `CREATE INDEX IF NOT EXISTS idx_deliverables_task ON deliverables(task_id)`},
		{18, "idx_upload_sessions_status", `CREATE INDEX IF NOT EXISTS idx_upload_sessions_status ON upload_sessions(status, expires_at)`},
		{19, "backfill_subscriptions", `
			INSERT INTO subscriptions (id, tenant_id, plan, status, trial_ends_at)
			SELECT 'sub_' || substr(md5(t.id), 1, 16), t.id, 'starter', 'trialing', NOW() + INTERVAL '14 days'
			FROM tenants t
			WHERE NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.tenant_id = t.id)
		`},
		{20, "demo_tenant_enterprise", `
			UPDATE subscriptions
			SET plan='enterprise', status='active', trial_ends_at=NULL,
			    current_period_ends_at = NOW() + INTERVAL '100 years', updated_at = NOW()
			WHERE tenant_id IN (SELECT id FROM tenants WHERE slug='demo-operations-lab')
		`},
		{21, "create_demo_leads", `
			CREATE TABLE IF NOT EXISTS demo_leads (
				id                 TEXT PRIMARY KEY,
				email              TEXT NOT NULL,
				name               TEXT NOT NULL,
				company            TEXT NOT NULL DEFAULT '',
				source             TEXT NOT NULL DEFAULT '',
				ip_address         TEXT NOT NULL DEFAULT '',
				user_agent         TEXT NOT NULL DEFAULT '',
				tenant_id          TEXT NOT NULL DEFAULT '',
				demo_user_id       TEXT NOT NULL DEFAULT '',
				expires_at         TIMESTAMPTZ NOT NULL,
				purged_at          TIMESTAMPTZ,
				resend_contact_id  TEXT NOT NULL DEFAULT '',
				bounced            BOOLEAN NOT NULL DEFAULT FALSE,
				unsubscribed       BOOLEAN NOT NULL DEFAULT FALSE,
				opened_count       INTEGER NOT NULL DEFAULT 0,
				clicked_count      INTEGER NOT NULL DEFAULT 0,
				created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
			)
		`},
		{22, "idx_demo_leads_email", `CREATE INDEX IF NOT EXISTS idx_demo_leads_email ON demo_leads(email)`},
		{23, "idx_demo_leads_expires", `CREATE INDEX IF NOT EXISTS idx_demo_leads_expires ON demo_leads(expires_at) WHERE purged_at IS NULL`},
	}

	for _, m := range steps {
		var exists int
		if err := s.db.QueryRowContext(ctx,
			`SELECT 1 FROM schema_migrations WHERE version = $1`, m.version).Scan(&exists); err == nil {
			continue // already applied
		} else if !errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("check migration %d: %w", m.version, err)
		}
		if _, err := s.db.ExecContext(ctx, m.sql); err != nil {
			s.logger.Error("migration failed", "version", m.version, "name", m.name, "err", err)
			return fmt.Errorf("apply migration %d (%s): %w", m.version, m.name, err)
		}
		if _, err := s.db.ExecContext(ctx,
			`INSERT INTO schema_migrations (version, name) VALUES ($1, $2)
			 ON CONFLICT (version) DO NOTHING`, m.version, m.name); err != nil {
			return fmt.Errorf("record migration %d: %w", m.version, err)
		}
		s.logger.Info("migration applied", "version", m.version, "name", m.name)
	}
	return nil
}

func (s *Service) seedDefaults(ctx context.Context) error {
	var tenantCount int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM tenants`).Scan(&tenantCount); err != nil {
		return err
	}
	if tenantCount > 0 {
		return nil
	}

	ownerPassword, err := HashPassword("demo123")
	if err != nil {
		return err
	}

	now := nowText()
	demoTenantID := newID("ten")
	ownerID := newID("usr")
	supervisorID := newID("usr")
	helperID := newID("usr")
	clientID := newID("usr")
	projectID := newID("prj")
	taskID := newID("tsk")
	deliverableID := newID("del")

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `INSERT INTO tenants (id, name, slug, created_at) VALUES ($1, $2, $3, $4)`, demoTenantID, "Demo Operations Lab", "demo-operations-lab", now); err != nil {
		return err
	}
	users := []struct {
		id, tenantID, email, fullName, role, hash string
	}{
		{ownerID, demoTenantID, "owner@demo.local", "Olivia Owner", RoleOwner, ownerPassword},
		{supervisorID, demoTenantID, "supervisor@demo.local", "Sergio Supervisor", RoleSupervisor, ownerPassword},
		{helperID, demoTenantID, "helper@demo.local", "Hector Helper", RoleHelper, ownerPassword},
		{clientID, demoTenantID, "client@demo.local", "Clara Client", RoleClient, ownerPassword},
	}
	for _, user := range users {
		if _, err := tx.ExecContext(ctx, `INSERT INTO users (id, tenant_id, email, password_hash, full_name, role, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`, user.id, user.tenantID, user.email, user.hash, user.fullName, user.role, now); err != nil {
			return err
		}
	}

	defaultRules := []RBACRule{
		{Resource: "tenant.list", Role: RoleAdmin, Effect: "allow"},
		{Resource: "rbac.manage", Role: RoleAdmin, Effect: "allow"},
		{Resource: "user.manage", Role: RoleOwner, Effect: "allow"},
		{Resource: "project.create", Role: RoleOwner, Effect: "allow"},
		{Resource: "project.view", Role: RoleOwner, Effect: "allow"},
		{Resource: "project.view", Role: RoleSupervisor, Effect: "allow"},
		{Resource: "project.view", Role: RoleClient, Effect: "allow"},
		{Resource: "budget.manage", Role: RoleOwner, Effect: "allow"},
		{Resource: "budget.view", Role: RoleOwner, Effect: "allow"},
		{Resource: "budget.view", Role: RoleSupervisor, Effect: "scoped"},
		{Resource: "budget.view", Role: RoleClient, Effect: "scoped"},
		{Resource: "timeline.edit", Role: RoleOwner, Effect: "allow"},
		{Resource: "timeline.edit", Role: RoleSupervisor, Effect: "allow"},
		{Resource: "deliverable.manage", Role: RoleOwner, Effect: "allow"},
		{Resource: "deliverable.manage", Role: RoleSupervisor, Effect: "allow"},
		{Resource: "evidence.upload", Role: RoleOwner, Effect: "allow"},
		{Resource: "evidence.upload", Role: RoleSupervisor, Effect: "allow"},
		{Resource: "evidence.upload", Role: RoleHelper, Effect: "allow"},
		{Resource: "evidence.approve", Role: RoleOwner, Effect: "allow"},
		{Resource: "evidence.approve", Role: RoleSupervisor, Effect: "allow"},
		{Resource: "export.csv", Role: RoleOwner, Effect: "allow"},
		{Resource: "export.csv", Role: RoleSupervisor, Effect: "allow"},
	}
	for _, rule := range defaultRules {
		if _, err := tx.ExecContext(ctx, `INSERT INTO role_permissions (resource, role, effect) VALUES ($1, $2, $3)`, rule.Resource, rule.Role, rule.Effect); err != nil {
			return err
		}
	}

	if _, err := tx.ExecContext(ctx, `INSERT INTO projects (id, tenant_id, name, description, status, client_user_id, supervisor_user_id, budget_total_cents, spent_total_cents, start_date, planned_end_date, latitude_center, longitude_center, geofence_radius_m, created_by_user_id, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
		projectID, demoTenantID, "Demo Product Launch", "Sample project with end-to-end tracking", "active", clientID, supervisorID, 180000000, 92000000, "2026-03-01", "2026-05-30", 19.4326, -99.1332, 120, ownerID, now, now); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO tasks (id, tenant_id, project_id, title, description, assigned_to_user_id, status, start_date, end_date, expected_finish_quality, technical_spec_text, budget_cents, spent_cents, progress_percent, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
		taskID, demoTenantID, projectID, "Precision assembly batch A", "Primary production line quality checkpoint", helperID, "in_progress", "2026-03-10", "2026-04-10", "Uniform polished finish without visible seams", "2mm joint tolerance, exact leveling, no edge chipping", 48000000, 26000000, 55, now, now); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO deliverables (id, tenant_id, project_id, task_id, title, description, due_date, status, client_visible, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
		deliverableID, demoTenantID, projectID, taskID, "Finished assembly delivery", "Completed and quality-checked output", "2026-04-10", "pending", 1, now, now); err != nil {
		return err
	}

	return tx.Commit()
}

func (s *Service) normalizeDemoContent(ctx context.Context) error {
	updates := []struct {
		query string
		args  []any
	}{
		{
			query: `UPDATE projects SET name = $1, description = $2 WHERE name = $3`,
			args:  []any{"Demo Product Launch", "Sample project with end-to-end tracking", "Demo Lobby Corporativo"},
		},
		{
			query: `UPDATE tasks SET title = $1, description = $2, expected_finish_quality = $3, technical_spec_text = $4 WHERE title = $5`,
			args: []any{
				"Precision assembly batch A",
				"Primary production line quality checkpoint",
				"Uniform polished finish without visible seams",
				"2mm joint tolerance, exact leveling, no edge chipping",
				"Colocación de porcelanato lobby",
			},
		},
		{
			query: `UPDATE deliverables SET title = $1, description = $2 WHERE title = $3`,
			args:  []any{"Finished assembly delivery", "Completed and quality-checked output", "Entrega de Lobby"},
		},
	}

	for _, update := range updates {
		if _, err := s.db.ExecContext(ctx, update.query, update.args...); err != nil {
			return err
		}
	}

	return nil
}

// ensurePlatformAdmin upserts the SaaS operator account from env vars on every
// boot. If PLATFORM_ADMIN_EMAIL is empty, any pre-existing platform admins are
// deleted so no stale hardcoded credentials remain.
func (s *Service) ensurePlatformAdmin(ctx context.Context) error {
	email := strings.TrimSpace(strings.ToLower(s.cfg.PlatformAdminEmail))
	password := s.cfg.PlatformAdminPassword

	if email == "" || password == "" {
		if _, err := s.db.ExecContext(ctx, `DELETE FROM users WHERE tenant_id = '' AND role = $1`, RoleAdmin); err != nil {
			return fmt.Errorf("purge platform admins: %w", err)
		}
		s.logger.Warn("no PLATFORM_ADMIN_EMAIL configured; platform admin accounts purged")
		return nil
	}

	hash, err := HashPassword(password)
	if err != nil {
		return err
	}
	now := nowText()

	// Remove any other platform admin (e.g. stale hardcoded admin@projectpulse.local).
	if _, err := s.db.ExecContext(ctx, `DELETE FROM users WHERE tenant_id = '' AND role = $1 AND email <> $2`, RoleAdmin, email); err != nil {
		return fmt.Errorf("purge stale platform admins: %w", err)
	}

	var existingID string
	err = s.db.QueryRowContext(ctx, `SELECT id FROM users WHERE email = $1`, email).Scan(&existingID)
	if err == sql.ErrNoRows {
		if _, err := s.db.ExecContext(ctx,
			`INSERT INTO users (id, tenant_id, email, password_hash, full_name, role, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
			newID("usr"), "", email, hash, "Platform Admin", RoleAdmin, now); err != nil {
			return fmt.Errorf("insert platform admin: %w", err)
		}
		s.logger.Info("platform admin created", "email", email)
		return nil
	}
	if err != nil {
		return err
	}
	if _, err := s.db.ExecContext(ctx,
		`UPDATE users SET password_hash = $1, role = $2, tenant_id = '' WHERE id = $3`,
		hash, RoleAdmin, existingID); err != nil {
		return fmt.Errorf("update platform admin: %w", err)
	}
	s.logger.Info("platform admin upserted", "email", email)
	return nil
}

func (s *Service) permissionEffect(ctx context.Context, role, resource string) string {
	if role == "" {
		return "deny"
	}
	var effect string
	err := s.db.QueryRowContext(ctx, `SELECT effect FROM role_permissions WHERE role = $1 AND resource = $2`, role, resource).Scan(&effect)
	if err != nil {
		return "deny"
	}
	return effect
}

func newID(prefix string) string {
	return fmt.Sprintf("%s_%d", prefix, time.Now().UnixNano())
}

func nowText() string {
	return time.Now().UTC().Format(time.RFC3339)
}

func boolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func intToBool(value int) bool {
	return value == 1
}

func (s *Service) ensureProjectAccess(ctx context.Context, actor Claims, project Project) error {
	switch actor.Role {
	case RoleOwner:
		if actor.TenantID == project.TenantID {
			return nil
		}
	case RoleSupervisor:
		if actor.UserID == project.SupervisorUserID {
			return nil
		}
	case RoleClient:
		if actor.UserID == project.ClientUserID {
			return nil
		}
	}
	return errors.New("forbidden")
}

func (s *Service) ensureTaskUploadAccess(ctx context.Context, actor Claims, task Task, project Project) error {
	switch actor.Role {
	case RoleOwner, RoleSupervisor:
		return s.ensureProjectAccess(ctx, actor, project)
	case RoleHelper:
		if task.AssignedToUserID == actor.UserID {
			return nil
		}
	}
	return errors.New("forbidden")
}

func (s *Service) distanceMeters(lat1, lon1, lat2, lon2 float64) float64 {
	const earthRadius = 6371000.0
	toRad := func(v float64) float64 { return v * math.Pi / 180 }
	dLat := toRad(lat2 - lat1)
	dLon := toRad(lon2 - lon1)
	a := math.Sin(dLat/2)*math.Sin(dLat/2) + math.Cos(toRad(lat1))*math.Cos(toRad(lat2))*math.Sin(dLon/2)*math.Sin(dLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return earthRadius * c
}

func fileNameSafe(name string) string {
	replacer := strings.NewReplacer("/", "-", "..", "-", "\\", "-", "\x00", "")
	return replacer.Replace(name)
}

func constantTimeEqual(a, b string) bool {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}
