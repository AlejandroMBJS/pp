package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"arquicheck/backend/internal/app"
)

type Server struct {
	service *app.Service
}

func NewServer(cfg app.Config) (*Server, error) {
	service, err := app.NewService(cfg)
	if err != nil {
		return nil, err
	}
	return &Server{service: service}, nil
}

func (s *Server) Close() error {
	return s.service.Close()
}

func (s *Server) Routes() http.Handler {
	r := chi.NewRouter()
	r.Use(securityHeaders)
	r.Use(corsWithOrigins(s.service.AllowedOrigins()))

	// Rate limiter for unauthenticated auth endpoints: 5 req/min per IP,
	// burst of 10. Enough for a human retrying, hostile to brute force.
	authLimiter := newIPRateLimiter(5.0/60.0, 10).middleware()

	r.Get("/healthz", s.handleHealth)
	r.Get("/api/v1/public/demo", s.handlePublicDemo)
	r.Get("/api/v1/public/dashboard", s.handlePublicDashboard)
	r.Group(func(pub chi.Router) {
		pub.Use(authLimiter)
		pub.Post("/api/v1/auth/register", s.handleRegister)
		pub.Post("/api/v1/auth/login", s.handleLogin)
		pub.Post("/api/v1/auth/setup-account", s.handleSetupAccount)
		pub.Get("/api/v1/auth/invite/{token}", s.handleLookupInvite)
		pub.Post("/api/v1/auth/verify-email", s.handleVerifyEmail)
		pub.Post("/api/v1/auth/resend-verification", s.handleResendVerification)
		pub.Post("/api/v1/auth/request-password-reset", s.handleRequestPasswordReset)
		pub.Get("/api/v1/auth/password-reset/{token}", s.handleLookupPasswordReset)
		pub.Post("/api/v1/auth/complete-password-reset", s.handleCompletePasswordReset)
	})
	// Stripe webhook is unauthenticated — verified by signature.
	r.Post("/api/v1/billing/webhook", s.handleStripeWebhook)
	// Enterprise lead capture — public, rate limited to curb spam.
	contactLimiter := newIPRateLimiter(3.0/60.0, 5).middleware()
	r.Group(func(pub chi.Router) {
		pub.Use(contactLimiter)
		pub.Post("/api/v1/billing/contact-sales", s.handleContactSales)
	})
	// Demo workspace request — public, stricter limit (2/min, burst 3).
	demoLimiter := newIPRateLimiter(2.0/60.0, 3).middleware()
	r.Group(func(pub chi.Router) {
		pub.Use(demoLimiter)
		pub.Post("/api/v1/public/demo-request", s.handleDemoRequest)
		pub.Post("/api/v1/public/demo-resend", s.handleDemoResend)
	})
	r.Put("/uploads/{sessionID}", s.handleSignedUpload) // Auth via signed token in query param, not JWT

	r.Group(func(protected chi.Router) {
		protected.Use(s.authMiddleware)
		protected.Post("/api/convert-dwg", s.handleConvertDwg)
		protected.Get("/api/v1/me", s.handleMe)
		protected.Get("/api/v1/admin/tenants", s.handleAdminTenants)
		protected.Get("/api/v1/admin/rbac", s.handleRBACList)
		protected.Put("/api/v1/admin/rbac", s.handleRBACUpsert)

		protected.Get("/api/v1/platform/overview", s.handlePlatformOverview)
		protected.Get("/api/v1/platform/tenants", s.handlePlatformTenants)

		protected.Get("/api/v1/users", s.handleListUsers)
		protected.Post("/api/v1/users", s.handleCreateUser)
		protected.Post("/api/v1/users/invite", s.handleInviteUser)
		protected.Patch("/api/v1/users/{userID}", s.handleAdminPatchUser)
		protected.Post("/api/v1/users/{userID}/set-password", s.handleAdminSetPassword)
		protected.Post("/api/v1/users/{userID}/resend-invite", s.handleAdminResendInvite)
		protected.Delete("/api/v1/users/{userID}", s.handleAdminDeleteUser)

		protected.Get("/api/v1/me/notifications", s.handleGetNotificationPrefs)
		protected.Patch("/api/v1/me/notifications", s.handleUpdateNotificationPrefs)

		protected.Get("/api/v1/tenants/current", s.handleGetCurrentTenant)
		protected.Patch("/api/v1/tenants/current", s.handlePatchCurrentTenant)
		protected.Delete("/api/v1/tenants/current", s.handleDeleteCurrentTenant)

		protected.Get("/api/v1/projects", s.handleListProjects)
		protected.Get("/api/v1/projects/{projectID}/tasks", s.handleProjectTasks)
		protected.Get("/api/v1/projects/{projectID}/evidence", s.handleProjectEvidences)
		protected.Get("/api/v1/projects/{projectID}/blueprints", s.handleProjectBlueprints)
		protected.Post("/api/v1/projects/{projectID}/blueprints/upload-url", s.handleBlueprintUploadURL)
		protected.Get("/api/v1/projects/{projectID}/deliverables", s.handleProjectDeliverables)
		protected.Post("/api/v1/deliverables/{deliverableID}/approve", s.handleApproveDeliverable)
		protected.Post("/api/v1/deliverables/{deliverableID}/reject", s.handleRejectDeliverable)
		protected.Post("/api/v1/projects", s.handleCreateProject)
		protected.Get("/api/v1/blueprints/{blueprintID}/file", s.handleBlueprintFile)
		protected.Get("/api/v1/blueprints/{blueprintID}/preview", s.handleBlueprintPreview)
		protected.Delete("/api/v1/blueprints/{blueprintID}", s.handleDeleteBlueprint)
		protected.Post("/api/v1/blueprints/register", s.handleBlueprintRegister)
		protected.Get("/api/v1/dashboard/owner/overview", s.handleOwnerDashboard)
		protected.Patch("/api/v1/projects/{projectID}", s.handleUpdateProject)
		protected.Get("/api/v1/projects/{projectID}/export.csv", s.handleExportCSV)
		protected.Get("/api/v1/client/projects/{projectID}/summary", s.handleClientSummary)

		protected.Post("/api/v1/projects/{projectID}/tasks", s.handleCreateTask)
		protected.Patch("/api/v1/tasks/{taskID}", s.handleTaskUpdate)
		protected.Delete("/api/v1/tasks/{taskID}", s.handleTaskDelete)
		protected.Patch("/api/v1/tasks/{taskID}/timeline", s.handleTaskTimeline)
		protected.Get("/api/v1/tasks/assigned", s.handleAssignedTasks)
		protected.Get("/api/v1/tasks/{taskID}/evidences", s.handleTaskEvidences)
		protected.Post("/api/v1/tasks/{taskID}/evidence/upload-url", s.handleUploadURL)

		protected.Post("/api/v1/evidence/confirm-upload", s.handleConfirmUpload)
		protected.Post("/api/v1/evidences/{evidenceID}/approve", s.handleApproveEvidence)
		protected.Post("/api/v1/evidences/{evidenceID}/reject", s.handleRejectEvidence)
		protected.Delete("/api/v1/evidences/{evidenceID}", s.handleDeleteEvidence)
		protected.Get("/api/v1/files/{evidenceID}", s.handleEvidenceFile)

		// Operational Expansion
		protected.Get("/api/v1/projects/{projectID}/expenses", s.handleListExpenses)
		protected.Post("/api/v1/projects/{projectID}/expenses", s.handleCreateExpense)
		protected.Patch("/api/v1/expenses/{expenseID}", s.handleUpdateExpense)
		protected.Delete("/api/v1/expenses/{expenseID}", s.handleDeleteExpense)
		protected.Get("/api/v1/projects/{projectID}/daily-logs", s.handleListDailyLogs)
		protected.Post("/api/v1/projects/{projectID}/daily-logs", s.handleCreateDailyLog)
		protected.Patch("/api/v1/daily-logs/{logID}", s.handleUpdateDailyLog)
		protected.Delete("/api/v1/daily-logs/{logID}", s.handleDeleteDailyLog)
		protected.Get("/api/v1/projects/{projectID}/messages", s.handleListMessages)
		protected.Post("/api/v1/projects/{projectID}/messages", s.handleSendMessage)
		protected.Patch("/api/v1/messages/{messageID}", s.handleUpdateMessage)
		protected.Delete("/api/v1/messages/{messageID}", s.handleDeleteMessage)
		protected.Get("/api/v1/projects/{projectID}/budget-adjustments", s.handleListBudgetAdjustments)
		protected.Post("/api/v1/projects/{projectID}/budget-adjustments", s.handleCreateBudgetAdjustment)

		// Notifications (in-app)
		protected.Get("/api/v1/notifications", s.handleListNotifications)
		protected.Post("/api/v1/notifications/{notificationID}/read", s.handleReadNotification)
		protected.Post("/api/v1/notifications/read-all", s.handleReadAllNotifications)

		// Billing
		protected.Get("/api/v1/billing/subscription", s.handleGetSubscription)
		protected.Post("/api/v1/billing/checkout", s.handleCreateCheckout)
		protected.Post("/api/v1/billing/portal", s.handleOpenPortal)
	})
	return r
}

func (s *Server) actor(r *http.Request) app.Claims {
	claims, _ := r.Context().Value(actorKey{}).(app.Claims)
	return claims
}

type actorKey struct{}

func (s *Server) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if !strings.HasPrefix(auth, "Bearer ") {
			writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "missing bearer token"})
			return
		}
		claims, err := app.ParseToken(s.service.JWTSecret(), strings.TrimPrefix(auth, "Bearer "))
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "invalid token"})
			return
		}
		// Block tokens belonging to users that have been suspended or deleted
		// since the JWT was issued. Applies to platform admins too.
		if claims.UserID != "" {
			u, uerr := s.service.UserByID(r.Context(), claims.UserID)
			if uerr != nil || !u.IsActive {
				writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "account is suspended or deleted"})
				return
			}
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), actorKey{}, claims)))
	})
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "service": "projectpulse-api"})
}

func (s *Server) handlePublicDemo(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.service.PublicDemo(r.Context()))
}

func (s *Server) handlePublicDashboard(w http.ResponseWriter, r *http.Request) {
	dashboard, err := s.service.DemoDashboard(r.Context())
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, dashboard)
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	var req struct {
		CompanyName string `json:"company_name"`
		CompanySlug string `json:"company_slug"`
		OwnerName   string `json:"owner_name"`
		OwnerEmail  string `json:"owner_email"`
		Password    string `json:"password"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	response, err := s.service.RegisterCompanyOwner(r.Context(), req.CompanyName, req.CompanySlug, req.OwnerName, req.OwnerEmail, req.Password)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, response)
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	response, err := s.service.Login(r.Context(), req.Email, req.Password)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, response)
}

func (s *Server) handleVerifyEmail(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token string `json:"token"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	success, err := s.service.VerifyEmail(r.Context(), req.Token)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": success})
}

func (s *Server) handleResendVerification(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if err := s.service.ResendVerification(r.Context(), req.Email); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"sent": true})
}

func (s *Server) handleConvertDwg(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(50 << 20); err != nil { // 50MB
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid form data"})
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "file is required"})
		return
	}
	defer file.Close()

	dxf, err := s.service.ConvertDwgToDxf(r.Context(), file)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "image/vnd.dxf")
	_, _ = w.Write(dxf)
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	user, err := s.service.UserByID(r.Context(), s.actor(r).UserID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, user)
}

func (s *Server) handleAdminTenants(w http.ResponseWriter, r *http.Request) {
	tenants, err := s.service.ListTenants(r.Context(), s.actor(r))
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

func (s *Server) handleRBACList(w http.ResponseWriter, r *http.Request) {
	rules, err := s.service.RBACMatrix(r.Context(), s.actor(r))
	if err != nil {
		if errors.Is(err, app.ErrForbidden) {
			writeJSON(w, http.StatusForbidden, map[string]any{"error": "forbidden"})
			return
		}
		writeError(w, r, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, rules)
}

func (s *Server) handleRBACUpsert(w http.ResponseWriter, r *http.Request) {
	var rule app.RBACRule
	if !decodeJSON(w, r, &rule) {
		return
	}
	if err := s.service.UpsertRBACRule(r.Context(), s.actor(r), rule); err != nil {
		if errors.Is(err, app.ErrForbidden) {
			writeJSON(w, http.StatusForbidden, map[string]any{"error": "forbidden"})
			return
		}
		writeError(w, r, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"updated": true})
}

func (s *Server) handleListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := s.service.ListUsers(r.Context(), s.actor(r))
	if err != nil {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, users)
}

func (s *Server) handleCreateUser(w http.ResponseWriter, r *http.Request) {
	var req struct {
		FullName string `json:"full_name"`
		Email    string `json:"email"`
		Password string `json:"password"`
		Role     string `json:"role"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	user, err := s.service.CreateUser(r.Context(), s.actor(r), req.FullName, req.Email, req.Password, req.Role)
	if err != nil {
		if writeBillingError(w, err) {
			return
		}
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "forbidden") {
			status = http.StatusForbidden
		}
		writeJSON(w, status, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, user)
}

func (s *Server) handleInviteUser(w http.ResponseWriter, r *http.Request) {
	var req struct {
		FullName string `json:"full_name"`
		Email    string `json:"email"`
		Role     string `json:"role"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	invite, err := s.service.InviteUser(r.Context(), s.actor(r), req.FullName, req.Email, req.Role)
	if err != nil {
		if writeBillingError(w, err) {
			return
		}
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "forbidden") {
			status = http.StatusForbidden
		}
		writeJSON(w, status, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, invite)
}

func (s *Server) handleRequestPasswordReset(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	// Always 200 — never leak whether the email exists.
	_ = s.service.RequestPasswordReset(r.Context(), req.Email)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleLookupPasswordReset(w http.ResponseWriter, r *http.Request) {
	info, err := s.service.LookupPasswordReset(r.Context(), chi.URLParam(r, "token"))
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "invalid or expired reset link"})
		return
	}
	writeJSON(w, http.StatusOK, info)
}

func (s *Server) handleCompletePasswordReset(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	login, err := s.service.CompletePasswordReset(r.Context(), req.Token, req.Password)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, login)
}

func (s *Server) handleLookupInvite(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	info, err := s.service.LookupInvite(r.Context(), token)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "invalid or expired invite"})
		return
	}
	writeJSON(w, http.StatusOK, info)
}

func (s *Server) handleSetupAccount(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	login, err := s.service.CompleteAccountSetup(r.Context(), req.Token, req.Password)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, login)
}

func (s *Server) handleGetCurrentTenant(w http.ResponseWriter, r *http.Request) {
	t, err := s.service.GetCurrentTenant(r.Context(), s.actor(r))
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, app.ErrForbidden) {
			status = http.StatusForbidden
		} else if strings.Contains(err.Error(), "not found") {
			status = http.StatusNotFound
		}
		writeJSON(w, status, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, t)
}

func (s *Server) handlePatchCurrentTenant(w http.ResponseWriter, r *http.Request) {
	var patch app.TenantPatch
	if !decodeJSON(w, r, &patch) {
		return
	}
	t, err := s.service.UpdateCurrentTenant(r.Context(), s.actor(r), patch)
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, app.ErrForbidden) {
			status = http.StatusForbidden
		}
		writeJSON(w, status, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, t)
}

func (s *Server) handleDeleteCurrentTenant(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ConfirmSlug string `json:"confirm_slug"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if err := s.service.DeleteCurrentTenant(r.Context(), s.actor(r), req.ConfirmSlug); err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, app.ErrForbidden) {
			status = http.StatusForbidden
		}
		writeJSON(w, status, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleGetNotificationPrefs(w http.ResponseWriter, r *http.Request) {
	actor := s.actor(r)
	prefs, err := s.service.GetNotificationPrefs(r.Context(), actor.UserID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"preferences": prefs})
}

func (s *Server) handleUpdateNotificationPrefs(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Preferences map[string]bool `json:"preferences"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	actor := s.actor(r)
	prefs, err := s.service.UpdateNotificationPrefs(r.Context(), actor.UserID, req.Preferences)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"preferences": prefs})
}

func (s *Server) handleAdminPatchUser(w http.ResponseWriter, r *http.Request) {
	var patch app.AdminUserPatch
	if !decodeJSON(w, r, &patch) {
		return
	}
	user, err := s.service.AdminUpdateUser(r.Context(), s.actor(r), chi.URLParam(r, "userID"), patch)
	if err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "forbidden") {
			status = http.StatusForbidden
		} else if strings.Contains(err.Error(), "not found") {
			status = http.StatusNotFound
		}
		writeJSON(w, status, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, user)
}

func (s *Server) handleAdminSetPassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if err := s.service.AdminSetUserPassword(r.Context(), s.actor(r), chi.URLParam(r, "userID"), req.Password); err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "forbidden") {
			status = http.StatusForbidden
		} else if strings.Contains(err.Error(), "not found") {
			status = http.StatusNotFound
		}
		writeJSON(w, status, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleAdminResendInvite(w http.ResponseWriter, r *http.Request) {
	invite, err := s.service.AdminResendInvite(r.Context(), s.actor(r), chi.URLParam(r, "userID"))
	if err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "forbidden") {
			status = http.StatusForbidden
		} else if strings.Contains(err.Error(), "not found") {
			status = http.StatusNotFound
		}
		writeJSON(w, status, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, invite)
}

func (s *Server) handleAdminDeleteUser(w http.ResponseWriter, r *http.Request) {
	if err := s.service.AdminDeleteUser(r.Context(), s.actor(r), chi.URLParam(r, "userID")); err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "forbidden") {
			status = http.StatusForbidden
		} else if strings.Contains(err.Error(), "not found") {
			status = http.StatusNotFound
		}
		writeJSON(w, status, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleListProjects(w http.ResponseWriter, r *http.Request) {
	projects, err := s.service.ListProjects(r.Context(), s.actor(r))
	if err != nil {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, projects)
}

func (s *Server) handleProjectTasks(w http.ResponseWriter, r *http.Request) {
	tasks, err := s.service.ListProjectTasks(r.Context(), s.actor(r), chi.URLParam(r, "projectID"))
	if err != nil {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, tasks)
}

func (s *Server) handleProjectEvidences(w http.ResponseWriter, r *http.Request) {
	evidences, err := s.service.ListProjectEvidences(r.Context(), s.actor(r), chi.URLParam(r, "projectID"))
	if err != nil {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, evidences)
}

func (s *Server) handleProjectDeliverables(w http.ResponseWriter, r *http.Request) {
	deliverables, err := s.service.ListProjectDeliverables(r.Context(), s.actor(r), chi.URLParam(r, "projectID"))
	if err != nil {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, deliverables)
}

func (s *Server) handleApproveDeliverable(w http.ResponseWriter, r *http.Request) {
	deliverable, err := s.service.ApproveDeliverable(r.Context(), s.actor(r), chi.URLParam(r, "deliverableID"))
	if err != nil {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, deliverable)
}

func (s *Server) handleRejectDeliverable(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Reason string `json:"reason"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	deliverable, err := s.service.RejectDeliverable(r.Context(), s.actor(r), chi.URLParam(r, "deliverableID"), req.Reason)
	if err != nil {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, deliverable)
}

func (s *Server) handleCreateProject(w http.ResponseWriter, r *http.Request) {
	var req app.Project
	if !decodeJSON(w, r, &req) {
		return
	}
	project, err := s.service.CreateProject(r.Context(), s.actor(r), req)
	if err != nil {
		if writeBillingError(w, err) {
			return
		}
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "forbidden") {
			status = http.StatusForbidden
		}
		writeJSON(w, status, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, project)
}

func (s *Server) handleOwnerDashboard(w http.ResponseWriter, r *http.Request) {
	dashboard, err := s.service.OwnerDashboard(r.Context(), s.actor(r))
	if err != nil {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, dashboard)
}

func (s *Server) handleExportCSV(w http.ResponseWriter, r *http.Request) {
	csvBytes, err := s.service.ExportProjectCSV(r.Context(), s.actor(r), chi.URLParam(r, "projectID"))
	if err != nil {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": err.Error()})
		return
	}
	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", "projectpulse-export.csv"))
	_, _ = w.Write(csvBytes)
}

func (s *Server) handleClientSummary(w http.ResponseWriter, r *http.Request) {
	summary, err := s.service.ClientSummaryView(r.Context(), s.actor(r), chi.URLParam(r, "projectID"))
	if err != nil {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, summary)
}

func (s *Server) handleCreateTask(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Task        app.Task        `json:"task"`
		Deliverable app.Deliverable `json:"deliverable"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	task, deliverable, err := s.service.CreateTask(r.Context(), s.actor(r), chi.URLParam(r, "projectID"), req.Task, req.Deliverable)
	if err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "forbidden") {
			status = http.StatusForbidden
		}
		writeJSON(w, status, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"task": task, "deliverable": deliverable})
}

func (s *Server) handleTaskUpdate(w http.ResponseWriter, r *http.Request) {
	var task app.Task
	if !decodeJSON(w, r, &task) {
		return
	}
	updated, err := s.service.UpdateTask(r.Context(), s.actor(r), chi.URLParam(r, "taskID"), task)
	if err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "forbidden") {
			status = http.StatusForbidden
		}
		writeJSON(w, status, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleTaskDelete(w http.ResponseWriter, r *http.Request) {
	if err := s.service.DeleteTask(r.Context(), s.actor(r), chi.URLParam(r, "taskID")); err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "forbidden") {
			status = http.StatusForbidden
		}
		writeJSON(w, status, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": true})
}

func (s *Server) handleTaskTimeline(w http.ResponseWriter, r *http.Request) {
	var req struct {
		StartDate       string `json:"start_date"`
		EndDate         string `json:"end_date"`
		Status          string `json:"status"`
		ProgressPercent int    `json:"progress_percent"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	task, err := s.service.UpdateTaskTimeline(r.Context(), s.actor(r), chi.URLParam(r, "taskID"), req.StartDate, req.EndDate, req.Status, req.ProgressPercent)
	if err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "forbidden") {
			status = http.StatusForbidden
		}
		writeJSON(w, status, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, task)
}

func (s *Server) handleAssignedTasks(w http.ResponseWriter, r *http.Request) {
	tasks, err := s.service.ListAssignedTasks(r.Context(), s.actor(r))
	if err != nil {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, tasks)
}

func (s *Server) handleTaskEvidences(w http.ResponseWriter, r *http.Request) {
	evidences, err := s.service.ListTaskEvidences(r.Context(), s.actor(r), chi.URLParam(r, "taskID"))
	if err != nil {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, evidences)
}

func (s *Server) handleUploadURL(w http.ResponseWriter, r *http.Request) {
	var req struct {
		FileName      string  `json:"file_name"`
		ContentType   string  `json:"content_type"`
		FileSizeBytes int64   `json:"file_size_bytes"`
		Latitude      float64 `json:"latitude"`
		Longitude     float64 `json:"longitude"`
		ProjectID     string  `json:"project_id"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	baseURL := requestBaseURL(r)
	session, err := s.service.RequestUpload(r.Context(), s.actor(r), chi.URLParam(r, "taskID"), req.FileName, req.ContentType, req.FileSizeBytes, req.Latitude, req.Longitude, baseURL, req.ProjectID)
	if err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "forbidden") {
			status = http.StatusForbidden
		}
		writeJSON(w, status, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, session)
}

func (s *Server) handleSignedUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 500<<20)
	if err := s.service.SaveUploadedFile(r.Context(), chi.URLParam(r, "sessionID"), r.URL.Query().Get("token"), r.Header.Get("Content-Type"), r.Body); err != nil {
		if err.Error() == "http: request body too large" {
			writeJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"error": "file exceeds 500MB limit"})
			return
		}
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"uploaded": true})
}

func (s *Server) handleConfirmUpload(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UploadSessionID string `json:"upload_session_id"`
		MetadataEXIF    string `json:"metadata_exif"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	evidence, err := s.service.ConfirmUpload(r.Context(), s.actor(r), req.UploadSessionID, req.MetadataEXIF)
	if err != nil {
		if writeBillingError(w, err) {
			return
		}
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "forbidden") {
			status = http.StatusForbidden
		}
		writeJSON(w, status, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, evidence)
}

func (s *Server) handleApproveEvidence(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Comment         string `json:"comment"`
		VisibleToClient bool   `json:"visible_to_client"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	evidence, err := s.service.ApproveEvidence(r.Context(), s.actor(r), chi.URLParam(r, "evidenceID"), req.Comment, req.VisibleToClient)
	if err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "forbidden") {
			status = http.StatusForbidden
		}
		writeJSON(w, status, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, evidence)
}

func (s *Server) handleRejectEvidence(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Reason string `json:"reason"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	evidence, err := s.service.RejectEvidence(r.Context(), s.actor(r), chi.URLParam(r, "evidenceID"), req.Reason)
	if err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "forbidden") {
			status = http.StatusForbidden
		}
		writeJSON(w, status, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, evidence)
}

func (s *Server) handleDeleteEvidence(w http.ResponseWriter, r *http.Request) {
	if err := s.service.DeleteEvidence(r.Context(), s.actor(r), chi.URLParam(r, "evidenceID")); err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "forbidden") {
			status = http.StatusForbidden
		}
		writeJSON(w, status, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": true})
}

func (s *Server) handleEvidenceFile(w http.ResponseWriter, r *http.Request) {
	rc, contentType, err := s.service.EvidenceFile(r.Context(), s.actor(r), chi.URLParam(r, "evidenceID"))
	if err != nil {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": err.Error()})
		return
	}
	defer rc.Close()
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	w.Header().Set("Content-Type", contentType)
	_, _ = io.Copy(w, rc)
}

func (s *Server) handleListExpenses(w http.ResponseWriter, r *http.Request) {
	expenses, err := s.service.ListExpenses(r.Context(), s.actor(r), chi.URLParam(r, "projectID"))
	if err != nil {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, expenses)
}

func (s *Server) handleCreateExpense(w http.ResponseWriter, r *http.Request) {
	var exp app.Expense
	if !decodeJSON(w, r, &exp) {
		return
	}
	exp.ProjectID = chi.URLParam(r, "projectID")
	created, err := s.service.CreateExpense(r.Context(), s.actor(r), exp)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (s *Server) handleUpdateExpense(w http.ResponseWriter, r *http.Request) {
	var exp app.Expense
	if !decodeJSON(w, r, &exp) {
		return
	}
	updated, err := s.service.UpdateExpense(r.Context(), s.actor(r), chi.URLParam(r, "expenseID"), exp)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleDeleteExpense(w http.ResponseWriter, r *http.Request) {
	if err := s.service.DeleteExpense(r.Context(), s.actor(r), chi.URLParam(r, "expenseID")); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": true})
}

func (s *Server) handleListDailyLogs(w http.ResponseWriter, r *http.Request) {
	logs, err := s.service.ListDailyLogs(r.Context(), s.actor(r), chi.URLParam(r, "projectID"))
	if err != nil {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, logs)
}

func (s *Server) handleCreateDailyLog(w http.ResponseWriter, r *http.Request) {
	var log app.DailyLog
	if !decodeJSON(w, r, &log) {
		return
	}
	log.ProjectID = chi.URLParam(r, "projectID")
	created, err := s.service.CreateDailyLog(r.Context(), s.actor(r), log)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (s *Server) handleUpdateDailyLog(w http.ResponseWriter, r *http.Request) {
	var log app.DailyLog
	if !decodeJSON(w, r, &log) {
		return
	}
	updated, err := s.service.UpdateDailyLog(r.Context(), s.actor(r), chi.URLParam(r, "logID"), log)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleDeleteDailyLog(w http.ResponseWriter, r *http.Request) {
	if err := s.service.DeleteDailyLog(r.Context(), s.actor(r), chi.URLParam(r, "logID")); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": true})
}

func (s *Server) handleListMessages(w http.ResponseWriter, r *http.Request) {
	msgs, err := s.service.ListProjectMessages(r.Context(), s.actor(r), chi.URLParam(r, "projectID"))
	if err != nil {
		status := http.StatusForbidden
		if strings.Contains(err.Error(), "no rows") {
			status = http.StatusNotFound
		}
		writeJSON(w, status, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, msgs)
}

func (s *Server) handleSendMessage(w http.ResponseWriter, r *http.Request) {
	var msg app.ProjectMessage
	if !decodeJSON(w, r, &msg) {
		return
	}
	msg.ProjectID = chi.URLParam(r, "projectID")
	created, err := s.service.SendProjectMessage(r.Context(), s.actor(r), msg)
	if err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "forbidden") {
			status = http.StatusForbidden
		}
		if strings.Contains(err.Error(), "no rows") {
			status = http.StatusNotFound
		}
		writeJSON(w, status, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (s *Server) handleUpdateMessage(w http.ResponseWriter, r *http.Request) {
	var msg app.ProjectMessage
	if !decodeJSON(w, r, &msg) {
		return
	}
	updated, err := s.service.UpdateProjectMessage(r.Context(), s.actor(r), chi.URLParam(r, "messageID"), msg)
	if err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "forbidden") {
			status = http.StatusForbidden
		}
		if strings.Contains(err.Error(), "no rows") {
			status = http.StatusNotFound
		}
		writeJSON(w, status, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleDeleteMessage(w http.ResponseWriter, r *http.Request) {
	if err := s.service.DeleteProjectMessage(r.Context(), s.actor(r), chi.URLParam(r, "messageID")); err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "forbidden") {
			status = http.StatusForbidden
		}
		if strings.Contains(err.Error(), "no rows") {
			status = http.StatusNotFound
		}
		writeJSON(w, status, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": true})
}

func (s *Server) handleUpdateProject(w http.ResponseWriter, r *http.Request) {
	var patch app.Project
	if !decodeJSON(w, r, &patch) {
		return
	}
	updated, err := s.service.UpdateProject(r.Context(), s.actor(r), chi.URLParam(r, "projectID"), patch)
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, sql.ErrNoRows) {
			status = http.StatusNotFound
		} else if strings.Contains(err.Error(), "forbidden") {
			status = http.StatusForbidden
		}
		writeJSON(w, status, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleListBudgetAdjustments(w http.ResponseWriter, r *http.Request) {
	adjustments, err := s.service.ListBudgetAdjustments(r.Context(), s.actor(r), chi.URLParam(r, "projectID"))
	if err != nil {
		status := http.StatusForbidden
		if strings.Contains(err.Error(), "not found") {
			status = http.StatusNotFound
		}
		writeJSON(w, status, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, adjustments)
}

func (s *Server) handleCreateBudgetAdjustment(w http.ResponseWriter, r *http.Request) {
	var ba app.BudgetAdjustment
	if !decodeJSON(w, r, &ba) {
		return
	}
	ba.ProjectID = chi.URLParam(r, "projectID")
	created, err := s.service.CreateBudgetAdjustment(r.Context(), s.actor(r), ba)
	if err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "forbidden") {
			status = http.StatusForbidden
		}
		writeJSON(w, status, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20) // 1 MB limit
	defer r.Body.Close()
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid json"})
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func requestBaseURL(r *http.Request) string {
	host := r.Header.Get("X-Forwarded-Host")
	if host == "" {
		host = r.Host
	}
	port := r.Header.Get("X-Forwarded-Port")
	if port != "" && !strings.Contains(host, ":") {
		host = fmt.Sprintf("%s:%s", host, port)
	}
	proto := r.Header.Get("X-Forwarded-Proto")
	if proto == "" {
		proto = "http"
	}
	return fmt.Sprintf("%s://%s", proto, host)
}
func (s *Server) handleProjectBlueprints(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "projectID")
	actor := r.Context().Value(actorKey{}).(app.Claims)
	blueprints, err := s.service.BlueprintsForProject(r.Context(), actor, id)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, blueprints)
}

func (s *Server) handleBlueprintUploadURL(w http.ResponseWriter, r *http.Request) {
	var req struct {
		FileName      string `json:"file_name"`
		ContentType   string `json:"content_type"`
		FileSizeBytes int64  `json:"file_size_bytes"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	session, err := s.service.RequestBlueprintUpload(
		r.Context(),
		s.actor(r),
		chi.URLParam(r, "projectID"),
		req.FileName,
		req.ContentType,
		req.FileSizeBytes,
		requestBaseURL(r),
	)
	if err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "forbidden") {
			status = http.StatusForbidden
		}
		writeJSON(w, status, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, session)
}

func (s *Server) handleBlueprintFile(w http.ResponseWriter, r *http.Request) {
	rc, contentType, filename, err := s.service.BlueprintFile(r.Context(), s.actor(r), chi.URLParam(r, "blueprintID"))
	if err != nil {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": err.Error()})
		return
	}
	defer rc.Close()
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	w.Header().Set("Content-Type", contentType)
	if filename != "" {
		w.Header().Set("Content-Disposition", fmt.Sprintf("inline; filename=%q", filename))
	}
	_, _ = io.Copy(w, rc)
}

func (s *Server) handleDeleteBlueprint(w http.ResponseWriter, r *http.Request) {
	if err := s.service.DeleteBlueprint(r.Context(), s.actor(r), chi.URLParam(r, "blueprintID")); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": true})
}

func (s *Server) handleBlueprintRegister(w http.ResponseWriter, r *http.Request) {
	actor := r.Context().Value(actorKey{}).(app.Claims)
	var body struct {
		UploadSessionID string `json:"upload_session_id"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	bp, err := s.service.RegisterBlueprint(r.Context(), actor, body.UploadSessionID)
	if err != nil {
		if writeBillingError(w, err) {
			return
		}
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, bp)
}

func (s *Server) handleBlueprintPreview(w http.ResponseWriter, r *http.Request) {
	rc, contentType, _, err := s.service.BlueprintPreview(r.Context(), s.actor(r), chi.URLParam(r, "blueprintID"))
	if err != nil {
		http.Error(w, "preview not available", http.StatusNotFound)
		return
	}
	defer rc.Close()
	w.Header().Set("Content-Type", contentType)
	io.Copy(w, rc)
}
