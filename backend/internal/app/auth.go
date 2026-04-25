package app

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// TokenBlacklist is a process-local set of revoked JWT signatures with their
// original expiries. It survives only while the backend is running — that's
// fine for our threat model (single-instance deploy, restart is rare).
//
// Tradeoff vs an external store like Redis: simpler ops, lossy on restart.
// For a multi-instance deploy this needs to move to Redis so revocations are
// global. Audit-findings.md F2.
type TokenBlacklist struct {
	mu      sync.RWMutex
	entries map[string]time.Time
}

func NewTokenBlacklist() *TokenBlacklist {
	bl := &TokenBlacklist{entries: make(map[string]time.Time)}
	go bl.janitor()
	return bl
}

// Revoke marks the given JWT as no longer valid until its natural expiry.
func (b *TokenBlacklist) Revoke(jwtStr string, expiresAt time.Time) {
	if jwtStr == "" {
		return
	}
	b.mu.Lock()
	b.entries[jwtStr] = expiresAt
	b.mu.Unlock()
}

// Revoked reports whether the given JWT has been explicitly revoked.
func (b *TokenBlacklist) Revoked(jwtStr string) bool {
	if jwtStr == "" {
		return false
	}
	b.mu.RLock()
	exp, found := b.entries[jwtStr]
	b.mu.RUnlock()
	if !found {
		return false
	}
	if time.Now().After(exp) {
		// Lazy cleanup — token would be rejected by ParseWithClaims anyway.
		b.mu.Lock()
		delete(b.entries, jwtStr)
		b.mu.Unlock()
		return false
	}
	return true
}

// janitor sweeps expired entries every 5 minutes so the map doesn't grow
// unbounded under heavy logout traffic.
func (b *TokenBlacklist) janitor() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		now := time.Now()
		b.mu.Lock()
		for k, exp := range b.entries {
			if now.After(exp) {
				delete(b.entries, k)
			}
		}
		b.mu.Unlock()
	}
}

// ParseTokenWithExpiry returns claims and the token's natural expiry so the
// caller can populate the blacklist with the right TTL.
func ParseTokenWithExpiry(secret []byte, tokenString string) (Claims, time.Time, error) {
	claims := JWTClaims{}
	token, err := jwt.ParseWithClaims(tokenString, &claims, func(token *jwt.Token) (any, error) {
		return secret, nil
	})
	if err != nil {
		return Claims{}, time.Time{}, err
	}
	if !token.Valid {
		return Claims{}, time.Time{}, errors.New("invalid token")
	}
	exp := time.Time{}
	if claims.ExpiresAt != nil {
		exp = claims.ExpiresAt.Time
	}
	return Claims{
		UserID:         claims.UserID,
		TenantID:       claims.TenantID,
		Role:           claims.Role,
		Email:          claims.Email,
		ImpersonatedBy: claims.ImpersonatedBy,
	}, exp, nil
}

type JWTClaims struct {
	UserID         string `json:"user_id"`
	TenantID       string `json:"tenant_id"`
	Role           string `json:"role"`
	Email          string `json:"email"`
	ImpersonatedBy string `json:"impersonated_by,omitempty"`
	jwt.RegisteredClaims
}

// bcryptCost is deliberately above bcrypt.DefaultCost (10). Cost 12 is the
// modern minimum against GPU-assisted cracking and still hashes in ~250ms
// on a modest server.
const bcryptCost = 12

func HashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

func ComparePassword(hash, password string) error {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
}

func GenerateSecureToken(size int) (string, error) {
	bytes := make([]byte, size)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(bytes), nil
}

func IssueToken(secret []byte, user User) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, JWTClaims{
		UserID:   user.ID,
		TenantID: user.TenantID,
		Role:     user.Role,
		Email:    user.Email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(12 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Subject:   user.ID,
		},
	})
	return token.SignedString(secret)
}

// IssueImpersonationToken mints a short-lived (1h) JWT as the target user,
// stamped with the admin's ID in ImpersonatedBy so audit trails can attribute
// actions back to the real operator.
func IssueImpersonationToken(secret []byte, target User, adminUserID string) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, JWTClaims{
		UserID:         target.ID,
		TenantID:       target.TenantID,
		Role:           target.Role,
		Email:          target.Email,
		ImpersonatedBy: adminUserID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(1 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Subject:   target.ID,
		},
	})
	return token.SignedString(secret)
}

func ParseToken(secret []byte, tokenString string) (Claims, error) {
	claims := JWTClaims{}
	token, err := jwt.ParseWithClaims(tokenString, &claims, func(token *jwt.Token) (any, error) {
		return secret, nil
	})
	if err != nil {
		return Claims{}, err
	}
	if !token.Valid {
		return Claims{}, errors.New("invalid token")
	}
	return Claims{
		UserID:         claims.UserID,
		TenantID:       claims.TenantID,
		Role:           claims.Role,
		Email:          claims.Email,
		ImpersonatedBy: claims.ImpersonatedBy,
	}, nil
}
