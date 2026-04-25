package billing

import (
	"errors"
	"fmt"

	"github.com/stripe/stripe-go/v76"
	billingportal "github.com/stripe/stripe-go/v76/billingportal/session"
	"github.com/stripe/stripe-go/v76/checkout/session"
	"github.com/stripe/stripe-go/v76/customer"
	"github.com/stripe/stripe-go/v76/webhook"
)

// Client is a thin wrapper around stripe-go for the operations PP needs.
// All methods are nil-safe — if the client was constructed with an empty
// secret key (development mode), they return ErrStripeNotConfigured so the
// caller can degrade gracefully.
type Client struct {
	secretKey     string
	webhookSecret string
}

var ErrStripeNotConfigured = errors.New("stripe not configured (missing STRIPE_SECRET_KEY)")

// NewClient builds a Stripe client. Pass empty strings to disable.
func NewClient(secretKey, webhookSecret string) *Client {
	if secretKey != "" {
		stripe.Key = secretKey
	}
	return &Client{secretKey: secretKey, webhookSecret: webhookSecret}
}

// Enabled reports whether Stripe is configured.
func (c *Client) Enabled() bool {
	return c != nil && c.secretKey != ""
}

// WebhookConfigured reports whether a shared webhook secret is set.
func (c *Client) WebhookConfigured() bool {
	return c != nil && c.webhookSecret != ""
}

// CreateCustomer creates a Stripe customer linked to a tenant via metadata.
func (c *Client) CreateCustomer(email, name, tenantID string) (*stripe.Customer, error) {
	if !c.Enabled() {
		return nil, ErrStripeNotConfigured
	}
	params := &stripe.CustomerParams{
		Email: stripe.String(email),
		Name:  stripe.String(name),
	}
	params.AddMetadata("tenant_id", tenantID)
	return customer.New(params)
}

// CreateCheckoutSession returns a hosted checkout URL for the given price.
// The customer is required (lazy-create with CreateCustomer first).
func (c *Client) CreateCheckoutSession(customerID, priceID, successURL, cancelURL, tenantID string) (*stripe.CheckoutSession, error) {
	if !c.Enabled() {
		return nil, ErrStripeNotConfigured
	}
	if priceID == "" {
		return nil, errors.New("price ID is required")
	}
	params := &stripe.CheckoutSessionParams{
		Customer: stripe.String(customerID),
		Mode:     stripe.String(string(stripe.CheckoutSessionModeSubscription)),
		LineItems: []*stripe.CheckoutSessionLineItemParams{
			{Price: stripe.String(priceID), Quantity: stripe.Int64(1)},
		},
		SuccessURL: stripe.String(successURL + "?session_id={CHECKOUT_SESSION_ID}"),
		CancelURL:  stripe.String(cancelURL),
		// Force the classic card form instead of the Link-first express flow.
		// Link auto-opens when the email matches a Link account and most of our
		// B2B users expect a standard corporate card entry.
		PaymentMethodTypes: stripe.StringSlice([]string{"card"}),
	}
	params.AddMetadata("tenant_id", tenantID)
	return session.New(params)
}

// CreatePortalSession returns a Stripe-hosted billing portal URL.
func (c *Client) CreatePortalSession(customerID, returnURL string) (*stripe.BillingPortalSession, error) {
	if !c.Enabled() {
		return nil, ErrStripeNotConfigured
	}
	params := &stripe.BillingPortalSessionParams{
		Customer:  stripe.String(customerID),
		ReturnURL: stripe.String(returnURL),
	}
	return billingportal.New(params)
}

// ParseWebhook verifies the Stripe signature and returns the parsed event.
// Pass the raw request body bytes (NOT decoded JSON).
func (c *Client) ParseWebhook(payload []byte, sigHeader string) (stripe.Event, error) {
	if c.webhookSecret == "" {
		return stripe.Event{}, fmt.Errorf("webhook secret not configured")
	}
	return webhook.ConstructEventWithOptions(payload, sigHeader, c.webhookSecret, webhook.ConstructEventOptions{
		IgnoreAPIVersionMismatch: true,
	})
}
