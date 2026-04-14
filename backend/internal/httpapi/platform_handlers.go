package httpapi

import (
	"errors"
	"net/http"

	"arquicheck/backend/internal/app"
)

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
