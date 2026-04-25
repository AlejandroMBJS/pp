package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

// Daily-log presets are the operational schema for a Daily Log by industry.
// They're hardcoded (not per-tenant) to keep ProjectPulse out of the
// form-builder business. Tenants pick one via Settings → Company; projects
// may override via Project Settings.
const (
	PresetGeneric       = "generic"
	PresetConstruction  = "construction"
	PresetManufacturing = "manufacturing"
	PresetFieldService  = "field_service"
	PresetFacilities    = "facilities"
)

var dailyLogPresets = map[string]DailyLogPreset{
	PresetConstruction: {
		Key:               PresetConstruction,
		Label:             "Construction",
		Sections:          []string{"weather", "crew", "deliveries", "safety", "equipment", "issues"},
		RequiresSignature: true,
		IncludesWeather:   true,
	},
	PresetManufacturing: {
		Key:               PresetManufacturing,
		Label:             "Manufacturing / CNC",
		Sections:          []string{"shift", "production", "downtime", "quality", "safety"},
		RequiresSignature: false,
		IncludesWeather:   false,
	},
	PresetFieldService: {
		Key:               PresetFieldService,
		Label:             "Field service",
		Sections:          []string{"job_info", "parts_used", "customer_signature"},
		RequiresSignature: true,
		IncludesWeather:   false,
	},
	PresetFacilities: {
		Key:               PresetFacilities,
		Label:             "Facilities / maintenance",
		Sections:          []string{"asset", "meters", "parts", "followup"},
		RequiresSignature: false,
		IncludesWeather:   false,
	},
	PresetGeneric: {
		Key:               PresetGeneric,
		Label:             "Generic",
		Sections:          []string{},
		RequiresSignature: false,
		IncludesWeather:   false,
	},
}

// PresetByKey returns the preset config for a key, falling back to generic.
func PresetByKey(key string) DailyLogPreset {
	key = strings.TrimSpace(strings.ToLower(key))
	if p, ok := dailyLogPresets[key]; ok {
		return p
	}
	return dailyLogPresets[PresetGeneric]
}

// AllPresets returns every preset (for settings UIs that render a picker).
func AllPresets() []DailyLogPreset {
	out := make([]DailyLogPreset, 0, len(dailyLogPresets))
	// Stable order: generic first, then alphabetical.
	out = append(out, dailyLogPresets[PresetGeneric])
	for _, k := range []string{PresetConstruction, PresetFacilities, PresetFieldService, PresetManufacturing} {
		out = append(out, dailyLogPresets[k])
	}
	return out
}

// ValidPresetKey reports whether a preset key is known. Empty string is valid
// (means "inherit from tenant" at project level).
func ValidPresetKey(key string) bool {
	if key == "" {
		return true
	}
	_, ok := dailyLogPresets[strings.TrimSpace(strings.ToLower(key))]
	return ok
}

// ValidIndustryKey is the tenant-level counterpart. Empty string is NOT valid
// at tenant level (tenants default to 'generic').
func ValidIndustryKey(key string) bool {
	_, ok := dailyLogPresets[strings.TrimSpace(strings.ToLower(key))]
	return ok
}

// NormalizeSections enforces that sections_json only contains keys from the
// preset's whitelist. Unknown keys are dropped silently. Always returns a valid
// JSON object (never null).
func NormalizeSections(presetKey string, raw json.RawMessage) (json.RawMessage, error) {
	preset := PresetByKey(presetKey)
	if len(raw) == 0 {
		return json.RawMessage("{}"), nil
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(raw, &obj); err != nil {
		return nil, fmt.Errorf("sections must be a JSON object: %w", err)
	}
	if obj == nil {
		return json.RawMessage("{}"), nil
	}
	allowed := make(map[string]struct{}, len(preset.Sections))
	for _, k := range preset.Sections {
		allowed[k] = struct{}{}
	}
	// For generic preset, accept everything (whitelist is empty but we don't
	// want to wipe user data). For all others, enforce the whitelist.
	if len(preset.Sections) == 0 {
		return json.Marshal(obj)
	}
	cleaned := make(map[string]json.RawMessage, len(obj))
	for k, v := range obj {
		if _, ok := allowed[k]; ok {
			cleaned[k] = v
		}
	}
	return json.Marshal(cleaned)
}

// ValidLogStatus is the authoritative set of daily-log statuses.
func ValidLogStatus(s string) bool {
	switch strings.TrimSpace(strings.ToLower(s)) {
	case "draft", "submitted", "approved", "rejected":
		return true
	default:
		return false
	}
}

// ErrInvalidLogStatus is returned by status transition helpers.
var ErrInvalidLogStatus = errors.New("invalid daily log status")
