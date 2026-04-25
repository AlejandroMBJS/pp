package backend_test

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"arquicheck/backend/internal/app"
	"arquicheck/backend/internal/httpapi"
)

// TestQuotaProjectEnforcement validates that a Starter tenant can create one
// project (the plan limit) and that the second create returns HTTP 402 with a
// "quota_exceeded" payload, and that an in-app notification is created.
func TestQuotaProjectEnforcement(t *testing.T) {
	const testJWTSecret = "projectpulse-test-secret-min-32-bytes-long-xxxx"
	os.Setenv("JWT_SECRET", testJWTSecret)
	tmp := t.TempDir()
	server, err := httpapi.NewServer(app.Config{
		DatabaseURL:           "postgres://arquicheck:arquicheck-password@localhost:5432/arquicheck_test?sslmode=disable",
		UploadDir:             filepath.Join(tmp, "uploads"),
		JWTSecret:             testJWTSecret,
		PlatformAdminEmail:    "admin@projectpulse.local",
		PlatformAdminPassword: "demo1234",
	})
	if err != nil {
		t.Fatal(err)
	}
	defer server.Close()

	ts := httptest.NewServer(server.Routes())
	defer ts.Close()

	// Fresh tenant — defaults to Starter plan (MaxActiveProjects = 1).
	ownerEmail := fmt.Sprintf("quota-owner-%d@test.local", time.Now().UnixNano())
	owner := registerOwner(t, ts.URL, ownerEmail)
	auth := bearer(owner.AccessToken)

	supervisor := createUser(t, ts.URL, auth, "Sofia", fmt.Sprintf("quota-sup-%d@test.local", time.Now().UnixNano()), "demo1234", app.RoleSupervisor)
	client := createUser(t, ts.URL, auth, "Carla", fmt.Sprintf("quota-cli-%d@test.local", time.Now().UnixNano()), "demo1234", app.RoleClient)

	// First project succeeds — at the plan limit (1/1).
	createProject(t, ts.URL, auth, supervisor.ID, client.ID)

	// Second project: should be rejected with 402 + quota_exceeded.
	resp := postJSON(t, ts.URL+"/api/v1/projects", auth, map[string]any{
		"name":               "Second Project",
		"description":        "Should be rejected",
		"supervisor_user_id": supervisor.ID,
		"client_user_id":     client.ID,
	})
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusPaymentRequired {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("expected 402 on quota exceeded, got %d: %s", resp.StatusCode, string(body))
	}
	var payload map[string]any
	decodeBody(t, resp.Body, &payload)
	if payload["type"] != "quota_exceeded" {
		t.Fatalf("expected quota_exceeded payload, got %v", payload)
	}

	// In-app notification should have been created for the block.
	// Allow the async path a brief moment.
	time.Sleep(150 * time.Millisecond)
	notifs := listNotifications(t, ts.URL, auth)
	found := false
	for _, raw := range notifs {
		n := raw.(map[string]any)
		if n["kind"] == "quota.projects.block" {
			found = true
			break
		}
	}
	if !found {
		buf, _ := json.Marshal(notifs)
		t.Fatalf("expected quota.projects.block notification, got %s", string(buf))
	}
}

func listNotifications(t *testing.T, baseURL, auth string) []any {
	t.Helper()
	return getJSONArray(t, baseURL+"/api/v1/notifications", auth)
}
