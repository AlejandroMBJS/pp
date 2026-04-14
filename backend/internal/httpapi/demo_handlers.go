package httpapi

import (
	"net/http"

	"arquicheck/backend/internal/app"
)

type demoRequestBody struct {
	Name    string `json:"name"`
	Email   string `json:"email"`
	Company string `json:"company"`
	Source  string `json:"source"`
}

func (s *Server) handleDemoRequest(w http.ResponseWriter, r *http.Request) {
	var in demoRequestBody
	if !decodeJSON(w, r, &in) {
		return
	}
	result, err := s.service.RequestDemo(r.Context(), app.DemoRequestInput{
		Name:      in.Name,
		Email:     in.Email,
		Company:   in.Company,
		Source:    in.Source,
		IPAddress: clientIP(r),
		UserAgent: r.UserAgent(),
	})
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":         true,
		"lead_id":    result.LeadID,
		"expires_at": result.ExpiresAt,
		"message":    "Te enviamos las credenciales por email. Revisa tu bandeja (y spam).",
	})
}

