package main

import (
	"log"
	"log/slog"
	"net/http"
	"os"
	"time"

	"arquicheck/backend/internal/app"
	"arquicheck/backend/internal/httpapi"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	cfg := app.Config{
		DatabaseURL: envOrDefault("DATABASE_URL", "postgres://projectpulse:projectpulse-password@localhost:5432/projectpulse?sslmode=disable"),
		UploadDir:   envOrDefault("UPLOAD_DIR", "./data/uploads"),
		JWTSecret:   os.Getenv("JWT_SECRET"),
		PublicBase:  envOrDefault("PUBLIC_BASE_URL", ""),
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
		ReadTimeout:  600 * time.Second,
		WriteTimeout: 600 * time.Second,
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
