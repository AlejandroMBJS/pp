package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/stripe/stripe-go/v76"

	"arquicheck/backend/internal/billing"
)

// Billing-related errors. Handlers translate these to HTTP 402 (Payment Required)
// so the frontend can show the appropriate paywall/upgrade modal.
var (
	ErrFeatureLocked        = errors.New("feature locked: upgrade required")
	ErrQuotaExceeded        = errors.New("quota exceeded: upgrade required")
	ErrSubscriptionRequired = errors.New("subscription required")
)

const demoTenantSlug = "demo-operations-lab"

// isDemoTenant returns true if the tenant is a demo workspace — either the
// legacy shared one (slug demo-operations-lab) or an ephemeral per-request
// tenant with slug prefix `demo-`. Demo tenants bypass ALL billing checks
// (effectively enterprise forever) and are purged automatically on expiry.
func (s *Service) isDemoTenant(ctx context.Context, tenantID string) bool {
	var slug string
	if err := s.db.QueryRowContext(ctx, `SELECT slug FROM tenants WHERE id = $1`, tenantID).Scan(&slug); err != nil {
		return false
	}
	return strings.HasPrefix(slug, "demo-")
}

// stripePriceMap returns the configured price ID for each paid plan.
func (s *Service) stripePriceMap() map[billing.Plan]string {
	return map[billing.Plan]string{
		billing.PlanProfessional: s.cfg.StripePriceProfessional,
		billing.PlanBusiness:     s.cfg.StripePriceBusiness,
		billing.PlanEnterprise:   s.cfg.StripePriceEnterprise,
	}
}

// GetSubscription returns the current subscription for a tenant, with computed
// days-until-trial-end. If no row exists (shouldn't happen post-backfill), it
// synthesizes a default trialing one.
func (s *Service) GetSubscription(ctx context.Context, tenantID string) (Subscription, error) {
	if tenantID == "" {
		// Platform admin has no tenant → no subscription. Callers (billing UI)
		// should never hit this path; we return a harmless synthetic so the
		// admin dashboard doesn't 500 if it accidentally polls the endpoint.
		return Subscription{ID: "platform", TenantID: "", Plan: "enterprise", Status: "active"}, nil
	}
	if s.isDemoTenant(ctx, tenantID) {
		return Subscription{
			ID: "demo", TenantID: tenantID,
			Plan: "enterprise", Status: "active",
		}, nil
	}
	var sub Subscription
	var trialEnd, periodEnd sql.NullTime
	err := s.db.QueryRowContext(ctx, `
		SELECT id, tenant_id, stripe_customer_id, stripe_subscription_id, plan, status,
		       trial_ends_at, current_period_ends_at, cancel_at_period_end,
		       COALESCE(currency,'usd')
		FROM subscriptions WHERE tenant_id = $1`, tenantID,
	).Scan(&sub.ID, &sub.TenantID, &sub.StripeCustomerID, &sub.StripeSubscriptionID,
		&sub.Plan, &sub.Status, &trialEnd, &periodEnd, &sub.CancelAtPeriodEnd, &sub.Currency)
	if err == sql.ErrNoRows {
		// Defensive: synthesize a trial entry. Use ON CONFLICT to handle the race
		// where two concurrent requests both see ErrNoRows.
		now := time.Now()
		end := now.Add(14 * 24 * time.Hour)
		subID := newID("sub")
		if _, dbErr := s.db.ExecContext(ctx,
			`INSERT INTO subscriptions (id, tenant_id, plan, status, trial_ends_at) VALUES ($1, $2, 'starter', 'trialing', $3) ON CONFLICT (tenant_id) DO NOTHING`,
			subID, tenantID, end); dbErr != nil {
			s.logger.Error("GetSubscription: failed to create fallback subscription", "tenant", tenantID, "err", dbErr)
		}
		// Re-read to get the actual row (may have been created by concurrent request).
		err = s.db.QueryRowContext(ctx, `
			SELECT id, tenant_id, stripe_customer_id, stripe_subscription_id, plan, status,
			       trial_ends_at, current_period_ends_at, cancel_at_period_end,
			       COALESCE(currency,'usd')
			FROM subscriptions WHERE tenant_id = $1`, tenantID,
		).Scan(&sub.ID, &sub.TenantID, &sub.StripeCustomerID, &sub.StripeSubscriptionID,
			&sub.Plan, &sub.Status, &trialEnd, &periodEnd, &sub.CancelAtPeriodEnd, &sub.Currency)
		if err != nil {
			return Subscription{}, fmt.Errorf("subscription fallback re-read: %w", err)
		}
	} else if err != nil {
		return Subscription{}, err
	}
	if trialEnd.Valid {
		t := trialEnd.Time
		sub.TrialEndsAt = &t
		days := int(time.Until(t).Hours() / 24)
		if days < 0 {
			days = 0
		}
		sub.DaysUntilTrialEnd = days
	}
	if periodEnd.Valid {
		t := periodEnd.Time
		sub.CurrentPeriodEndsAt = &t
	}
	// Reflect expired trial as read_only in the response so clients see the
	// real state. Persist the flip lazily.
	if sub.Status == "trialing" && sub.TrialEndsAt != nil && time.Now().After(*sub.TrialEndsAt) {
		sub.Status = "read_only"
		if _, err := s.db.ExecContext(ctx, `UPDATE subscriptions SET status='read_only', updated_at=NOW() WHERE tenant_id=$1 AND status='trialing'`, tenantID); err != nil {
			s.logger.Warn("failed to persist trial expiration", "tenant", tenantID, "err", err)
		}
	}
	return sub, nil
}

// effectivePlan returns the plan a tenant should be evaluated against. Demo
// tenants always get enterprise. Tenants whose trial expired without paying
// are downgraded to "read_only" — they keep their current plan name but lose
// write capabilities (enforced separately by callers checking status).
func (s *Service) effectivePlan(ctx context.Context, tenantID string) billing.Plan {
	if s.isDemoTenant(ctx, tenantID) {
		return billing.PlanEnterprise
	}
	sub, err := s.GetSubscription(ctx, tenantID)
	if err != nil {
		return billing.PlanStarter
	}
	// Trial expired with no payment → flip to read_only on the fly.
	// Note: GetSubscription already handles this, but guard here too for direct callers.
	if sub.Status == "trialing" && sub.TrialEndsAt != nil && time.Now().After(*sub.TrialEndsAt) {
		if _, err := s.db.ExecContext(ctx, `UPDATE subscriptions SET status='read_only', updated_at=NOW() WHERE tenant_id=$1 AND status='trialing'`, tenantID); err != nil {
			s.logger.Warn("effectivePlan: failed to persist trial expiration", "tenant", tenantID, "err", err)
		}
		sub.Status = "read_only"
	}
	return billing.Plan(sub.Plan)
}

// RequireFeature returns ErrFeatureLocked if the tenant's plan does not include
// the named feature. Demo tenants always pass.
func (s *Service) RequireFeature(ctx context.Context, tenantID, feature string) error {
	if s.isDemoTenant(ctx, tenantID) {
		return nil
	}
	plan := s.effectivePlan(ctx, tenantID)
	if billing.HasFeature(plan, feature) {
		return nil
	}
	return fmt.Errorf("%w: %s", ErrFeatureLocked, feature)
}

// RequireWriteAccess blocks mutations for tenants whose subscription has lapsed.
func (s *Service) RequireWriteAccess(ctx context.Context, tenantID string) error {
	if s.isDemoTenant(ctx, tenantID) {
		return nil
	}
	sub, err := s.GetSubscription(ctx, tenantID)
	if err != nil {
		// Fail closed: if we can't read the subscription we can't safely allow writes.
		return ErrSubscriptionRequired
	}
	if sub.Status == "trialing" && sub.TrialEndsAt != nil && time.Now().After(*sub.TrialEndsAt) {
		return ErrSubscriptionRequired
	}
	switch sub.Status {
	case "read_only", "canceled", "paused", "past_due", "unpaid", "incomplete_expired":
		return ErrSubscriptionRequired
	}
	return nil
}

// CheckProjectQuota validates the tenant can create one more project.
func (s *Service) CheckProjectQuota(ctx context.Context, tenantID string) error {
	if s.isDemoTenant(ctx, tenantID) {
		return nil
	}
	plan := s.effectivePlan(ctx, tenantID)
	limits := billing.PlanLimits[plan]
	var current int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM projects WHERE tenant_id = $1`, tenantID).Scan(&current); err != nil {
		return fmt.Errorf("check project quota: %w", err)
	}
	if !billing.AllowsCount(limits.MaxActiveProjects, current) {
		s.notifyQuotaBlock(ctx, tenantID, "projects", int64(current+1), int64(limits.MaxActiveProjects))
		return fmt.Errorf("%w: active_projects (limit %d, current %d)", ErrQuotaExceeded, limits.MaxActiveProjects, current)
	}
	s.maybeWarnQuotaInt(ctx, tenantID, "projects", current+1, limits.MaxActiveProjects)
	return nil
}

// CheckUserQuota validates the tenant can invite one more user of a given role.
func (s *Service) CheckUserQuota(ctx context.Context, tenantID, role string) error {
	if s.isDemoTenant(ctx, tenantID) {
		return nil
	}
	plan := s.effectivePlan(ctx, tenantID)
	limits := billing.PlanLimits[plan]
	if role == RoleClient {
		var current int
		if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE tenant_id = $1 AND role = $2`, tenantID, RoleClient).Scan(&current); err != nil {
			return fmt.Errorf("check client quota: %w", err)
		}
		if !billing.AllowsCount(limits.MaxClientGuests, current) {
			s.notifyQuotaBlock(ctx, tenantID, "client_guests", int64(current+1), int64(limits.MaxClientGuests))
			return fmt.Errorf("%w: client_guests (limit %d, current %d)", ErrQuotaExceeded, limits.MaxClientGuests, current)
		}
		s.maybeWarnQuotaInt(ctx, tenantID, "client_guests", current+1, limits.MaxClientGuests)
	} else {
		var current int
		if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE tenant_id = $1 AND role IN ($2, $3, $4)`, tenantID, RoleOwner, RoleSupervisor, RoleHelper).Scan(&current); err != nil {
			return fmt.Errorf("check internal user quota: %w", err)
		}
		if !billing.AllowsCount(limits.MaxInternalUsers, current) {
			s.notifyQuotaBlock(ctx, tenantID, "internal_users", int64(current+1), int64(limits.MaxInternalUsers))
			return fmt.Errorf("%w: internal_users (limit %d, current %d)", ErrQuotaExceeded, limits.MaxInternalUsers, current)
		}
		s.maybeWarnQuotaInt(ctx, tenantID, "internal_users", current+1, limits.MaxInternalUsers)
	}
	return nil
}

// CheckBlueprintQuota validates the tenant can upload one more blueprint file.
func (s *Service) CheckBlueprintQuota(ctx context.Context, tenantID string) error {
	if s.isDemoTenant(ctx, tenantID) {
		return nil
	}
	if err := s.RequireFeature(ctx, tenantID, "blueprints_upload"); err != nil {
		return err
	}
	plan := s.effectivePlan(ctx, tenantID)
	limits := billing.PlanLimits[plan]
	var current int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM blueprints WHERE tenant_id = $1`, tenantID).Scan(&current); err != nil {
		return fmt.Errorf("check blueprint quota: %w", err)
	}
	if !billing.AllowsCount(limits.MaxBlueprintFiles, current) {
		s.notifyQuotaBlock(ctx, tenantID, "blueprints", int64(current+1), int64(limits.MaxBlueprintFiles))
		return fmt.Errorf("%w: blueprint_files (limit %d, current %d)", ErrQuotaExceeded, limits.MaxBlueprintFiles, current)
	}
	s.maybeWarnQuotaInt(ctx, tenantID, "blueprints", current+1, limits.MaxBlueprintFiles)
	return nil
}

// CheckStorageQuota validates the tenant has remaining storage bytes.
// Sums file_size_bytes from evidences + blueprints and compares against the
// plan's MaxStorageBytes. `incoming` is the size of the file about to be
// stored — pass 0 for a "current state" check.
func (s *Service) CheckStorageQuota(ctx context.Context, tenantID string, incoming int64) error {
	if s.isDemoTenant(ctx, tenantID) {
		return nil
	}
	plan := s.effectivePlan(ctx, tenantID)
	limits := billing.PlanLimits[plan]
	if limits.MaxStorageBytes == -1 {
		return nil
	}
	var current int64
	if err := s.db.QueryRowContext(ctx, `
		SELECT COALESCE((SELECT SUM(file_size_bytes) FROM evidences WHERE tenant_id = $1), 0)
		     + COALESCE((SELECT SUM(file_size_bytes) FROM blueprints WHERE tenant_id = $1), 0)
	`, tenantID).Scan(&current); err != nil {
		return fmt.Errorf("check storage quota: %w", err)
	}
	if current+incoming > limits.MaxStorageBytes {
		return fmt.Errorf("%w: storage_bytes (limit %d, current %d)", ErrQuotaExceeded, limits.MaxStorageBytes, current+incoming)
	}
	// Warning at 80%.
	s.maybeWarnQuota(ctx, tenantID, "storage", current+incoming, limits.MaxStorageBytes)
	return nil
}

// CheckCaptureQuota validates the tenant has remaining captures this month.
func (s *Service) CheckCaptureQuota(ctx context.Context, tenantID string) error {
	if s.isDemoTenant(ctx, tenantID) {
		return nil
	}
	plan := s.effectivePlan(ctx, tenantID)
	limits := billing.PlanLimits[plan]
	if limits.MaxCapturesPerMonth == -1 {
		return nil
	}
	periodStart := firstOfMonth(time.Now())
	var current int64
	if err := s.db.QueryRowContext(ctx,
		`SELECT COALESCE(value, 0) FROM usage_metrics WHERE tenant_id = $1 AND metric_type = 'captures_per_month' AND period_start = $2`,
		tenantID, periodStart,
	).Scan(&current); err != nil && err != sql.ErrNoRows {
		return fmt.Errorf("check capture quota: %w", err)
	}
	if int(current) >= limits.MaxCapturesPerMonth {
		s.notifyQuotaBlock(ctx, tenantID, "captures", current+1, int64(limits.MaxCapturesPerMonth))
		return fmt.Errorf("%w: captures_per_month (limit %d, current %d)", ErrQuotaExceeded, limits.MaxCapturesPerMonth, current)
	}
	s.maybeWarnQuotaInt(ctx, tenantID, "captures", int(current)+1, limits.MaxCapturesPerMonth)
	return nil
}

// IncrementUsage atomically bumps a usage counter for the current month.
func (s *Service) IncrementUsage(ctx context.Context, tenantID, metricType string, delta int64) {
	if s.isDemoTenant(ctx, tenantID) {
		return
	}
	periodStart := firstOfMonth(time.Now())
	_, _ = s.db.ExecContext(ctx, `
		INSERT INTO usage_metrics (id, tenant_id, metric_type, value, period_start)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (tenant_id, metric_type, period_start)
		DO UPDATE SET value = usage_metrics.value + EXCLUDED.value, updated_at = NOW()
	`, newID("usg"), tenantID, metricType, delta, periodStart)
}

func firstOfMonth(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, time.UTC)
}

// UsageSnapshot is the per-tenant resource consumption against plan limits.
// All fields are current; the frontend pairs them with PlanLimits to render
// usage bars in the owner dashboard.
type UsageSnapshot struct {
	ActiveProjects    int   `json:"active_projects"`
	InternalUsers     int   `json:"internal_users"`
	ClientGuests      int   `json:"client_guests"`
	CapturesThisMonth int64 `json:"captures_this_month"`
	StorageBytes      int64 `json:"storage_bytes"`
	BlueprintFiles    int   `json:"blueprint_files"`
}

// GetCurrentUsage computes a UsageSnapshot for the given tenant. Best-effort:
// counts that fail silently default to 0 rather than bubbling an error, since
// the dashboard should render even if one sub-query breaks.
func (s *Service) GetCurrentUsage(ctx context.Context, tenantID string) UsageSnapshot {
	var u UsageSnapshot
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM projects WHERE tenant_id = $1`, tenantID).Scan(&u.ActiveProjects)
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE tenant_id = $1 AND role IN ($2, $3, $4)`, tenantID, RoleOwner, RoleSupervisor, RoleHelper).Scan(&u.InternalUsers)
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE tenant_id = $1 AND role = $2`, tenantID, RoleClient).Scan(&u.ClientGuests)
	_ = s.db.QueryRowContext(ctx,
		`SELECT COALESCE(value, 0) FROM usage_metrics WHERE tenant_id = $1 AND metric_type = 'captures_per_month' AND period_start = $2`,
		tenantID, firstOfMonth(time.Now()),
	).Scan(&u.CapturesThisMonth)
	_ = s.db.QueryRowContext(ctx, `
		SELECT COALESCE((SELECT SUM(file_size_bytes) FROM evidences WHERE tenant_id = $1), 0)
		     + COALESCE((SELECT SUM(file_size_bytes) FROM blueprints WHERE tenant_id = $1), 0)
	`, tenantID).Scan(&u.StorageBytes)
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM blueprints WHERE tenant_id = $1`, tenantID).Scan(&u.BlueprintFiles)
	return u
}

// StartCheckout creates (or fetches) the Stripe customer for a tenant and
// returns a hosted Checkout Session URL for the requested plan.
func (s *Service) StartCheckout(ctx context.Context, actor Claims, plan billing.Plan) (string, error) {
	if s.isDemoTenant(ctx, actor.TenantID) {
		return "", errors.New("demo tenant cannot upgrade")
	}
	if !s.stripe.Enabled() {
		return "", billing.ErrStripeNotConfigured
	}
	priceID := s.stripePriceMap()[plan]
	if priceID == "" {
		return "", fmt.Errorf("no Stripe price configured for plan %s", plan)
	}

	sub, err := s.GetSubscription(ctx, actor.TenantID)
	if err != nil {
		return "", err
	}

	customerID := sub.StripeCustomerID
	if customerID == "" {
		// Lazy-create the Stripe customer on first checkout.
		var name string
		_ = s.db.QueryRowContext(ctx, `SELECT name FROM tenants WHERE id = $1`, actor.TenantID).Scan(&name)
		c, err := s.stripe.CreateCustomer(actor.Email, name, actor.TenantID)
		if err != nil {
			return "", fmt.Errorf("create stripe customer: %w", err)
		}
		customerID = c.ID
		_, _ = s.db.ExecContext(ctx,
			`UPDATE subscriptions SET stripe_customer_id = $1, updated_at = NOW() WHERE tenant_id = $2`,
			customerID, actor.TenantID)
	}

	session, err := s.stripe.CreateCheckoutSession(customerID, priceID,
		s.cfg.BillingSuccessURL, s.cfg.BillingCancelURL, actor.TenantID)
	if err != nil {
		return "", fmt.Errorf("create checkout session: %w", err)
	}
	return session.URL, nil
}

// OpenBillingPortal returns a Stripe Customer Portal URL for self-service.
func (s *Service) OpenBillingPortal(ctx context.Context, actor Claims) (string, error) {
	if s.isDemoTenant(ctx, actor.TenantID) {
		return "", errors.New("demo tenant has no portal")
	}
	if !s.stripe.Enabled() {
		return "", billing.ErrStripeNotConfigured
	}
	sub, err := s.GetSubscription(ctx, actor.TenantID)
	if err != nil {
		return "", err
	}
	if sub.StripeCustomerID == "" {
		return "", errors.New("no stripe customer for this tenant — start a checkout first")
	}
	ps, err := s.stripe.CreatePortalSession(sub.StripeCustomerID, s.cfg.BillingCancelURL)
	if err != nil {
		return "", err
	}
	return ps.URL, nil
}

// ParseStripeWebhook verifies the Stripe signature and returns the event.
// Exposed so the HTTP handler can verify before calling HandleStripeWebhook.
func (s *Service) ParseStripeWebhook(payload []byte, sigHeader string) (stripe.Event, error) {
	return s.stripe.ParseWebhook(payload, sigHeader)
}

// StripeWebhookConfigured reports whether the shared webhook secret is present.
// Handlers use this to fail closed with 503 when Stripe is half-configured.
func (s *Service) StripeWebhookConfigured() bool {
	return s.stripe.WebhookConfigured()
}

// PlanSnapshot returns the tenant's effective plan and its static limits so
// handlers can enrich 402 responses without additional queries.
func (s *Service) PlanSnapshot(ctx context.Context, tenantID string) (string, billing.Limits, bool) {
	if tenantID == "" {
		return "", billing.Limits{}, false
	}
	plan := s.effectivePlan(ctx, tenantID)
	limits, ok := billing.PlanLimits[plan]
	if !ok {
		return string(plan), billing.Limits{}, false
	}
	return string(plan), limits, true
}

// HandleStripeWebhook processes a verified Stripe event. Idempotent: dedupes
// by stripe_event_id via the payment_events table.
func (s *Service) HandleStripeWebhook(ctx context.Context, event stripe.Event) error {
	// Idempotency guard. If the event was already processed, no-op.
	rawJSON, _ := json.Marshal(event)
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO payment_events (id, stripe_event_id, event_type, raw_payload) VALUES ($1, $2, $3, $4)
		 ON CONFLICT (stripe_event_id) DO NOTHING`,
		newID("pev"), event.ID, string(event.Type), string(rawJSON))
	if err != nil {
		return err
	}
	if rows, _ := res.RowsAffected(); rows == 0 {
		s.logger.Info("stripe webhook already processed", "event_id", event.ID, "type", event.Type)
		return nil
	}

	switch event.Type {
	case "checkout.session.completed":
		var cs stripe.CheckoutSession
		if err := json.Unmarshal(event.Data.Raw, &cs); err != nil {
			return err
		}
		tenantID := cs.Metadata["tenant_id"]
		if tenantID == "" && cs.Customer != nil {
			tenantID = s.tenantIDFromCustomer(ctx, cs.Customer.ID)
		}
		if tenantID == "" {
			return fmt.Errorf("checkout.session.completed without tenant_id")
		}
		// The subscription was created by Stripe; subscription.created/updated
		// events will follow with full details. We just persist customer_id here.
		if cs.Customer != nil {
			_, _ = s.db.ExecContext(ctx,
				`UPDATE subscriptions SET stripe_customer_id = $1, updated_at = NOW() WHERE tenant_id = $2`,
				cs.Customer.ID, tenantID)
		}
		s.notifyOwners(ctx, tenantID,
			"¡Bienvenido a ProjectPulse!",
			"Hola,\n\nTu suscripción a ProjectPulse está activa. Ya puedes usar todas las funciones de tu plan: subir planos, registrar capturas con geolocalización, invitar a tu equipo y recibir auditorías con IA.\n\nEntra a tu dashboard: "+s.cfg.PublicBase+"\n\nSi tienes dudas, responde este correo y te ayudamos.\n\n— ProjectPulse")

	case "customer.subscription.created", "customer.subscription.updated":
		var ss stripe.Subscription
		if err := json.Unmarshal(event.Data.Raw, &ss); err != nil {
			return err
		}
		return s.upsertSubscriptionFromStripe(ctx, &ss)

	case "customer.subscription.deleted":
		var ss stripe.Subscription
		if err := json.Unmarshal(event.Data.Raw, &ss); err != nil {
			return err
		}
		_, err := s.db.ExecContext(ctx,
			`UPDATE subscriptions SET status='canceled', cancel_at_period_end=FALSE, updated_at=NOW() WHERE stripe_subscription_id = $1`,
			ss.ID)
		return err

	case "invoice.payment_succeeded":
		var inv stripe.Invoice
		if err := json.Unmarshal(event.Data.Raw, &inv); err != nil {
			return err
		}
		s.logger.Info("payment succeeded", "amount", inv.AmountPaid, "customer", customerIDOf(&inv))

	case "invoice.payment_failed":
		var inv stripe.Invoice
		if err := json.Unmarshal(event.Data.Raw, &inv); err != nil {
			return err
		}
		custID := customerIDOf(&inv)
		_, _ = s.db.ExecContext(ctx,
			`UPDATE subscriptions SET status='past_due', updated_at=NOW() WHERE stripe_customer_id = $1`,
			custID)
		if tenantID := s.tenantIDFromCustomer(ctx, custID); tenantID != "" {
			s.notifyOwners(ctx, tenantID,
				"Pago fallido en ProjectPulse",
				"Hola,\n\nIntentamos cobrar tu suscripción de ProjectPulse pero el pago falló. Por favor revisa tu método de pago para evitar la suspensión del servicio.\n\nPuedes actualizar tu tarjeta desde el portal de facturación dentro de la aplicación.\n\n— ProjectPulse")
		}

	case "customer.subscription.trial_will_end":
		s.logger.Info("trial will end (3 days)", "event", event.ID)
		var ss stripe.Subscription
		if err := json.Unmarshal(event.Data.Raw, &ss); err == nil && ss.Customer != nil {
			if tenantID := s.tenantIDFromCustomer(ctx, ss.Customer.ID); tenantID != "" {
				s.notifyOwnersWithPref(ctx, tenantID, "critical_alerts",
					"Tu prueba de ProjectPulse termina en 3 días",
					"Hola,\n\nTu prueba gratuita de ProjectPulse termina en 3 días. Si quieres seguir usando la plataforma sin interrupciones elige un plan desde la sección de facturación.\n\nSi no haces nada, tu cuenta quedará en modo solo lectura al finalizar el periodo de prueba.\n\n— ProjectPulse")
			}
		}

	case "customer.subscription.paused":
		var ss stripe.Subscription
		if err := json.Unmarshal(event.Data.Raw, &ss); err != nil {
			return err
		}
		_, _ = s.db.ExecContext(ctx,
			`UPDATE subscriptions SET status='paused', updated_at=NOW() WHERE stripe_subscription_id = $1`,
			ss.ID)
		s.logger.Warn("subscription paused", "event", event.ID, "subscription", ss.ID)

	case "customer.subscription.resumed":
		var ss stripe.Subscription
		if err := json.Unmarshal(event.Data.Raw, &ss); err != nil {
			return err
		}
		_, _ = s.db.ExecContext(ctx,
			`UPDATE subscriptions SET status='active', updated_at=NOW() WHERE stripe_subscription_id = $1`,
			ss.ID)
		s.logger.Info("subscription resumed", "event", event.ID, "subscription", ss.ID)

	case "charge.dispute.created", "charge.disputed.created":
		s.logger.Error("stripe dispute opened", "event", event.ID, "type", event.Type, "payload", string(event.Data.Raw))

	default:
		s.logger.Warn("unhandled stripe event", "type", event.Type, "event_id", event.ID)
	}
	return nil
}

func customerIDOf(inv *stripe.Invoice) string {
	if inv == nil || inv.Customer == nil {
		return ""
	}
	return inv.Customer.ID
}

func (s *Service) tenantIDFromCustomer(ctx context.Context, customerID string) string {
	var tenantID string
	_ = s.db.QueryRowContext(ctx, `SELECT tenant_id FROM subscriptions WHERE stripe_customer_id = $1`, customerID).Scan(&tenantID)
	return tenantID
}

// upsertSubscriptionFromStripe persists the canonical state from Stripe into our DB.
func (s *Service) upsertSubscriptionFromStripe(ctx context.Context, ss *stripe.Subscription) error {
	if ss == nil || ss.Customer == nil {
		return errors.New("stripe subscription missing customer")
	}
	tenantID := s.tenantIDFromCustomer(ctx, ss.Customer.ID)
	if tenantID == "" {
		return fmt.Errorf("no tenant for stripe customer %s", ss.Customer.ID)
	}

	// Only accept known Stripe price IDs. An unmapped price is a configuration
	// error — fail loud rather than silently granting the cheapest paid plan.
	if ss.Items == nil || len(ss.Items.Data) == 0 || ss.Items.Data[0].Price == nil {
		return fmt.Errorf("stripe subscription %s has no price items", ss.ID)
	}
	priceID := ss.Items.Data[0].Price.ID
	priceMap := s.stripePriceMap()
	var plan billing.Plan
	for p, id := range priceMap {
		if id == priceID {
			plan = p
			break
		}
	}
	if plan == "" {
		s.logger.Error("stripe unmapped price", "subscription", ss.ID, "price_id", priceID, "tenant_id", tenantID)
		return fmt.Errorf("unmapped stripe price %s for subscription %s", priceID, ss.ID)
	}

	status := strings.ToLower(string(ss.Status))
	periodEnd := time.Unix(ss.CurrentPeriodEnd, 0)

	_, err := s.db.ExecContext(ctx, `
		UPDATE subscriptions
		SET stripe_subscription_id = $1,
		    plan = $2,
		    status = $3,
		    current_period_ends_at = $4,
		    cancel_at_period_end = $5,
		    updated_at = NOW()
		WHERE tenant_id = $6
	`, ss.ID, string(plan), status, periodEnd, ss.CancelAtPeriodEnd, tenantID)
	return err
}

// notifyOwners sends a transactional email to every active owner of a tenant.
// Best-effort: failures are logged but never propagated (a webhook must not
// fail because Resend is down). Pass empty prefKey to always send
// (transactional / hard-stop notifications); otherwise the owner's
// preference gates delivery.
func (s *Service) notifyOwners(ctx context.Context, tenantID, subject, body string) {
	s.notifyOwnersWithPref(ctx, tenantID, "", subject, body)
}

// notifyTaskHelper sends an email to the helper assigned to the given task,
// if any. No-ops when the task has no assignee. Used by the deliverable
// approve/reject cascade to keep the helper in the loop on client decisions.
func (s *Service) notifyTaskHelper(ctx context.Context, taskID, subject, body string) {
	if taskID == "" {
		return
	}
	var assignedUserID string
	if err := s.db.QueryRowContext(ctx,
		`SELECT COALESCE(assigned_to_user_id, '') FROM tasks WHERE id = $1`, taskID).
		Scan(&assignedUserID); err != nil {
		s.logger.Warn("notifyTaskHelper: lookup failed", "task_id", taskID, "err", err.Error())
		return
	}
	if assignedUserID == "" {
		return
	}
	var email string
	if err := s.db.QueryRowContext(ctx,
		`SELECT email FROM users WHERE id = $1`, assignedUserID).Scan(&email); err != nil {
		s.logger.Warn("notifyTaskHelper: user lookup failed", "user_id", assignedUserID, "err", err.Error())
		return
	}
	if email == "" {
		return
	}
	if err := s.mailer.Send(ctx, email, subject, body); err != nil {
		s.logger.Warn("notifyTaskHelper: send failed", "to", email, "err", err.Error())
	}
}

func (s *Service) notifyOwnersWithPref(ctx context.Context, tenantID, prefKey, subject, body string) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, email FROM users WHERE tenant_id = $1 AND role = $2`,
		tenantID, RoleOwner)
	if err != nil {
		s.logger.Warn("notifyOwners query failed", "tenant_id", tenantID, "err", err.Error())
		return
	}
	defer rows.Close()
	for rows.Next() {
		var userID, email string
		if err := rows.Scan(&userID, &email); err != nil {
			continue
		}
		if prefKey != "" && !s.shouldNotify(ctx, userID, prefKey) {
			continue
		}
		if err := s.mailer.Send(ctx, email, subject, body); err != nil {
			s.logger.Warn("notifyOwners send failed", "to", email, "err", err.Error())
		}
	}
}

// ContactSalesInput is the payload for Enterprise lead requests.
type ContactSalesInput struct {
	Name    string `json:"name"`
	Email   string `json:"email"`
	Company string `json:"company"`
	Phone   string `json:"phone,omitempty"`
	Message string `json:"message,omitempty"`
}

// ContactSales handles Enterprise plan inquiries. Sends the lead to the sales
// inbox (ResendFromAddr) and a confirmation to the requester. Best-effort on
// the confirmation — a failure there does not fail the request.
func (s *Service) ContactSales(ctx context.Context, in ContactSalesInput) error {
	name := strings.TrimSpace(in.Name)
	email := strings.TrimSpace(in.Email)
	company := strings.TrimSpace(in.Company)
	if name == "" || email == "" || company == "" {
		return errors.New("name, email and company are required")
	}
	if !strings.Contains(email, "@") || len(email) > 320 {
		return errors.New("invalid email")
	}
	if len(name) > 200 || len(company) > 200 || len(in.Phone) > 40 || len(in.Message) > 4000 {
		return errors.New("field too long")
	}
	// Prevent email header injection — reject fields containing newlines or carriage returns.
	for _, field := range []string{name, email, company, in.Phone} {
		if strings.ContainsAny(field, "\r\n") {
			return errors.New("invalid characters in input")
		}
	}

	salesInbox := s.cfg.ResendReplyTo
	if salesInbox == "" {
		salesInbox = "sales@projpul.com"
	}

	leadBody := fmt.Sprintf(
		"Nuevo lead Enterprise\n\nNombre: %s\nEmail: %s\nEmpresa: %s\nTeléfono: %s\n\nMensaje:\n%s\n",
		name, email, company, in.Phone, in.Message,
	)
	if err := s.mailer.Send(ctx, salesInbox,
		fmt.Sprintf("[Enterprise lead] %s — %s", company, name),
		leadBody); err != nil {
		s.logger.Error("ContactSales: sales inbox send failed", "err", err.Error())
		return fmt.Errorf("no pudimos registrar tu solicitud, intenta de nuevo")
	}

	// Confirmation to requester — best-effort.
	confirmation := fmt.Sprintf(
		"Hola %s,\n\nRecibimos tu solicitud para el plan Enterprise de ProjectPulse. Un especialista de ventas te contactará en las próximas 24 horas.\n\nResumen:\n  Empresa: %s\n  Email: %s\n\nGracias,\n— Equipo ProjectPulse",
		name, company, email,
	)
	if err := s.mailer.Send(ctx, email, "Recibimos tu solicitud — ProjectPulse Enterprise", confirmation); err != nil {
		s.logger.Warn("ContactSales: confirmation send failed", "to", email, "err", err.Error())
	}
	return nil
}

// AdminExtendTrial extends the trial_ends_at of a tenant by N days. Only the
// platform admin may call this. Days is clamped to [1, 365].
func (s *Service) AdminExtendTrial(ctx context.Context, actor Claims, tenantID string, days int) (Subscription, error) {
	if err := s.requirePlatformAdmin(actor); err != nil {
		return Subscription{}, err
	}
	if tenantID == "" {
		return Subscription{}, errors.New("tenant_id required")
	}
	if days < 1 || days > 365 {
		return Subscription{}, errors.New("days must be between 1 and 365")
	}
	sub, err := s.GetSubscription(ctx, tenantID)
	if err != nil {
		return Subscription{}, err
	}
	if sub.ID == "" {
		return Subscription{}, errors.New("no subscription found for tenant")
	}
	base := time.Now()
	if sub.TrialEndsAt != nil && sub.TrialEndsAt.After(base) {
		base = *sub.TrialEndsAt
	}
	newEnd := base.Add(time.Duration(days) * 24 * time.Hour)
	if _, err := s.db.ExecContext(ctx,
		`UPDATE subscriptions SET trial_ends_at = $1, status = 'trialing' WHERE tenant_id = $2`,
		newEnd, tenantID); err != nil {
		return Subscription{}, err
	}
	s.logger.Warn("admin.extend_trial", "admin_id", actor.UserID, "tenant_id", tenantID, "days", days, "new_end", newEnd)
	return s.GetSubscription(ctx, tenantID)
}

// AdminCompPlan sets a complimentary plan for a tenant (no Stripe charge).
// Valid plans: starter, professional, business, enterprise. Optional periodEnd
// determines when the comp expires; nil means no expiry.
func (s *Service) AdminCompPlan(ctx context.Context, actor Claims, tenantID, plan string, periodEnd *time.Time) (Subscription, error) {
	if err := s.requirePlatformAdmin(actor); err != nil {
		return Subscription{}, err
	}
	if tenantID == "" {
		return Subscription{}, errors.New("tenant_id required")
	}
	switch billing.Plan(plan) {
	case billing.PlanStarter, billing.PlanProfessional, billing.PlanBusiness, billing.PlanEnterprise:
	default:
		return Subscription{}, errors.New("invalid plan; must be starter|professional|business|enterprise")
	}
	if _, err := s.GetSubscription(ctx, tenantID); err != nil {
		return Subscription{}, err
	}
	if _, err := s.db.ExecContext(ctx,
		`UPDATE subscriptions SET plan = $1, status = 'active', current_period_ends_at = $2, cancel_at_period_end = FALSE WHERE tenant_id = $3`,
		plan, periodEnd, tenantID); err != nil {
		return Subscription{}, err
	}
	s.logger.Warn("admin.comp_plan", "admin_id", actor.UserID, "tenant_id", tenantID, "plan", plan, "period_end", periodEnd)
	return s.GetSubscription(ctx, tenantID)
}

// AdminOverrideStatus forces a subscription status. Useful for unblocking a
// tenant or marking one read-only without touching Stripe.
func (s *Service) AdminOverrideStatus(ctx context.Context, actor Claims, tenantID, status string) (Subscription, error) {
	if err := s.requirePlatformAdmin(actor); err != nil {
		return Subscription{}, err
	}
	if tenantID == "" {
		return Subscription{}, errors.New("tenant_id required")
	}
	switch status {
	case "trialing", "active", "past_due", "canceled", "read_only":
	default:
		return Subscription{}, errors.New("invalid status")
	}
	if _, err := s.GetSubscription(ctx, tenantID); err != nil {
		return Subscription{}, err
	}
	if _, err := s.db.ExecContext(ctx,
		`UPDATE subscriptions SET status = $1 WHERE tenant_id = $2`,
		status, tenantID); err != nil {
		return Subscription{}, err
	}
	s.logger.Warn("admin.override_status", "admin_id", actor.UserID, "tenant_id", tenantID, "status", status)
	return s.GetSubscription(ctx, tenantID)
}

