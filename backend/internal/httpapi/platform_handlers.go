package httpapi

import (
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"arquicheck/backend/internal/app"
)

func writePlatformErr(w http.ResponseWriter, r *http.Request, err error) {
	if errors.Is(err, app.ErrForbidden) {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "forbidden"})
		return
	}
	msg := err.Error()
	switch msg {
	case "tenant_id required", "tenant not found", "no subscription found for tenant", "no active user found for tenant", "days must be between 1 and 365", "invalid plan; must be starter|professional|business|enterprise", "invalid status":
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": msg})
		return
	}
	writeError(w, r, http.StatusInternalServerError, err)
}

func (s *Server) handlePlatformOverview(w http.ResponseWriter, r *http.Request) {
	overview, err := s.service.PlatformOverview(r.Context(), s.actor(r))
	if err != nil {
		if errors.Is(err, app.ErrForbidden) {
			writeJSON(w, http.StatusForbidden, map[string]any{"error": "forbidden"})
			return
		}
		writeError(w, r, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, overview)
}

func (s *Server) handlePlatformTenants(w http.ResponseWriter, r *http.Request) {
	tenants, err := s.service.PlatformTenants(r.Context(), s.actor(r))
	if err != nil {
		if errors.Is(err, app.ErrForbidden) {
			writeJSON(w, http.StatusForbidden, map[string]any{"error": "forbidden"})
			return
		}
		writeError(w, r, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, tenants)
}

func (s *Server) handlePlatformImpersonate(w http.ResponseWriter, r *http.Request) {
	resp, err := s.service.ImpersonateTenant(r.Context(), s.actor(r), chi.URLParam(r, "tenantID"))
	if err != nil {
		writePlatformErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handlePlatformSuspend(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Reason string `json:"reason"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if err := s.service.SuspendTenant(r.Context(), s.actor(r), chi.URLParam(r, "tenantID"), req.Reason); err != nil {
		writePlatformErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"suspended": true})
}

func (s *Server) handlePlatformReactivate(w http.ResponseWriter, r *http.Request) {
	if err := s.service.ReactivateTenant(r.Context(), s.actor(r), chi.URLParam(r, "tenantID")); err != nil {
		writePlatformErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"reactivated": true})
}

func (s *Server) handlePlatformExtendTrial(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Days int `json:"days"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	sub, err := s.service.AdminExtendTrial(r.Context(), s.actor(r), chi.URLParam(r, "tenantID"), req.Days)
	if err != nil {
		writePlatformErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, sub)
}

func (s *Server) handlePlatformCompPlan(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Plan      string     `json:"plan"`
		PeriodEnd *time.Time `json:"period_end,omitempty"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	sub, err := s.service.AdminCompPlan(r.Context(), s.actor(r), chi.URLParam(r, "tenantID"), req.Plan, req.PeriodEnd)
	if err != nil {
		writePlatformErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, sub)
}

func (s *Server) handlePlatformOverrideStatus(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Status string `json:"status"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	sub, err := s.service.AdminOverrideStatus(r.Context(), s.actor(r), chi.URLParam(r, "tenantID"), req.Status)
	if err != nil {
		writePlatformErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, sub)
}
