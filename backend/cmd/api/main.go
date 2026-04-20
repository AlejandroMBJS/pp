package main

import (
	"context"
	"errors"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"arquicheck/backend/internal/app"
	"arquicheck/backend/internal/httpapi"
)

const minJWTSecretLen = 32

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	jwtSecret := os.Getenv("JWT_SECRET")
	if len(jwtSecret) < minJWTSecretLen {
		log.Fatalf("JWT_SECRET must be at least %d bytes; got %d. Generate one with: openssl rand -hex 32", minJWTSecretLen, len(jwtSecret))
	}

	// Fail-fast on half-configured Stripe: any STRIPE_* env being set means billing is
	// expected to work, so all required keys must also be present. A production deploy
	// missing the webhook secret silently accepts unverified events → fatal.
	stripeEnvs := map[string]string{
		"STRIPE_SECRET_KEY":         os.Getenv("STRIPE_SECRET_KEY"),
		"STRIPE_WEBHOOK_SECRET":     os.Getenv("STRIPE_WEBHOOK_SECRET"),
		"STRIPE_PRICE_PROFESSIONAL": os.Getenv("STRIPE_PRICE_PROFESSIONAL"),
		"STRIPE_PRICE_BUSINESS":     os.Getenv("STRIPE_PRICE_BUSINESS"),
		"STRIPE_PRICE_ENTERPRISE":   os.Getenv("STRIPE_PRICE_ENTERPRISE"),
	}
	anyStripeSet := false
	for _, v := range stripeEnvs {
		if v != "" {
			anyStripeSet = true
			break
		}
	}
	if anyStripeSet || os.Getenv("STRIPE_PUBLISHABLE_KEY") != "" {
		var missing []string
		for k, v := range stripeEnvs {
			if v == "" {
				missing = append(missing, k)
			}
		}
		if len(missing) > 0 {
			log.Fatalf("Stripe billing half-configured: missing %v. Set all STRIPE_* envs or unset them all.", missing)
		}
	}

	cfg := app.Config{
		DatabaseURL:    envOrDefault("DATABASE_URL", "postgres://projectpulse:projectpulse-password@localhost:5432/projectpulse?sslmode=disable"),
		UploadDir:      envOrDefault("UPLOAD_DIR", "./data/uploads"),
		JWTSecret:      jwtSecret,
		PublicBase:     envOrDefault("PUBLIC_BASE_URL", ""),
		GeminiAPIKey:   os.Getenv("GEMINI_API_KEY"),
		AllowedOrigins: parseCSV(os.Getenv("ALLOWED_ORIGINS")),

		StripeSecretKey:         os.Getenv("STRIPE_SECRET_KEY"),
		StripeWebhookSecret:     os.Getenv("STRIPE_WEBHOOK_SECRET"),
		StripePublishableKey:    os.Getenv("STRIPE_PUBLISHABLE_KEY"),
		StripePriceProfessional: os.Getenv("STRIPE_PRICE_PROFESSIONAL"),
		StripePriceBusiness:     os.Getenv("STRIPE_PRICE_BUSINESS"),
		StripePriceEnterprise:   os.Getenv("STRIPE_PRICE_ENTERPRISE"),
		BillingSuccessURL:       envOrDefault("BILLING_SUCCESS_URL", "https://projpul.com/billing/success"),
		BillingCancelURL:        envOrDefault("BILLING_CANCEL_URL", "https://projpul.com/billing"),

		ResendAPIKey:   os.Getenv("RESEND_API_KEY"),
		ResendFromAddr: envOrDefault("RESEND_FROM", "ProjectPulse <noreply@projpul.com>"),
		ResendReplyTo:  envOrDefault("RESEND_REPLY_TO", "soporte@projpul.com"),

		// Resend Audiences / webhook are deferred — fields reserved for later wiring.
		ResendAudiencesAPIKey: os.Getenv("RESEND_AUDIENCES_API_KEY"),
		ResendAudienceDemoID:  os.Getenv("RESEND_AUDIENCE_DEMO_ID"),
		ResendFromMarketing:   envOrDefault("RESEND_FROM_MARKETING", "ProjectPulse <hola@projpul.com>"),
		ResendWebhookSecret:   os.Getenv("RESEND_WEBHOOK_SECRET"),

		DemoBaseURL: envOrDefault("DEMO_BASE_URL", "https://projpul.com"),

		PlatformAdminEmail:    os.Getenv("PLATFORM_ADMIN_EMAIL"),
		PlatformAdminPassword: os.Getenv("PLATFORM_ADMIN_PASSWORD"),
	}
	server, err := httpapi.NewServer(cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer server.Close()

	addr := envOrDefault("APP_ADDR", ":8080")
	log.Printf("projectpulse api listening on %s", addr)

	srv := &http.Server{
		Addr:         addr,
		Handler:      server.Routes(),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 120 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// Graceful shutdown: listen for SIGTERM/SIGINT (Docker sends SIGTERM on stop).
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}()

	sig := <-quit
	log.Printf("received %s, shutting down gracefully…", sig)

	// Give in-flight requests 15 seconds to finish before forcing close.
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("forced shutdown: %v", err)
	}
	log.Println("server stopped")
}

func envOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func parseCSV(s string) []string {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
