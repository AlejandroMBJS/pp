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
	if cfg.JWTSecret == "" {
		return nil, errors.New("JWT_SECRET is required")
	}
	storage, err := NewLocalStorage(cfg.UploadDir)
	if err != nil {
		return nil, err
	}

	db, err := sql.Open("postgres", cfg.DatabaseURL)
	if err != nil {
		return nil, err
	}

	svc := &Service{
		db:        db,
		storage:   storage,
		mailer:    &ConsoleEmailSender{},
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
	go svc.auditWorker()
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
			return err
		}
	}
	// Migrations for development
	_, _ = s.db.ExecContext(ctx, `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS predecessor_task_id TEXT NOT NULL DEFAULT ''`)
	_, _ = s.db.ExecContext(ctx, `ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS manpower_json TEXT NOT NULL DEFAULT '{}'`)
	_, _ = s.db.ExecContext(ctx, `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS comparison_photo_url TEXT NOT NULL DEFAULT ''`)

	// Performance indexes
	_, _ = s.db.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects(tenant_id)`)
	_, _ = s.db.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id)`)
	_, _ = s.db.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to_user_id)`)
	_, _ = s.db.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS idx_evidences_task ON evidences(task_id)`)
	_, _ = s.db.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS idx_evidences_project ON evidences(project_id)`)
	_, _ = s.db.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id)`)
	_, _ = s.db.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`)
	_, _ = s.db.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status)`)
	_, _ = s.db.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub ON subscriptions(stripe_subscription_id)`)
	_, _ = s.db.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS idx_payment_events_tenant ON payment_events(tenant_id)`)
	_, _ = s.db.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS idx_usage_metrics_tenant ON usage_metrics(tenant_id)`)

	// Backfill: every existing tenant gets a 14-day trial subscription
	// (idempotent — only inserts where missing).
	_, _ = s.db.ExecContext(ctx, `
		INSERT INTO subscriptions (id, tenant_id, plan, status, trial_ends_at)
		SELECT 'sub_' || substr(md5(t.id), 1, 16), t.id, 'starter', 'trialing', NOW() + INTERVAL '14 days'
		FROM tenants t
		WHERE NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.tenant_id = t.id)
	`)
	// Demo tenant gets enterprise forever (skipped from billing flows).
	_, _ = s.db.ExecContext(ctx, `
		UPDATE subscriptions
		SET plan='enterprise', status='active', trial_ends_at=NULL,
		    current_period_ends_at = NOW() + INTERVAL '100 years', updated_at = NOW()
		WHERE tenant_id IN (SELECT id FROM tenants WHERE slug='demo-operations-lab')
	`)
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

	adminPassword, err := HashPassword("demo123")
	if err != nil {
		return err
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
		{newID("usr"), "", "admin@projectpulse.local", "Platform Admin", RoleAdmin, adminPassword},
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
			query: `UPDATE users
				SET email = $1
				WHERE tenant_id = '' AND role = $2 AND email = $3
				AND NOT EXISTS (SELECT 1 FROM users WHERE email = $1)`,
			args: []any{"admin@projectpulse.local", RoleAdmin, "admin@arquicheck.local"},
		},
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
