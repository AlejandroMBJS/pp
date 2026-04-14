package app

import (
	"context"
	"time"
)

type PlatformTenantRow struct {
	ID            string     `json:"id"`
	Name          string     `json:"name"`
	Slug          string     `json:"slug"`
	CreatedAt     string     `json:"created_at,omitempty"`
	Plan          string     `json:"plan"`
	Status        string     `json:"status"`
	TrialEndsAt   *time.Time `json:"trial_ends_at,omitempty"`
	PeriodEndsAt  *time.Time `json:"period_ends_at,omitempty"`
	UserCount     int        `json:"user_count"`
	ProjectCount  int        `json:"project_count"`
	EvidenceCount int        `json:"evidence_count"`
}

type PlatformOverview struct {
	TotalTenants   int                 `json:"total_tenants"`
	TotalUsers     int                 `json:"total_users"`
	ActiveSubs     int                 `json:"active_subs"`
	TrialingSubs   int                 `json:"trialing_subs"`
	MRRCents       int64               `json:"mrr_cents"`
	ByPlan         map[string]int      `json:"by_plan"`
	RecentSignups  []PlatformTenantRow `json:"recent_signups"`
}

// planPriceCents keeps revenue math local to the platform service. Enterprise
// is tracked as active but priced custom, so it doesn't contribute to MRR.
var planPriceCents = map[string]int64{
	"starter":      0,
	"professional": 4900,
	"business":     14900,
	"enterprise":   0,
}

func (s *Service) PlatformOverview(ctx context.Context, actor Claims) (*PlatformOverview, error) {
	if err := s.requirePlatformAdmin(actor); err != nil {
		return nil, err
	}
	out := &PlatformOverview{ByPlan: map[string]int{}}

	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM tenants`).Scan(&out.TotalTenants); err != nil {
		return nil, err
	}
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE tenant_id <> ''`).Scan(&out.TotalUsers); err != nil {
		return nil, err
	}

	rows, err := s.db.QueryContext(ctx, `SELECT plan, status, COUNT(*) FROM subscriptions GROUP BY plan, status`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var plan, status string
		var count int
		if err := rows.Scan(&plan, &status, &count); err != nil {
			return nil, err
		}
		out.ByPlan[plan] += count
		switch status {
		case "active":
			out.ActiveSubs += count
			out.MRRCents += planPriceCents[plan] * int64(count)
		case "trialing":
			out.TrialingSubs += count
		}
	}

	recent, err := s.platformTenantRows(ctx, `ORDER BY t.created_at DESC LIMIT 10`)
	if err != nil {
		return nil, err
	}
	out.RecentSignups = recent
	return out, nil
}

func (s *Service) PlatformTenants(ctx context.Context, actor Claims) ([]PlatformTenantRow, error) {
	if err := s.requirePlatformAdmin(actor); err != nil {
		return nil, err
	}
	return s.platformTenantRows(ctx, `ORDER BY t.created_at DESC`)
}

func (s *Service) platformTenantRows(ctx context.Context, tail string) ([]PlatformTenantRow, error) {
	q := `SELECT t.id, t.name, t.slug, t.created_at,
		COALESCE(s.plan, 'starter'), COALESCE(s.status, 'trialing'),
		s.trial_ends_at, s.current_period_ends_at,
		(SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) AS users,
		(SELECT COUNT(*) FROM projects p WHERE p.tenant_id = t.id) AS projects,
		(SELECT COUNT(*) FROM evidences e WHERE e.tenant_id = t.id) AS evidences
		FROM tenants t
		LEFT JOIN subscriptions s ON s.tenant_id = t.id ` + tail
	rows, err := s.db.QueryContext(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []PlatformTenantRow
	for rows.Next() {
		var row PlatformTenantRow
		if err := rows.Scan(
			&row.ID, &row.Name, &row.Slug, &row.CreatedAt,
			&row.Plan, &row.Status, &row.TrialEndsAt, &row.PeriodEndsAt,
			&row.UserCount, &row.ProjectCount, &row.EvidenceCount,
		); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}
