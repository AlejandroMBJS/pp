package billing

type Plan string

const (
	PlanStarter      Plan = "starter"
	PlanProfessional Plan = "professional"
	PlanBusiness     Plan = "business"
	PlanEnterprise   Plan = "enterprise"
)

const (
	StatusTrialing Plan = "trialing"
	StatusActive          = "active"
	StatusPastDue         = "past_due"
	StatusCanceled        = "canceled"
	StatusReadOnly        = "read_only"
)

// Limits defines per-tenant resource caps. -1 means unlimited.
type Limits struct {
	MaxActiveProjects   int
	MaxInternalUsers    int
	MaxClientGuests     int
	MaxCapturesPerMonth int
	MaxStorageBytes     int64
	MaxBlueprintFiles   int
}

const GiB = int64(1) << 30

var PlanLimits = map[Plan]Limits{
	PlanStarter:      {MaxActiveProjects: 1, MaxInternalUsers: 4, MaxClientGuests: 5, MaxCapturesPerMonth: 50, MaxStorageBytes: 1 * GiB, MaxBlueprintFiles: 3},
	PlanProfessional: {MaxActiveProjects: 5, MaxInternalUsers: 15, MaxClientGuests: 25, MaxCapturesPerMonth: 500, MaxStorageBytes: 10 * GiB, MaxBlueprintFiles: 25},
	PlanBusiness:     {MaxActiveProjects: 20, MaxInternalUsers: 50, MaxClientGuests: 100, MaxCapturesPerMonth: 2000, MaxStorageBytes: 50 * GiB, MaxBlueprintFiles: 100},
	PlanEnterprise:   {MaxActiveProjects: -1, MaxInternalUsers: -1, MaxClientGuests: -1, MaxCapturesPerMonth: -1, MaxStorageBytes: 500 * GiB, MaxBlueprintFiles: -1},
}

// PlanFeatures lists feature flags enabled for each plan.
var PlanFeatures = map[Plan]map[string]bool{
	PlanStarter: {
		"dashboard": true, "timeline": true, "captures": true, "review": true,
		"messages": true, "blueprints_view": true, "basic_quality_score": true,
	},
	PlanProfessional: {
		"dashboard": true, "timeline": true, "captures": true, "review": true,
		"messages": true, "blueprints_view": true, "blueprints_upload": true,
		"gallery_advanced": true, "quality_score": true, "exports": true,
		"integrations_basic": true,
	},
	PlanBusiness: {
		"dashboard": true, "timeline": true, "captures": true, "review": true,
		"messages": true, "blueprints_view": true, "blueprints_upload": true,
		"gallery_advanced": true, "quality_score": true, "ai_predictions": true,
		"exports": true, "api_access": true, "custom_fields": true,
		"audit_log": true, "integrations_all": true,
	},
	PlanEnterprise: {
		"dashboard": true, "timeline": true, "captures": true, "review": true,
		"messages": true, "blueprints_view": true, "blueprints_upload": true,
		"gallery_advanced": true, "quality_score": true, "ai_predictions": true,
		"exports": true, "api_access": true, "custom_fields": true,
		"audit_log": true, "integrations_all": true, "sso_saml": true,
		"white_label": true, "priority_support": true,
	},
}

// HasFeature checks if a plan includes a feature.
func HasFeature(plan Plan, feature string) bool {
	feats, ok := PlanFeatures[plan]
	if !ok {
		return false
	}
	return feats[feature]
}

// AllowsCount returns true if `current` is below the limit (or unlimited).
func AllowsCount(limit, current int) bool {
	return limit == -1 || current < limit
}

// AllowsBytes returns true if `current` bytes are below the byte limit.
func AllowsBytes(limit, current int64) bool {
	return limit == -1 || current < limit
}

// PriceIDFor returns the configured Stripe price ID for a plan.
// The map should be passed in from Config (StripePriceProfessional, etc).
func PriceIDFor(plan Plan, prices map[Plan]string) string {
	return prices[plan]
}

// PlanFromPriceID does the reverse lookup — used in webhook handler to know
// what plan a subscription corresponds to.
func PlanFromPriceID(priceID string, prices map[Plan]string) Plan {
	for plan, id := range prices {
		if id == priceID {
			return plan
		}
	}
	return PlanStarter
}
