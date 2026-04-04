package app

import (
	"context"
	"fmt"
)

type EmailSender interface {
	Send(ctx context.Context, to, subject, body string) error
}

type ConsoleEmailSender struct{}

func (c *ConsoleEmailSender) Send(ctx context.Context, to, subject, body string) error {
	fmt.Printf("\n--- EMAIL SENT ---\nTo: %s\nSubject: %s\nBody: %s\n------------------\n\n", to, subject, body)
	return nil
}

type SMTPEmailSender struct {
	Host     string
	Port     int
	User     string
	Password string
	From     string
}

func (s *SMTPEmailSender) Send(ctx context.Context, to, subject, body string) error {
	// Implementation placeholder for real SMTP
	fmt.Printf("SMTP Send to %s (not fully implemented)\n", to)
	return nil
}
