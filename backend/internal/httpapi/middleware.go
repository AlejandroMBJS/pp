package httpapi

import (
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// securityHeaders sets defensive HTTP response headers on every response.
// HSTS is intentionally NOT set here — nginx terminates TLS and sets it.
// Setting HSTS from plain-HTTP backend responses pollutes the client cache
// during local dev and provides no security benefit.
func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
		next.ServeHTTP(w, r)
	})
}

// corsWithOrigins returns a CORS middleware that only reflects the given
// origins. If the request Origin is not in the allow-list we simply do not
// set Access-Control-Allow-Origin — the browser will block the response on
// its own. We deliberately avoid returning 403 here because that strips the
// CORS headers and turns debugging into guesswork (the browser surfaces a
// generic CORS error with no body). Non-browser clients with a disallowed
// Origin still get the response but lose cookies/auth in strict contexts.
//
// An empty allow-list means "same-origin only": no cross-origin request will
// be blessed, but same-origin traffic (no Origin header, or Origin matching
// the host) continues to work normally.
func corsWithOrigins(allowed []string) func(http.Handler) http.Handler {
	set := make(map[string]struct{}, len(allowed))
	for _, o := range allowed {
		set[strings.TrimRight(o, "/")] = struct{}{}
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			h := w.Header()
			h.Set("Vary", "Origin")
			h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			h.Set("Access-Control-Allow-Credentials", "true")
			origin := strings.TrimRight(r.Header.Get("Origin"), "/")
			if origin != "" {
				if _, ok := set[origin]; ok {
					h.Set("Access-Control-Allow-Origin", origin)
				}
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// ipRateLimiter is a simple token-bucket-per-IP limiter. Not distributed —
// behind a load balancer you need sticky sessions or a shared store (Redis).
type ipRateLimiter struct {
	mu       sync.Mutex
	buckets  map[string]*bucket
	rate     float64 // tokens per second
	burst    float64
	lastSwap time.Time
}

type bucket struct {
	tokens    float64
	updatedAt time.Time
}

func newIPRateLimiter(ratePerSecond, burst float64) *ipRateLimiter {
	return &ipRateLimiter{
		buckets:  make(map[string]*bucket),
		rate:     ratePerSecond,
		burst:    burst,
		lastSwap: time.Now(),
	}
}

func (l *ipRateLimiter) allow(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	// Evict stale entries every 5 minutes to bound memory.
	if now.Sub(l.lastSwap) > 5*time.Minute {
		for k, b := range l.buckets {
			if now.Sub(b.updatedAt) > 10*time.Minute {
				delete(l.buckets, k)
			}
		}
		l.lastSwap = now
	}

	b, ok := l.buckets[ip]
	if !ok {
		l.buckets[ip] = &bucket{tokens: l.burst - 1, updatedAt: now}
		return true
	}
	elapsed := now.Sub(b.updatedAt).Seconds()
	b.tokens = minFloat(l.burst, b.tokens+elapsed*l.rate)
	b.updatedAt = now
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

func minFloat(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

func (l *ipRateLimiter) middleware() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := clientIP(r)
			if !l.allow(ip) {
				w.Header().Set("Retry-After", "30")
				writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "too many requests"})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	// Only trust X-Forwarded-For / X-Real-IP when the request comes from a
	// trusted upstream (nginx gateway on the docker network or loopback). An
	// attacker hitting the backend directly from the public internet must not
	// be able to spoof their source IP via these headers.
	if !isTrustedProxyIP(host) {
		return host
	}
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if i := strings.IndexByte(xff, ','); i >= 0 {
			return strings.TrimSpace(xff[:i])
		}
		return strings.TrimSpace(xff)
	}
	if xr := r.Header.Get("X-Real-IP"); xr != "" {
		return xr
	}
	return host
}

func isTrustedProxyIP(host string) bool {
	ip := net.ParseIP(host)
	if ip == nil {
		return false
	}
	if ip.IsLoopback() {
		return true
	}
	// Docker bridge networks live in private ranges (172.16.0.0/12,
	// 192.168.0.0/16, 10.0.0.0/8). The nginx gateway sits inside one of these.
	return ip.IsPrivate()
}

// writeError writes an error response. 5xx responses log the full error and
// return a generic message to avoid leaking internals. 4xx responses show the
// message as-is, on the assumption that the service layer only returns
// user-safe validation errors with those status codes.
func writeError(w http.ResponseWriter, r *http.Request, status int, err error) {
	if status >= 500 {
		slog.Error("http server error",
			"method", r.Method,
			"path", r.URL.Path,
			"status", status,
			"err", err.Error(),
		)
		writeJSON(w, status, map[string]any{"error": "internal server error"})
		return
	}
	writeJSON(w, status, map[string]any{"error": err.Error()})
}
