package app

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// WeatherSnapshot is the subset of weather we persist on a daily log.
type WeatherSnapshot struct {
	Summary         string  `json:"summary"`
	TempCelsius     float64 `json:"temp_c"`
	WindKph         float64 `json:"wind_kph"`
	PrecipitationMM float64 `json:"precipitation_mm"`
	Source          string  `json:"source"`   // "open-meteo"
	FetchedAt       string  `json:"fetched_at"`
}

// FetchWeather queries Open-Meteo's free archive/forecast API for a given
// date and lat/long. It's best-effort: network or decode errors return nil
// (callers should fall back to user-entered data or omit the section).
// No API key required. Timeout is tight (4s) so a slow response can't block
// log creation.
func FetchWeather(ctx context.Context, lat, lng float64, date string) *WeatherSnapshot {
	if lat == 0 && lng == 0 {
		return nil
	}
	if date == "" {
		date = time.Now().UTC().Format("2006-01-02")
	}

	// Decide which Open-Meteo endpoint: archive for past dates, forecast otherwise.
	target, err := time.Parse("2006-01-02", date)
	if err != nil {
		return nil
	}
	isPast := target.Before(time.Now().UTC().Truncate(24 * time.Hour))
	host := "https://api.open-meteo.com/v1/forecast"
	if isPast {
		host = "https://archive-api.open-meteo.com/v1/archive"
	}
	url := fmt.Sprintf(
		"%s?latitude=%.4f&longitude=%.4f&start_date=%s&end_date=%s&daily=temperature_2m_max,wind_speed_10m_max,precipitation_sum,weather_code&timezone=UTC",
		host, lat, lng, date, date,
	)

	httpCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(httpCtx, http.MethodGet, url, nil)
	if err != nil {
		return nil
	}
	client := &http.Client{Timeout: 4 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil
	}
	var body struct {
		Daily struct {
			Time              []string  `json:"time"`
			TempMax           []float64 `json:"temperature_2m_max"`
			WindMax           []float64 `json:"wind_speed_10m_max"`
			Precipitation     []float64 `json:"precipitation_sum"`
			WeatherCode       []int     `json:"weather_code"`
		} `json:"daily"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil
	}
	if len(body.Daily.Time) == 0 {
		return nil
	}
	idx := 0
	out := &WeatherSnapshot{
		Source:    "open-meteo",
		FetchedAt: time.Now().UTC().Format(time.RFC3339),
	}
	if len(body.Daily.TempMax) > idx {
		out.TempCelsius = body.Daily.TempMax[idx]
	}
	if len(body.Daily.WindMax) > idx {
		out.WindKph = body.Daily.WindMax[idx]
	}
	if len(body.Daily.Precipitation) > idx {
		out.PrecipitationMM = body.Daily.Precipitation[idx]
	}
	if len(body.Daily.WeatherCode) > idx {
		out.Summary = weatherCodeToSummary(body.Daily.WeatherCode[idx])
	}
	return out
}

// weatherCodeToSummary maps WMO weather interpretation codes to a short
// human-readable summary. Reference:
// https://open-meteo.com/en/docs#weathervariables
func weatherCodeToSummary(code int) string {
	switch {
	case code == 0:
		return "Clear"
	case code <= 3:
		return "Partly cloudy"
	case code <= 48:
		return "Fog"
	case code <= 57:
		return "Drizzle"
	case code <= 67:
		return "Rain"
	case code <= 77:
		return "Snow"
	case code <= 82:
		return "Rain showers"
	case code <= 86:
		return "Snow showers"
	case code <= 99:
		return "Thunderstorm"
	default:
		return ""
	}
}
