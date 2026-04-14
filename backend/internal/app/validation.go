package app

import (
	"errors"
	"regexp"
	"strings"
)

// Whitelists of MIME types the app accepts for uploads. Anything outside
// these lists is rejected at RequestUpload time — rejecting later (after
// the bytes have been stored) would still consume bandwidth/disk.

var evidenceMIMEWhitelist = map[string]struct{}{
	"image/jpeg":         {},
	"image/jpg":          {},
	"image/png":          {},
	"image/webp":         {},
	"image/heic":         {},
	"image/heif":         {},
	"image/tiff":         {},
	"image/gif":          {},
	"application/pdf":    {},
	"video/mp4":          {},
	"video/quicktime":    {},
	"application/msword": {},
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": {},
}

var blueprintMIMEWhitelist = map[string]struct{}{
	"application/pdf":             {},
	"image/png":                   {},
	"image/jpeg":                  {},
	"image/tiff":                  {},
	"image/vnd.dxf":               {},
	"image/vnd.dwg":               {},
	"application/acad":            {},
	"application/x-dwg":           {},
	"application/dxf":             {},
	"application/octet-stream":    {}, // DWG/DXF often arrive as this
	"application/vnd.ms-pki.stl":  {},
}

func validateEvidenceMIME(contentType string) error {
	ct := strings.ToLower(strings.TrimSpace(strings.SplitN(contentType, ";", 2)[0]))
	if ct == "" {
		return errors.New("content_type is required")
	}
	if _, ok := evidenceMIMEWhitelist[ct]; !ok {
		return errors.New("unsupported content type")
	}
	return nil
}

func validateBlueprintMIME(contentType string) error {
	ct := strings.ToLower(strings.TrimSpace(strings.SplitN(contentType, ";", 2)[0]))
	if ct == "" {
		return errors.New("content_type is required")
	}
	if _, ok := blueprintMIMEWhitelist[ct]; !ok {
		return errors.New("unsupported blueprint content type")
	}
	return nil
}

// --------------------------------------------------------------------------
// Registration / account input validation
// --------------------------------------------------------------------------

var (
	slugRegex  = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])?$`)
	emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)
)

const (
	minPasswordLen = 8
	maxPasswordLen = 128
	maxNameLen     = 255
	maxEmailLen    = 254
)

// validateRegistration returns a single user-safe error describing the first
// invalid field. The exact field name is intentionally omitted from some
// messages to avoid enumeration ("email taken" belongs elsewhere).
func validateRegistration(companyName, companySlug, ownerName, ownerEmail, password string) error {
	if len(companyName) == 0 || len(companyName) > maxNameLen {
		return errors.New("company_name must be 1-255 characters")
	}
	if !slugRegex.MatchString(companySlug) {
		return errors.New("company_slug must be lowercase alphanumeric with hyphens, 3-50 chars")
	}
	if len(ownerName) == 0 || len(ownerName) > maxNameLen {
		return errors.New("owner_name must be 1-255 characters")
	}
	if len(ownerEmail) == 0 || len(ownerEmail) > maxEmailLen || !emailRegex.MatchString(ownerEmail) {
		return errors.New("owner_email must be a valid email address")
	}
	return validatePassword(password)
}

func validatePassword(password string) error {
	if len(password) < minPasswordLen {
		return errors.New("password must be at least 8 characters")
	}
	if len(password) > maxPasswordLen {
		return errors.New("password is too long")
	}
	return nil
}
