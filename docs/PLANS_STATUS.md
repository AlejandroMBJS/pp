# Plans — Status of enforcement

Last reviewed: 2026-04-14.

This doc tracks what the ProjectPulse pricing page advertises vs what the backend
actually enforces. Anything listed as ❌ or ⚠️ **must not** be advertised on the
public pricing page or landing until the backend gap is closed.

## Summary

| Area | Status | Notes |
|---|---|---|
| Projects quota per plan | ✅ enforced | `billing_service.go` `CheckProjectQuota` wired in `CreateProject` |
| Users quota per plan | ✅ enforced | `CheckUserQuota` wired in `InviteUser`, separates internal vs client seats |
| Monthly evidence captures quota | ✅ enforced | `CheckCaptureQuota` wired in `ConfirmUpload` (added in quota-enforcement patch) |
| Storage quota (GB) | ✅ enforced | `CheckStorageQuota` wired in `ConfirmUpload` + `RegisterBlueprint` |
| CAD blueprint uploads | ✅ enforced | `RequireFeature("blueprints_upload")` gates `RegisterBlueprint` |
| AI quality score (Gemini) | ✅ enforced | `callGeminiVision` runs inside `ConfirmUpload`; stubbed if no API key |
| CSV/PDF exports | ✅ works | Endpoint `/projects/{id}/export.csv` returns CSV for all paid plans |
| Stripe checkout + webhook | ⚠️ partial | Code complete; **missing `STRIPE_SECRET_KEY` in prod `.env`** |
| In-app notifications | ✅ added | Table `notifications` + endpoints `/notifications`, `/notifications/{id}/read` |
| Email quota warnings (80%) | ✅ added | `SendQuotaWarning` in `email.go`, fires on every quota check |
| Email quota blocks (100%) | ✅ added | `SendQuotaBlock` with CTA to `/pricing` |

## Explicitly removed from pricing UI (2026-04-14)

These were listed in `lib/plans.ts` but had **zero backend implementation**.
They have been deleted from the public pricing/landing until they ship.

| Feature | Plan it was listed under | Backend state |
|---|---|---|
| AI Predictions | Business | ❌ No endpoint, no model, no data pipeline |
| API Access (external API keys) | Business | ❌ No API key management, no per-tenant rate limit |
| Audit log (user operations) | Business | ⚠️ Only `ia_audits` table exists (covers AI audits, not user CRUD) |
| SSO / SAML | Enterprise | ❌ Only local JWT auth; no SAML provider integration |
| White-label | Enterprise | ❌ No per-tenant branding/settings |
| 24/7 support | Enterprise | ❌ Not a product feature — operational commitment we do not yet have |
| SLA 99.9% | Enterprise | ❌ No uptime monitoring / incident SLA framework |

Enterprise now advertises **"Custom SLA"** and **"Personalized support"** — honest
framing that reflects "we'll agree something in the contract" instead of a
blanket 99.9% promise.

## Open gaps (still missing, not advertised)

- **Per-user audit log**: no table recording who created/edited/deleted what.
  Needed before Business tier can honestly claim an "audit log" line.
- **SSO/SAML**: requires adding an OIDC/SAML provider layer to the auth
  middleware and a tenant-level config.
- **White-label**: needs a `tenant_branding` table (logo, primary color,
  from-address) and wiring it into the frontend + email templates.
- **API Access**: requires API key table, per-key rate limit, and public docs.
- **Storage size accounting** historically queried `size_bytes` but the column
  is `file_size_bytes`. Fixed in the quota-enforcement patch; noted here in
  case any older migration or report still references the wrong name.

## Acronym glossary

Used in the landing and pricing pages — spelled out once on first use:

- **RBAC** — Role-Based Access Control
- **CAD** — Computer-Aided Design (DWG / DXF / PDF blueprint formats)
- **IA / AI** — Inteligencia Artificial / Artificial Intelligence (Gemini Vision)
- **SLA** — Service Level Agreement (Enterprise contracts only)
- **MSA** — Master Service Agreement
- **NDA** — Non-Disclosure Agreement
- **SSO** — Single Sign-On (not yet shipped, removed from pricing)
- **SAML** — Security Assertion Markup Language (not yet shipped)

## When advertising a new plan feature

Before adding any bullet to `messages/*.json > plans.*.features`, confirm:

1. There is code that **enforces or delivers** the feature for the right plan.
2. There is at least one e2e test that exercises it.
3. It is listed above as ✅ in the Summary table.

If any of those is false, leave the bullet out.
