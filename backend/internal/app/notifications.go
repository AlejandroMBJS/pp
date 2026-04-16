package app

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

// Notification is an in-app message surfaced to users (e.g. quota warnings).
// Persisted in the `notifications` table.
type Notification struct {
	ID           string     `json:"id"`
	TenantID     string     `json:"tenant_id"`
	UserID       string     `json:"user_id,omitempty"`
	Kind         string     `json:"kind"`
	Severity     string     `json:"severity"`
	Title        string     `json:"title"`
	Body         string     `json:"body"`
	Resource     string     `json:"resource,omitempty"`
	ThresholdPct int        `json:"threshold_pct,omitempty"`
	ReadAt       *time.Time `json:"read_at,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
}

// CreateNotification inserts a new in-app notification. Best-effort; returns
// the generated ID on success.
func (s *Service) CreateNotification(ctx context.Context, n Notification) (string, error) {
	if n.ID == "" {
		n.ID = newID("ntf")
	}
	if n.Severity == "" {
		n.Severity = "info"
	}
	var userID any
	if n.UserID != "" {
		userID = n.UserID
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO notifications (id, tenant_id, user_id, kind, severity, title, body, resource, threshold_pct)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`, n.ID, n.TenantID, userID, n.Kind, n.Severity, n.Title, n.Body, nullableString(n.Resource), n.ThresholdPct)
	return n.ID, err
}

// hasRecentNotification returns true if a notification of the same kind for
// the same tenant exists within the last `window`. Used for de-dup so we don't
// spam users with repeated warnings.
func (s *Service) hasRecentNotification(ctx context.Context, tenantID, kind string, window time.Duration) bool {
	var count int
	err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM notifications
		WHERE tenant_id = $1 AND kind = $2 AND created_at > NOW() - ($3::text)::interval
	`, tenantID, kind, fmt.Sprintf("%d seconds", int(window.Seconds()))).Scan(&count)
	if err != nil {
		return false
	}
	return count > 0
}

// ListNotificationsForUser returns notifications for a user (or tenant-wide
// ones with no user_id). Ordered newest first. If unreadOnly is true, only
// rows where read_at IS NULL are returned.
func (s *Service) ListNotificationsForUser(ctx context.Context, tenantID, userID string, unreadOnly bool) ([]Notification, error) {
	q := `SELECT id, tenant_id, COALESCE(user_id, ''), kind, severity, title, body,
	             COALESCE(resource, ''), COALESCE(threshold_pct, 0), read_at, created_at
	      FROM notifications
	      WHERE tenant_id = $1 AND (user_id = $2 OR user_id IS NULL)`
	if unreadOnly {
		q += ` AND read_at IS NULL`
	}
	q += ` ORDER BY created_at DESC LIMIT 100`
	rows, err := s.db.QueryContext(ctx, q, tenantID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]Notification, 0)
	for rows.Next() {
		var n Notification
		var readAt sql.NullTime
		if err := rows.Scan(&n.ID, &n.TenantID, &n.UserID, &n.Kind, &n.Severity,
			&n.Title, &n.Body, &n.Resource, &n.ThresholdPct, &readAt, &n.CreatedAt); err != nil {
			return nil, err
		}
		if readAt.Valid {
			t := readAt.Time
			n.ReadAt = &t
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

// MarkNotificationRead flips read_at to NOW() for a single notification,
// scoped to the actor's tenant.
func (s *Service) MarkNotificationRead(ctx context.Context, tenantID, notificationID string) error {
	res, err := s.db.ExecContext(ctx,
		`UPDATE notifications SET read_at = NOW() WHERE id = $1 AND tenant_id = $2 AND read_at IS NULL`,
		notificationID, tenantID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return errors.New("notification not found or already read")
	}
	return nil
}

// MarkAllNotificationsRead marks every notification belonging to the given
// (tenant, user) pair as read.
func (s *Service) MarkAllNotificationsRead(ctx context.Context, tenantID, userID string) (int64, error) {
	res, err := s.db.ExecContext(ctx, `
		UPDATE notifications SET read_at = NOW()
		WHERE tenant_id = $1 AND (user_id = $2 OR user_id IS NULL) AND read_at IS NULL
	`, tenantID, userID)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return n, nil
}

// maybeWarnQuotaInt creates a warning notification when usage of a count-based
// resource crosses 80%. Limits of -1 (unlimited) short-circuit to no-op.
func (s *Service) maybeWarnQuotaInt(ctx context.Context, tenantID, resource string, current, limit int) {
	if limit <= 0 {
		return
	}
	pct := (current * 100) / limit
	if pct < 80 || pct >= 100 {
		return
	}
	s.notifyQuotaWarning(ctx, tenantID, resource, int64(current), int64(limit), pct)
}

// maybeWarnQuota is the byte-based variant.
func (s *Service) maybeWarnQuota(ctx context.Context, tenantID, resource string, current, limit int64) {
	if limit <= 0 {
		return
	}
	pct := int((current * 100) / limit)
	if pct < 80 || pct >= 100 {
		return
	}
	s.notifyQuotaWarning(ctx, tenantID, resource, current, limit, pct)
}

// notifyQuotaWarning persists a warning notification + sends an email to
// owners. De-duped: skipped if a notification of the same kind exists in the
// last 24h.
func (s *Service) notifyQuotaWarning(ctx context.Context, tenantID, resource string, current, limit int64, pct int) {
	kind := "quota." + resource + ".warning"
	if s.hasRecentNotification(ctx, tenantID, kind, 24*time.Hour) {
		return
	}
	plan := s.effectivePlan(ctx, tenantID)
	tenantName := s.tenantNameForID(ctx, tenantID)
	title := fmt.Sprintf("Estás al %d%% de tu límite de %s", pct, humanResource(resource))
	body := fmt.Sprintf("Tu workspace %s está al %d%% de su límite de %s en el plan %s. Considera upgradear para evitar interrupciones.",
		tenantName, pct, humanResource(resource), plan)
	_, err := s.CreateNotification(ctx, Notification{
		TenantID: tenantID, Kind: kind, Severity: "warning",
		Title: title, Body: body, Resource: resource, ThresholdPct: pct,
	})
	if err != nil {
		s.logger.Warn("notification.create failed", "kind", kind, "err", err.Error())
	}
	go s.sendQuotaEmailToOwners(context.Background(), tenantID, resource, current, limit, pct, false)
}

// notifyQuotaBlock is the 100% (hard block) variant.
func (s *Service) notifyQuotaBlock(ctx context.Context, tenantID, resource string, current, limit int64) {
	kind := "quota." + resource + ".block"
	if s.hasRecentNotification(ctx, tenantID, kind, 24*time.Hour) {
		return
	}
	plan := s.effectivePlan(ctx, tenantID)
	tenantName := s.tenantNameForID(ctx, tenantID)
	title := fmt.Sprintf("Alcanzaste el límite de %s", humanResource(resource))
	body := fmt.Sprintf("Tu workspace %s alcanzó el límite de %s en el plan %s. Upgrade para continuar.",
		tenantName, humanResource(resource), plan)
	_, err := s.CreateNotification(ctx, Notification{
		TenantID: tenantID, Kind: kind, Severity: "critical",
		Title: title, Body: body, Resource: resource, ThresholdPct: 100,
	})
	if err != nil {
		s.logger.Warn("notification.create failed", "kind", kind, "err", err.Error())
	}
	go s.sendQuotaEmailToOwners(context.Background(), tenantID, resource, current, limit, 100, true)
}

func (s *Service) sendQuotaEmailToOwners(ctx context.Context, tenantID, resource string, current, limit int64, pct int, block bool) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, email, full_name FROM users WHERE tenant_id = $1 AND role = $2`,
		tenantID, RoleOwner)
	if err != nil {
		return
	}
	defer rows.Close()
	tenantName := s.tenantNameForID(ctx, tenantID)
	plan := string(s.effectivePlan(ctx, tenantID))
	for rows.Next() {
		var userID, email, name string
		if err := rows.Scan(&userID, &email, &name); err != nil {
			continue
		}
		// Quota alerts are opt-out-able via the `budget_alert` preference.
		// Hard-block emails are still sent — user can't silence service-stopping events.
		if !block && !s.shouldNotify(ctx, userID, "budget_alert") {
			continue
		}
		if block {
			SendQuotaBlock(ctx, s.mailer, s.logger, email, name, tenantName, resource, plan, current, limit, s.cfg.PublicBase)
		} else {
			SendQuotaWarning(ctx, s.mailer, s.logger, email, name, tenantName, resource, plan, pct, current, limit, s.cfg.PublicBase)
		}
	}
}

// shouldNotify returns true if the user has the given preference enabled
// (or has never configured it — default is on). Unknown keys also default on
// so that new notification types don't get silently blocked.
// This helper only governs opt-out-able dispatches. Transactional emails
// (invite, password reset, email verification, payment_failed hard-stop)
// must NOT consult this and are always sent.
func (s *Service) shouldNotify(ctx context.Context, userID, key string) bool {
	if userID == "" {
		return true
	}
	var enabled bool
	err := s.db.QueryRowContext(ctx,
		`SELECT enabled FROM user_notification_preferences WHERE user_id = $1 AND key = $2`,
		userID, key).Scan(&enabled)
	if err == sql.ErrNoRows {
		return true
	}
	if err != nil {
		// Fail-closed: if we can't read the preference we assume the user opted out.
		// This prevents spam loops when the DB is flaky. Transactional emails bypass
		// this helper entirely.
		s.logger.Warn("shouldNotify query failed; suppressing", "user_id", userID, "key", key, "err", err.Error())
		return false
	}
	return enabled
}

func (s *Service) tenantNameForID(ctx context.Context, tenantID string) string {
	var name string
	_ = s.db.QueryRowContext(ctx, `SELECT name FROM tenants WHERE id = $1`, tenantID).Scan(&name)
	return name
}

func humanResource(r string) string {
	switch r {
	case "projects":
		return "proyectos"
	case "internal_users":
		return "usuarios internos"
	case "client_guests":
		return "invitados cliente"
	case "captures":
		return "capturas mensuales"
	case "storage":
		return "almacenamiento"
	case "blueprints":
		return "planos"
	}
	return r
}

func nullableString(s string) any {
	if s == "" {
		return nil
	}
	return s
}
