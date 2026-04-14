package app

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"
)

type EmailSender interface {
	Send(ctx context.Context, to, subject, body string) error
	SendHTML(ctx context.Context, to, subject, html string) error
}

type ConsoleEmailSender struct{}

func (c *ConsoleEmailSender) Send(ctx context.Context, to, subject, body string) error {
	fmt.Printf("\n--- EMAIL SENT ---\nTo: %s\nSubject: %s\nBody: %s\n------------------\n\n", to, subject, body)
	return nil
}

func (c *ConsoleEmailSender) SendHTML(ctx context.Context, to, subject, html string) error {
	fmt.Printf("\n--- EMAIL SENT (HTML) ---\nTo: %s\nSubject: %s\nHTML:\n%s\n------------------\n\n", to, subject, html)
	return nil
}

// ResendEmailSender sends transactional email via the Resend HTTP API.
// Docs: https://resend.com/docs/api-reference/emails/send-email
type ResendEmailSender struct {
	APIKey  string
	From    string
	ReplyTo string
	Client  *http.Client
	Logger  *slog.Logger
}

func NewResendEmailSender(apiKey, from, replyTo string, logger *slog.Logger) *ResendEmailSender {
	if logger == nil {
		logger = slog.Default()
	}
	return &ResendEmailSender{
		APIKey:  apiKey,
		From:    from,
		ReplyTo: replyTo,
		Client:  &http.Client{Timeout: 10 * time.Second},
		Logger:  logger,
	}
}

func (r *ResendEmailSender) send(ctx context.Context, to, subject string, payload map[string]any) error {
	payload["from"] = r.From
	payload["to"] = []string{to}
	payload["subject"] = subject
	if r.ReplyTo != "" {
		payload["reply_to"] = r.ReplyTo
	}
	buf, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("resend: marshal: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(buf))
	if err != nil {
		return fmt.Errorf("resend: new request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+r.APIKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := r.Client.Do(req)
	if err != nil {
		return fmt.Errorf("resend: do: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		r.Logger.Error("resend send failed",
			"to", to,
			"status", resp.StatusCode,
			"body", string(respBody),
		)
		return fmt.Errorf("resend: status %d", resp.StatusCode)
	}
	r.Logger.Info("email.sent", "provider", "resend", "to", to, "subject", subject)
	return nil
}

func (r *ResendEmailSender) Send(ctx context.Context, to, subject, body string) error {
	return r.send(ctx, to, subject, map[string]any{"text": body})
}

func (r *ResendEmailSender) SendHTML(ctx context.Context, to, subject, html string) error {
	return r.send(ctx, to, subject, map[string]any{"html": html})
}

// RenderDemoCredentialsEmail builds the HTML body for a demo-credentials email.
// Kept as a standalone func so the demo service can reuse it without an interface bump.
func RenderDemoCredentialsEmail(name, loginURL, email, password string, expiresAt time.Time) (subject, html string) {
	subject = "Tus credenciales de demo de ProjectPulse"
	expires := expiresAt.Format("Mon Jan 2 15:04 MST 2006")
	html = fmt.Sprintf(`<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0a0a0a;color:#f5f5f5;margin:0;padding:32px;">
  <div style="max-width:560px;margin:0 auto;background:#111;border:1px solid #222;border-radius:12px;padding:32px;">
    <h1 style="font-size:22px;margin:0 0 16px;color:#fff;">Hola %s,</h1>
    <p style="line-height:1.6;color:#bbb;">Tu workspace de demo está listo. Úsalo para explorar ProjectPulse con datos de ejemplo.</p>
    <div style="background:#0a0a0a;border:1px solid #222;border-radius:8px;padding:20px;margin:24px 0;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666;margin-bottom:8px;">Email</div>
      <div style="font-family:monospace;font-size:14px;color:#fff;margin-bottom:16px;">%s</div>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666;margin-bottom:8px;">Contraseña temporal</div>
      <div style="font-family:monospace;font-size:14px;color:#fff;">%s</div>
    </div>
    <p style="margin:24px 0;">
      <a href="%s/login" style="display:inline-block;background:#fff;color:#000;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;">Entrar al demo →</a>
    </p>
    <p style="font-size:13px;color:#888;line-height:1.6;">
      <strong style="color:#f5c518;">Este acceso expira el %s.</strong><br/>
      Después de esa fecha el workspace y sus datos se eliminan automáticamente.
    </p>
    <hr style="border:none;border-top:1px solid #222;margin:32px 0;"/>
    <p style="font-size:12px;color:#666;line-height:1.6;">
      ¿Dudas? Responde a este email y te contactamos.<br/>
      ProjectPulse · <a href="%s" style="color:#888;">projpul.com</a>
    </p>
  </div>
</body></html>`, name, email, password, loginURL, expires, loginURL)
	return subject, html
}
