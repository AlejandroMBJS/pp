package app

import (
	"encoding/json"
	"time"
)

const (
	RoleAdmin      = "admin"
	RoleOwner      = "owner"
	RoleSupervisor = "supervisor"
	RoleHelper     = "helper"
	RoleClient     = "client"
)

type Config struct {
	DatabaseURL    string
	UploadDir      string
	JWTSecret      string
	PublicBase     string
	GeminiAPIKey   string
	AllowedOrigins []string

	// Stripe billing — all optional. If StripeSecretKey is empty, billing
	// is disabled and all tenants implicitly run in trial-forever mode.
	StripeSecretKey         string
	StripeWebhookSecret     string
	StripePublishableKey    string
	StripePriceProfessional string
	StripePriceBusiness     string
	StripePriceEnterprise   string
	BillingSuccessURL       string
	BillingCancelURL        string

	// Resend transactional email — optional. If ResendAPIKey is empty,
	// email falls back to ConsoleEmailSender (stdout logging).
	ResendAPIKey   string
	ResendFromAddr string
	ResendReplyTo  string

	// Resend Audiences (separate API key lets us rotate sending key
	// without breaking lead sync). Optional; when empty the demo flow
	// skips audience sync.
	ResendAudiencesAPIKey string
	ResendAudienceDemoID  string
	ResendFromMarketing   string

	// Webhook verification secret for /api/v1/webhooks/resend.
	ResendWebhookSecret string

	// DemoBaseURL is the public origin used inside demo credential emails.
	DemoBaseURL string

	// Platform admin — SaaS operator account with tenant_id="" and role=admin.
	// Upserted on every boot. If empty, no platform admin is created.
	PlatformAdminEmail    string
	PlatformAdminPassword string
}

// DemoLead is the lead row for a demo request; persists beyond tenant purge
// so we retain lead history for marketing campaigns.
type DemoLead struct {
	ID               string     `json:"id"`
	Email            string     `json:"email"`
	Name             string     `json:"name"`
	Company          string     `json:"company,omitempty"`
	Source           string     `json:"source,omitempty"`
	IPAddress        string     `json:"-"`
	UserAgent        string     `json:"-"`
	TenantID         string     `json:"tenant_id,omitempty"`
	DemoUserID       string     `json:"-"`
	ExpiresAt        time.Time  `json:"expires_at"`
	PurgedAt         *time.Time `json:"purged_at,omitempty"`
	ResendContactID  string     `json:"-"`
	Bounced          bool       `json:"bounced"`
	Unsubscribed     bool       `json:"unsubscribed"`
	OpenedCount      int        `json:"opened_count"`
	ClickedCount     int        `json:"clicked_count"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

type Subscription struct {
	ID                   string     `json:"id"`
	TenantID             string     `json:"tenant_id"`
	StripeCustomerID     string     `json:"stripe_customer_id,omitempty"`
	StripeSubscriptionID string     `json:"stripe_subscription_id,omitempty"`
	Plan                 string     `json:"plan"`
	Status               string     `json:"status"`
	TrialEndsAt          *time.Time `json:"trial_ends_at,omitempty"`
	CurrentPeriodEndsAt  *time.Time `json:"current_period_ends_at,omitempty"`
	CancelAtPeriodEnd    bool       `json:"cancel_at_period_end"`
	DaysUntilTrialEnd    int        `json:"days_until_trial_end"`
	Currency             string     `json:"currency"`
}

type Claims struct {
	UserID         string `json:"user_id"`
	TenantID       string `json:"tenant_id"`
	Role           string `json:"role"`
	Email          string `json:"email"`
	ImpersonatedBy string `json:"impersonated_by,omitempty"`
}

type User struct {
	ID            string `json:"id"`
	TenantID      string `json:"tenant_id"`
	Email         string `json:"email"`
	FullName      string `json:"full_name"`
	Role          string `json:"role"`
	EmailVerified bool   `json:"email_verified"`
	IsActive      bool   `json:"is_active"`
}

type AdminUserPatch struct {
	Role     *string `json:"role,omitempty"`
	FullName *string `json:"full_name,omitempty"`
	IsActive *bool   `json:"is_active,omitempty"`
}

type Tenant struct {
	ID                     string     `json:"id"`
	Name                   string     `json:"name"`
	Slug                   string     `json:"slug"`
	Website                string     `json:"website"`
	Country                string     `json:"country"`
	Timezone               string     `json:"timezone"`
	Currency               string     `json:"currency"`
	Industry               string     `json:"industry"`
	PublicDashboardEnabled bool       `json:"public_dashboard_enabled"`
	PublicGalleryEnabled   bool       `json:"public_gallery_enabled"`
	LogoURL                string     `json:"logo_url"`
	PrimaryColor           string     `json:"primary_color"`
	SecondaryColor         string     `json:"secondary_color"`
	SuspendedAt            *time.Time `json:"suspended_at,omitempty"`
	SuspensionReason       string     `json:"suspension_reason,omitempty"`
}

type TenantPatch struct {
	Name                   *string `json:"name,omitempty"`
	Website                *string `json:"website,omitempty"`
	Country                *string `json:"country,omitempty"`
	Timezone               *string `json:"timezone,omitempty"`
	Currency               *string `json:"currency,omitempty"`
	Industry               *string `json:"industry,omitempty"`
	PublicDashboardEnabled *bool   `json:"public_dashboard_enabled,omitempty"`
	PublicGalleryEnabled   *bool   `json:"public_gallery_enabled,omitempty"`
	LogoURL                *string `json:"logo_url,omitempty"`
	PrimaryColor           *string `json:"primary_color,omitempty"`
	SecondaryColor         *string `json:"secondary_color,omitempty"`
}

type Blueprint struct {
	ID               string `json:"id"`
	TenantID         string `json:"tenant_id"`
	ProjectID        string `json:"project_id"`
	UploadedByUserID string `json:"uploaded_by_user_id"`
	FileName         string `json:"file_name"`
	FileType         string `json:"file_type"` // dwg, dxf, pdf, glb
	FileSizeBytes    int64  `json:"file_size_bytes"`
	URLArchivo       string `json:"url_archivo"`
	URLPreview       string `json:"url_preview,omitempty"`
	Status           string `json:"status"`
	Scale            string `json:"scale"`
	Version          int    `json:"version"`
	MetadataJSON     string `json:"metadata_json"`
	CreatedAt        string `json:"created_at"`
}

type Project struct {
	ID               string  `json:"id"`
	TenantID         string  `json:"tenant_id"`
	Name             string  `json:"name"`
	Description      string  `json:"description"`
	Status           string  `json:"status"`
	ClientUserID     string  `json:"client_user_id"`
	SupervisorUserID string  `json:"supervisor_user_id"`
	BudgetTotalCents int64   `json:"budget_total_cents"`
	SpentTotalCents  int64   `json:"spent_total_cents"`
	StartDate        string  `json:"start_date"`
	PlannedEndDate   string  `json:"planned_end_date"`
	LatitudeCenter   float64 `json:"latitude_center"`
	LongitudeCenter  float64 `json:"longitude_center"`
	GeofenceRadiusM  int     `json:"geofence_radius_m"`
	LogoURL          string  `json:"logo_url"`
	DailyLogPreset   string  `json:"daily_log_preset"`
}

type Task struct {
	ID                    string `json:"id"`
	TenantID              string `json:"tenant_id"`
	ProjectID             string `json:"project_id"`
	Title                 string `json:"title"`
	Description           string `json:"description"`
	AssignedToUserID      string `json:"assigned_to_user_id"`
	Status                string `json:"status"`
	StartDate             string `json:"start_date"`
	EndDate               string `json:"end_date"`
	PredecessorTaskID     string `json:"predecessor_task_id,omitempty"` // For Gantt dependency
	ExpectedFinishQuality string `json:"expected_finish_quality"`
	TechnicalSpecText     string `json:"technical_spec_text"`
	BudgetCents           int64  `json:"budget_cents"`
	SpentCents            int64  `json:"spent_cents"`
	ProgressPercent       int    `json:"progress_percent"`
	ComparisonPhotoURL    string `json:"comparison_photo_url,omitempty"`
}

type Deliverable struct {
	ID               string `json:"id"`
	TenantID         string `json:"tenant_id"`
	ProjectID        string `json:"project_id"`
	TaskID           string `json:"task_id"`
	Title            string `json:"title"`
	Description      string `json:"description"`
	DueDate          string `json:"due_date"`
	Status           string `json:"status"`
	ClientVisible    bool   `json:"client_visible"`
	ApprovedByUserID string `json:"approved_by_user_id,omitempty"`
	ApprovedAt       string `json:"approved_at,omitempty"`
	RejectionReason  string `json:"rejection_reason,omitempty"`
}

type Evidence struct {
	ID                 string          `json:"id"`
	TenantID           string          `json:"tenant_id"`
	ProjectID          string          `json:"project_id"`
	TaskID             string          `json:"task_id"`
	UploadedByUserID   string          `json:"uploaded_by_user_id"`
	ApprovedByUserID   string          `json:"approved_by_user_id,omitempty"`
	FileName           string          `json:"file_name"`
	MimeType           string          `json:"mime_type"`
	FileSizeBytes      int64           `json:"file_size_bytes"`
	URLArchivo         string          `json:"url_archivo"`
	Status             string          `json:"status"`
	Latitude           float64         `json:"latitude"`
	Longitude          float64         `json:"longitude"`
	MetadataEXIF       string          `json:"metadata_exif"`
	ApprovalComment    string          `json:"approval_comment,omitempty"`
	RejectionReason    string          `json:"rejection_reason,omitempty"`
	VisibleToClient    bool            `json:"is_visible_to_client"`
	AIProcessingStatus string          `json:"ai_processing_status"`
	QualityScore       int             `json:"quality_score,omitempty"`
	CreatedAt          string          `json:"created_at"`
	AIFeedback         json.RawMessage `json:"ai_feedback,omitempty"`
	AIModelVersion     string          `json:"ai_model_version,omitempty"`
	UploaderName       string          `json:"uploader_name,omitempty"`
	TaskTitle          string          `json:"task_title,omitempty"`
	ReferencePhotoURL  string          `json:"reference_photo_url,omitempty"`
}

type UploadSession struct {
	ID           string `json:"id"`
	UploadURL    string `json:"upload_url"`
	Method       string `json:"method"`
	ExpiresAt    string `json:"expires_at"`
	FileName     string `json:"file_name"`
	ContentType  string `json:"content_type"`
	IntendedSize int64  `json:"intended_size_bytes"`
}

type Expense struct {
	ID               string `json:"id"`
	TenantID         string `json:"tenant_id"`
	ProjectID        string `json:"project_id"`
	TaskID           string `json:"task_id,omitempty"`
	Title            string `json:"title"`
	AmountCents      int64  `json:"amount_cents"`
	Category         string `json:"category"` // material, labor, equipment, misc
	Vendor           string `json:"vendor"`
	Status           string `json:"status"`                // pending, approved, disputed
	EvidenceID       string `json:"evidence_id,omitempty"` // Link to receipt photo
	UploadedByUserID string `json:"uploaded_by_user_id"`
	Date             string `json:"date"`
	CreatedAt        string `json:"created_at"`
}

type DailyLog struct {
	ID               string          `json:"id"`
	TenantID         string          `json:"tenant_id"`
	ProjectID        string          `json:"project_id"`
	Date             string          `json:"date"`                    // legacy, mirrors LogDate
	LogDate          string          `json:"log_date"`                // canonical date (YYYY-MM-DD)
	Weather          string          `json:"weather,omitempty"`       // legacy
	Headcount        int             `json:"headcount,omitempty"`     // legacy
	ManpowerJSON     string          `json:"manpower_json,omitempty"` // legacy
	Narrative        string          `json:"narrative"`
	Accidents        string          `json:"accidents,omitempty"` // legacy
	Sections         json.RawMessage `json:"sections"`            // preset-specific payload
	Status           string          `json:"status"`              // draft | submitted | approved | rejected
	AuthorUserID     string          `json:"author_user_id"`
	UploadedByUserID string          `json:"uploaded_by_user_id"` // legacy, mirrors AuthorUserID
	SubmittedAt      *time.Time      `json:"submitted_at,omitempty"`
	ApprovedByUserID string          `json:"approved_by_user_id,omitempty"`
	ApprovedAt       *time.Time      `json:"approved_at,omitempty"`
	ReviewerComment  string          `json:"reviewer_comment,omitempty"`
	Photos           []DailyLogPhoto `json:"photos"`
	Preset           string          `json:"preset,omitempty"` // effective preset (project or tenant)
	CreatedAt        string          `json:"created_at"`
	UpdatedAt        *time.Time      `json:"updated_at,omitempty"`
}

type DailyLogPhoto struct {
	ID               string `json:"id"`
	TenantID         string `json:"tenant_id"`
	LogID            string `json:"log_id"`
	URL              string `json:"url"`
	Caption          string `json:"caption"`
	Section          string `json:"section"`
	UploadedByUserID string `json:"uploaded_by_user_id"`
	CreatedAt        string `json:"created_at"`
}

// DailyLogPreset declares the section whitelist and capabilities for an industry.
type DailyLogPreset struct {
	Key               string   `json:"key"`
	Label             string   `json:"label"`
	Sections          []string `json:"sections"`
	RequiresSignature bool     `json:"requires_signature"`
	IncludesWeather   bool     `json:"includes_weather"`
}

type BudgetAdjustment struct {
	ID               string `json:"id"`
	TenantID         string `json:"tenant_id"`
	ProjectID        string `json:"project_id"`
	AmountCents      int64  `json:"amount_cents"`
	Reason           string `json:"reason"`
	ApprovedByUserID string `json:"approved_by_user_id"`
	Date             string `json:"date"`
	CreatedAt        string `json:"created_at"`
}

type ProjectMessage struct {
	ID         string `json:"id"`
	TenantID   string `json:"tenant_id"`
	ProjectID  string `json:"project_id"`
	FromUserID string `json:"from_user_id"`
	ToUserID   string `json:"to_user_id,omitempty"` // Empty if broadcast
	Text       string `json:"text"`
	Type       string `json:"type"`   // chat, rfi, announcement
	Status     string `json:"status"` // unread, read
	CreatedAt  string `json:"created_at"`
}

type RBACRule struct {
	Resource string `json:"resource"`
	Role     string `json:"role"`
	Effect   string `json:"effect"`
}

type LoginResponse struct {
	AccessToken string `json:"access_token"`
	User        User   `json:"user"`
}

type UserInviteResponse struct {
	User            User   `json:"user"`
	InviteURL       string `json:"invite_url"`
	InviteExpiresAt string `json:"invite_expires_at"`
}

type InviteLookupResponse struct {
	Email       string `json:"email"`
	FullName    string `json:"full_name"`
	Role        string `json:"role"`
	CompanyName string `json:"company_name"`
	ExpiresAt   string `json:"expires_at"`
}

type Dashboard struct {
	ProductName string        `json:"product_name"`
	Portfolio   Portfolio     `json:"portfolio"`
	Projects    []ProjectCard `json:"projects"`
}

type Portfolio struct {
	ActiveProjects int     `json:"active_projects"`
	OpenAlerts     int     `json:"open_alerts"`
	HealthScore    float64 `json:"health_score"`
	BudgetVariance string  `json:"budget_variance"`
}

type ProjectCard struct {
	ID               string `json:"id"`
	Name             string `json:"name"`
	Status           string `json:"status"`
	TimelineProgress int    `json:"timeline_progress"`
	BudgetConsumed   int    `json:"budget_consumed"`
	QualityScore     int    `json:"quality_score"`
	DeliverablesDue  int    `json:"deliverables_due"`
}

type ClientSummary struct {
	ProjectID          string        `json:"project_id"`
	ProjectName        string        `json:"project_name"`
	TimelineProgress   int           `json:"timeline_progress"`
	BudgetSpentPercent int           `json:"budget_spent_percent"`
	Deliverables       []Deliverable `json:"deliverables"`
	Gallery            []Evidence    `json:"gallery"`
}

type AuditFeedback struct {
	IsValidEvidence bool     `json:"is_valid_evidence"`
	QualityScore    int      `json:"quality_score"`
	AnalysisSummary string   `json:"analysis_summary"`
	DetectedIssues  []string `json:"detected_issues"`
	Recommendations string   `json:"recommendations"`
	StatusLogic     string   `json:"status_logic"`
}

type DemoAccount struct {
	Role     string `json:"role"`
	Email    string `json:"email"`
	Password string `json:"-"`
}

type DemoPayload struct {
	Product        string        `json:"product"`
	Message        string        `json:"message"`
	DemoAccounts   []DemoAccount `json:"demo_accounts"`
	SuggestedFlow  []string      `json:"suggested_flow"`
	GeneratedAtUTC time.Time     `json:"generated_at_utc"`
}

type Verification struct {
	ID        string `json:"id"`
	TenantID  string `json:"tenant_id"`
	UserID    string `json:"user_id"`
	Type      string `json:"type"` // email_verification, password_reset
	Token     string `json:"token"`
	ExpiresAt string `json:"expires_at"`
	CreatedAt string `json:"created_at"`
}
