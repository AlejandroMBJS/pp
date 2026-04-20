package httpapi

import (
	"errors"
	"io"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"

	"arquicheck/backend/internal/app"
	"arquicheck/backend/internal/billing"
)

func (s *Server) handleListNotifications(w http.ResponseWriter, r *http.Request) {
	actor := s.actor(r)
	unread := r.URL.Query().Get("unread") == "true"
	notifs, err := s.service.ListNotificationsForUser(r.Context(), actor.TenantID, actor.UserID, unread)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, notifs)
}

func (s *Server) handleReadNotification(w http.ResponseWriter, r *http.Request) {
	actor := s.actor(r)
	id := chi.URLParam(r, "notificationID")
	if err := s.service.MarkNotificationRead(r.Context(), actor.TenantID, id); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"read": true})
}

func (s *Server) handleReadAllNotifications(w http.ResponseWriter, r *http.Request) {
	actor := s.actor(r)
	n, err := s.service.MarkAllNotificationsRead(r.Context(), actor.TenantID, actor.UserID)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"read": n})
}

func (s *Server) handleGetSubscription(w http.ResponseWriter, r *http.Request) {
	actor := s.actor(r)
	sub, err := s.service.GetSubscription(r.Context(), actor.TenantID)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, err)
		return
	}
	plan := billing.Plan(sub.Plan)
	usage := s.service.GetCurrentUsage(r.Context(), actor.TenantID)
	writeJSON(w, http.StatusOK, map[string]any{
		"subscription": sub,
		"features":     billing.PlanFeatures[plan],
		"limits":       billing.PlanLimits[plan],
		"usage":        usage,
	})
}

func (s *Server) handleCreateCheckout(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Plan string `json:"plan"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	plan := billing.Plan(req.Plan)
	if _, ok := billing.PlanLimits[plan]; !ok || plan == billing.PlanStarter {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid plan"})
		return
	}
	url, err := s.service.StartCheckout(r.Context(), s.actor(r), plan)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"checkout_url": url})
}

func (s *Server) handleContactSales(w http.ResponseWriter, r *http.Request) {
	var in app.ContactSalesInput
	if !decodeJSON(w, r, &in) {
		return
	}
	if err := s.service.ContactSales(r.Context(), in); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleOpenPortal(w http.ResponseWriter, r *http.Request) {
	url, err := s.service.OpenBillingPortal(r.Context(), s.actor(r))
	if err != nil {
		// Classify expected failures as 400 so the UI can show a real message
		// instead of a generic "internal server error" toast.
		if errors.Is(err, billing.ErrStripeNotConfigured) {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"error": "Billing portal is not available yet — contact support to subscribe."})
			return
		}
		msg := err.Error()
		if msg == "no stripe customer for this tenant — start a checkout first" || msg == "demo tenant has no portal" {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": msg})
			return
		}
		writeError(w, r, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"portal_url": url})
}

// handleStripeWebhook is UNAUTHENTICATED — Stripe signs the request with a
// shared secret and we verify it. Body must be read raw before any JSON parse.
func (s *Server) handleStripeWebhook(w http.ResponseWriter, r *http.Request) {
	// Fail closed: without a webhook secret we cannot verify signatures, so refuse
	// to accept events. main.go also enforces this at boot, but this guards against
	// runtime config drift.
	if !s.service.StripeWebhookConfigured() {
		slog.Error("stripe.webhook.secret_missing", "path", r.URL.Path)
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"error": "webhook secret not configured"})
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20) // 1MB
	payload, err := io.ReadAll(r.Body)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "cannot read body"})
		return
	}
	sig := r.Header.Get("Stripe-Signature")
	event, err := s.service.ParseStripeWebhook(payload, sig)
	if err != nil {
		writeError(w, r, http.StatusBadRequest, errors.New("invalid signature"))
		_ = err // signature details intentionally not leaked
		return
	}
	if err := s.service.HandleStripeWebhook(r.Context(), event); err != nil {
		writeError(w, r, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"received": true})
}

// writeBillingError translates billing errors to HTTP 402 with a structured
// payload the frontend can use to show paywall/upgrade modals. The payload
// includes plan, limits and upgrade_url so the client can render a rich paywall
// without an extra round-trip.
func writeBillingError(w http.ResponseWriter, err error) bool {
	return writeBillingErrorRich(nil, w, nil, err)
}

func writeBillingErrorRich(s *Server, w http.ResponseWriter, r *http.Request, err error) bool {
	var kind string
	switch {
	case errors.Is(err, app.ErrFeatureLocked):
		kind = "feature_locked"
	case errors.Is(err, app.ErrQuotaExceeded):
		kind = "quota_exceeded"
	case errors.Is(err, app.ErrSubscriptionRequired):
		kind = "subscription_required"
	default:
		return false
	}
	payload := map[string]any{
		"error":       err.Error(),
		"type":        kind,
		"upgrade_url": "/billing",
	}
	if s != nil && r != nil {
		if plan, limits, ok := s.service.PlanSnapshot(r.Context(), s.actor(r).TenantID); ok {
			payload["plan"] = plan
			payload["limits"] = limits
		}
	}
	writeJSON(w, http.StatusPaymentRequired, payload)
	return true
}
