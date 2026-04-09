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

// isDemoTenant returns true if the tenant is the shared demo workspace,
// which bypasses ALL billing checks (it's effectively on enterprise forever).
func (s *Service) isDemoTenant(ctx context.Context, tenantID string) bool {
	var slug string
	if err := s.db.QueryRowContext(ctx, `SELECT slug FROM tenants WHERE id = $1`, tenantID).Scan(&slug); err != nil {
		return false
	}
	return slug == demoTenantSlug
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
	var sub Subscription
	var trialEnd, periodEnd sql.NullTime
	err := s.db.QueryRowContext(ctx, `
		SELECT id, tenant_id, stripe_customer_id, stripe_subscription_id, plan, status,
		       trial_ends_at, current_period_ends_at, cancel_at_period_end
		FROM subscriptions WHERE tenant_id = $1`, tenantID,
	).Scan(&sub.ID, &sub.TenantID, &sub.StripeCustomerID, &sub.StripeSubscriptionID,
		&sub.Plan, &sub.Status, &trialEnd, &periodEnd, &sub.CancelAtPeriodEnd)
	if err == sql.ErrNoRows {
		// Defensive: synthesize a trial entry
		now := time.Now()
		end := now.Add(14 * 24 * time.Hour)
		_, _ = s.db.ExecContext(ctx,
			`INSERT INTO subscriptions (id, tenant_id, plan, status, trial_ends_at) VALUES ($1, $2, 'starter', 'trialing', $3)`,
			newID("sub"), tenantID, end)
		sub = Subscription{ID: newID("sub"), TenantID: tenantID, Plan: "starter", Status: "trialing"}
		trialEnd = sql.NullTime{Time: end, Valid: true}
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
		_, _ = s.db.ExecContext(ctx, `UPDATE subscriptions SET status='read_only', updated_at=NOW() WHERE tenant_id=$1 AND status='trialing'`, tenantID)
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
	if sub.Status == "trialing" && sub.TrialEndsAt != nil && time.Now().After(*sub.TrialEndsAt) {
		_, _ = s.db.ExecContext(ctx, `UPDATE subscriptions SET status='read_only', updated_at=NOW() WHERE tenant_id=$1`, tenantID)
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
		return nil // fail open on infra errors — we don't want to lock everyone out
	}
	if sub.Status == "trialing" && sub.TrialEndsAt != nil && time.Now().After(*sub.TrialEndsAt) {
		return ErrSubscriptionRequired
	}
	if sub.Status == "read_only" || sub.Status == "canceled" {
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
		return nil
	}
	if !billing.AllowsCount(limits.MaxActiveProjects, current) {
		return fmt.Errorf("%w: active_projects (limit %d, current %d)", ErrQuotaExceeded, limits.MaxActiveProjects, current)
	}
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
		_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE tenant_id = $1 AND role = $2`, tenantID, RoleClient).Scan(&current)
		if !billing.AllowsCount(limits.MaxClientGuests, current) {
			return fmt.Errorf("%w: client_guests (limit %d, current %d)", ErrQuotaExceeded, limits.MaxClientGuests, current)
		}
	} else {
		var current int
		_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE tenant_id = $1 AND role IN ($2, $3, $4)`, tenantID, RoleOwner, RoleSupervisor, RoleHelper).Scan(&current)
		if !billing.AllowsCount(limits.MaxInternalUsers, current) {
			return fmt.Errorf("%w: internal_users (limit %d, current %d)", ErrQuotaExceeded, limits.MaxInternalUsers, current)
		}
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
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM blueprints WHERE tenant_id = $1`, tenantID).Scan(&current)
	if !billing.AllowsCount(limits.MaxBlueprintFiles, current) {
		return fmt.Errorf("%w: blueprint_files (limit %d, current %d)", ErrQuotaExceeded, limits.MaxBlueprintFiles, current)
	}
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
	_ = s.db.QueryRowContext(ctx,
		`SELECT COALESCE(value, 0) FROM usage_metrics WHERE tenant_id = $1 AND metric_type = 'captures_per_month' AND period_start = $2`,
		tenantID, periodStart,
	).Scan(&current)
	if int(current) >= limits.MaxCapturesPerMonth {
		return fmt.Errorf("%w: captures_per_month (limit %d, current %d)", ErrQuotaExceeded, limits.MaxCapturesPerMonth, current)
	}
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
		_, _ = s.db.ExecContext(ctx,
			`UPDATE subscriptions SET status='past_due', updated_at=NOW() WHERE stripe_customer_id = $1`,
			customerIDOf(&inv))

	case "customer.subscription.trial_will_end":
		s.logger.Info("trial will end (3 days)", "event", event.ID)
		// Email notification hook — wired to mailer in fase 2
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

	plan := billing.PlanStarter
	if len(ss.Items.Data) > 0 && ss.Items.Data[0].Price != nil {
		plan = billing.PlanFromPriceID(ss.Items.Data[0].Price.ID, s.stripePriceMap())
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
