package main

import (
	"log"
	"log/slog"
	"net/http"
	"os"
	"strings"
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

	if err := srv.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
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
