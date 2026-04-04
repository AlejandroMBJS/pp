package backend_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"arquicheck/backend/internal/app"
	"arquicheck/backend/internal/httpapi"
)

func TestRoleWorkflowsEndToEnd(t *testing.T) {
	os.Setenv("JWT_SECRET", "projectpulse-test-secret")
	tmp := t.TempDir()
	server, err := httpapi.NewServer(app.Config{
		DatabaseURL: "postgres://arquicheck:arquicheck-password@localhost:5432/arquicheck_test?sslmode=disable",
		UploadDir:   filepath.Join(tmp, "uploads"),
		JWTSecret:   "projectpulse-test-secret",
	})
	if err != nil {
		t.Fatal(err)
	}
	defer server.Close()

	ts := httptest.NewServer(server.Routes())
	defer ts.Close()

	ownerEmail := fmt.Sprintf("owner-%d@test.local", time.Now().UnixNano())
	owner := registerOwner(t, ts.URL, ownerEmail)

	ownerAuth := bearer(owner.AccessToken)
	supervisor := createUser(t, ts.URL, ownerAuth, "Sofia Supervisor", fmt.Sprintf("supervisor-%d@test.local", time.Now().UnixNano()), "demo123", app.RoleSupervisor)
	helper := createUser(t, ts.URL, ownerAuth, "Hugo Helper", fmt.Sprintf("helper-%d@test.local", time.Now().UnixNano()), "demo123", app.RoleHelper)
	client := createUser(t, ts.URL, ownerAuth, "Carla Client", fmt.Sprintf("client-%d@test.local", time.Now().UnixNano()), "demo123", app.RoleClient)

	project := createProject(t, ts.URL, ownerAuth, supervisor.ID, client.ID)
	projectID := project["id"].(string)
	updateBudget(t, ts.URL, ownerAuth, projectID, 150000000, 45000000)
	taskID := createTask(t, ts.URL, ownerAuth, projectID, helper.ID)

	supervisorLogin := login(t, ts.URL, supervisor.Email, "demo123")
	supervisorAuth := bearer(supervisorLogin.AccessToken)
	patchTimeline(t, ts.URL, supervisorAuth, taskID)
	budgetView := getJSON(t, ts.URL+"/api/v1/projects/"+projectID+"/budget", supervisorAuth)
	if budgetView["summary_only"].(bool) {
		t.Fatal("supervisor budget view should not be summary_only")
	}

	helperLogin := login(t, ts.URL, helper.Email, "demo123")
	helperAuth := bearer(helperLogin.AccessToken)
	assigned := getJSONArray(t, ts.URL+"/api/v1/tasks/assigned", helperAuth)
	if len(assigned) == 0 {
		t.Fatal("expected assigned tasks for helper")
	}
	uploadURL, uploadSessionID := requestUploadURL(t, ts.URL, helperAuth, taskID)
	putImage(t, uploadURL)
	evidenceID := confirmUpload(t, ts.URL, helperAuth, uploadSessionID)

	resp := postJSON(t, ts.URL+"/api/v1/evidences/"+evidenceID+"/approve", helperAuth, map[string]any{"comment": "should fail", "visible_to_client": true})
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected helper approve to be forbidden, got %d", resp.StatusCode)
	}
	resp.Body.Close()

	approveEvidence(t, ts.URL, supervisorAuth, evidenceID)

	clientLogin := login(t, ts.URL, client.Email, "demo123")
	clientAuth := bearer(clientLogin.AccessToken)
	galleryBeforeAudit := getJSONArray(t, ts.URL+"/api/v1/client/projects/"+projectID+"/gallery", clientAuth)
	if len(galleryBeforeAudit) != 1 {
		t.Fatalf("expected 1 gallery evidence immediately after approval, got %d", len(galleryBeforeAudit))
	}

	waitForEvidenceApproved(t, ts.URL, supervisorAuth, taskID, evidenceID)

	summary := getJSON(t, ts.URL+"/api/v1/client/projects/"+projectID+"/summary", clientAuth)
	if int(summary["budget_spent_percent"].(float64)) == 0 {
		t.Fatal("expected client summary to include budget percent")
	}
	gallery := getJSONArray(t, ts.URL+"/api/v1/client/projects/"+projectID+"/gallery", clientAuth)
	if len(gallery) != 1 {
		t.Fatalf("expected 1 gallery evidence, got %d", len(gallery))
	}
	fileResp := getRaw(t, ts.URL+"/api/v1/files/"+evidenceID, clientAuth)
	if fileResp.StatusCode != http.StatusOK {
		t.Fatalf("expected evidence file to be accessible to client, got %d", fileResp.StatusCode)
	}
	fileBytes, _ := io.ReadAll(fileResp.Body)
	fileResp.Body.Close()
	if len(fileBytes) == 0 {
		t.Fatal("expected uploaded file bytes")
	}

	csvResp := getRaw(t, ts.URL+"/api/v1/projects/"+projectID+"/export.csv", ownerAuth)
	csvBytes, _ := io.ReadAll(csvResp.Body)
	csvResp.Body.Close()
	if !bytes.Contains(csvBytes, []byte("Entrega de Lobby")) {
		t.Fatal("expected csv export to contain deliverable title")
	}

	admin := login(t, ts.URL, "admin@projectpulse.local", "demo123")
	adminAuth := bearer(admin.AccessToken)
	tenants := getJSONArray(t, ts.URL+"/api/v1/admin/tenants", adminAuth)
	if len(tenants) < 2 {
		t.Fatalf("expected at least 2 tenants after registration, got %d", len(tenants))
	}
	rbac := getJSONArray(t, ts.URL+"/api/v1/admin/rbac", adminAuth)
	if len(rbac) == 0 {
		t.Fatal("expected rbac matrix")
	}
	resp = postJSON(t, ts.URL+"/api/v1/projects", adminAuth, map[string]any{"name": "forbidden project"})
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected admin project creation to be forbidden, got %d", resp.StatusCode)
	}
	resp.Body.Close()

	// ── PATCH /api/v1/projects/{id} ──────────────────────────────────────────
	updated := patchJSONObj(t, ts.URL+"/api/v1/projects/"+projectID, ownerAuth, map[string]any{
		"name":               "Residencial Vista Norte (updated)",
		"description":        "Proyecto e2e actualizado",
		"status":             "active",
		"start_date":         "2026-04-01",
		"planned_end_date":   "2026-07-01",
		"supervisor_user_id": supervisor.ID,
		"client_user_id":     client.ID,
		"latitude_center":    19.4326,
		"longitude_center":   -99.1332,
		"geofence_radius_m":  200,
	})
	if updated["name"].(string) != "Residencial Vista Norte (updated)" {
		t.Fatalf("expected updated project name, got %s", updated["name"])
	}
	// client cannot update project
	resp = patchJSON(t, ts.URL+"/api/v1/projects/"+projectID, clientAuth, map[string]any{"name": "hacked"})
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected client project update to be forbidden, got %d", resp.StatusCode)
	}
	resp.Body.Close()

	// ── Budget adjustments ───────────────────────────────────────────────────
	adjResp := postJSONObj(t, ts.URL+"/api/v1/projects/"+projectID+"/budget-adjustments", ownerAuth, map[string]any{
		"amount_cents": 5000000,
		"reason":       "Material extra aprobado",
		"date":         "2026-04-15",
	})
	if adjResp["id"] == nil {
		t.Fatal("expected budget adjustment to be created with an id")
	}
	adjs := getJSONArray(t, ts.URL+"/api/v1/projects/"+projectID+"/budget-adjustments", ownerAuth)
	if len(adjs) == 0 {
		t.Fatal("expected at least 1 budget adjustment")
	}
	// helper cannot create budget adjustment
	resp = postJSON(t, ts.URL+"/api/v1/projects/"+projectID+"/budget-adjustments", helperAuth, map[string]any{
		"amount_cents": 1000, "reason": "unauthorized",
	})
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected helper budget adjustment to be forbidden, got %d", resp.StatusCode)
	}
	resp.Body.Close()

	// ── Permission boundaries ────────────────────────────────────────────────
	// client cannot create tasks
	resp = postJSON(t, ts.URL+"/api/v1/projects/"+projectID+"/tasks", clientAuth, map[string]any{
		"task":        map[string]any{"title": "forbidden task"},
		"deliverable": map[string]any{"title": "d"},
	})
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected client task creation to be forbidden, got %d", resp.StatusCode)
	}
	resp.Body.Close()

	// Evidence visibility: client cannot see non-visible evidence via project endpoint
	allEvidences := getJSONArray(t, ts.URL+"/api/v1/projects/"+projectID+"/evidence", clientAuth)
	for _, raw := range allEvidences {
		ev := raw.(map[string]any)
		if ev["is_visible_to_client"] == false || ev["status"].(string) != "approved" {
			t.Fatal("client received evidence that is not approved+visible")
		}
	}
}

type loginResponse struct {
	AccessToken string   `json:"access_token"`
	User        app.User `json:"user"`
}

func registerOwner(t *testing.T, baseURL, ownerEmail string) loginResponse {
	t.Helper()
	payload := map[string]any{
		"company_name": "ProjectPulse QA Builders",
		"company_slug": fmt.Sprintf("projectpulse-qa-%d", time.Now().UnixNano()),
		"owner_name":   "Olivia QA",
		"owner_email":  ownerEmail,
		"password":     "demo123",
	}
	resp := postJSON(t, baseURL+"/api/v1/auth/register", "", payload)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("register failed: %d %s", resp.StatusCode, string(body))
	}
	var out loginResponse
	decodeBody(t, resp.Body, &out)
	return out
}

func login(t *testing.T, baseURL, email, password string) loginResponse {
	t.Helper()
	resp := postJSON(t, baseURL+"/api/v1/auth/login", "", map[string]any{"email": email, "password": password})
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("login failed for %s: %d %s", email, resp.StatusCode, string(body))
	}
	var out loginResponse
	decodeBody(t, resp.Body, &out)
	return out
}

func createUser(t *testing.T, baseURL, auth, fullName, email, password, role string) app.User {
	t.Helper()
	resp := postJSON(t, baseURL+"/api/v1/users", auth, map[string]any{"full_name": fullName, "email": email, "password": password, "role": role})
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("create user failed: %d %s", resp.StatusCode, string(body))
	}
	var user app.User
	decodeBody(t, resp.Body, &user)
	return user
}

func createProject(t *testing.T, baseURL, auth, supervisorID, clientID string) map[string]any {
	t.Helper()
	resp := postJSON(t, baseURL+"/api/v1/projects", auth, map[string]any{
		"name":               "Residencial Vista Norte",
		"description":        "Proyecto e2e",
		"supervisor_user_id": supervisorID,
		"client_user_id":     clientID,
		"budget_total_cents": 120000000,
		"spent_total_cents":  30000000,
		"start_date":         "2026-04-01",
		"planned_end_date":   "2026-06-15",
		"latitude_center":    19.4326,
		"longitude_center":   -99.1332,
		"geofence_radius_m":  150,
	})
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("create project failed: %d %s", resp.StatusCode, string(body))
	}
	var out map[string]any
	decodeBody(t, resp.Body, &out)
	return out
}

func updateBudget(t *testing.T, baseURL, auth, projectID string, budget, spent int64) {
	t.Helper()
	resp := patchJSON(t, baseURL+"/api/v1/projects/"+projectID+"/budget", auth, map[string]any{"budget_total_cents": budget, "spent_total_cents": spent})
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("update budget failed: %d %s", resp.StatusCode, string(body))
	}
}

func createTask(t *testing.T, baseURL, auth, projectID, helperID string) string {
	t.Helper()
	resp := postJSON(t, baseURL+"/api/v1/projects/"+projectID+"/tasks", auth, map[string]any{
		"task": map[string]any{
			"title":                   "Instalacion de Lobby",
			"description":             "Acabado principal",
			"assigned_to_user_id":     helperID,
			"status":                  "pending",
			"start_date":              "2026-04-02",
			"end_date":                "2026-04-18",
			"expected_finish_quality": "Marmol Carrara uniforme",
			"technical_spec_text":     "Junta 2mm, sin desportilladuras",
			"budget_cents":            35000000,
			"spent_cents":             11000000,
			"progress_percent":        10,
		},
		"deliverable": map[string]any{
			"title":          "Entrega de Lobby",
			"description":    "Zona de recepcion terminada",
			"due_date":       "2026-04-18",
			"status":         "pending",
			"client_visible": true,
		},
	})
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("create task failed: %d %s", resp.StatusCode, string(body))
	}
	var out map[string]map[string]any
	decodeBody(t, resp.Body, &out)
	return out["task"]["id"].(string)
}

func patchTimeline(t *testing.T, baseURL, auth, taskID string) {
	t.Helper()
	resp := patchJSON(t, baseURL+"/api/v1/tasks/"+taskID+"/timeline", auth, map[string]any{"start_date": "2026-04-03", "end_date": "2026-04-20", "status": "in_progress", "progress_percent": 65})
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("patch timeline failed: %d %s", resp.StatusCode, string(body))
	}
}

func requestUploadURL(t *testing.T, baseURL, auth, taskID string) (string, string) {
	t.Helper()
	resp := postJSON(t, baseURL+"/api/v1/tasks/"+taskID+"/evidence/upload-url", auth, map[string]any{
		"file_name":       "avance-lobby.png",
		"content_type":    "image/png",
		"file_size_bytes": 220,
		"latitude":        19.43261,
		"longitude":       -99.13319,
	})
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("request upload url failed: %d %s", resp.StatusCode, string(body))
	}
	var out map[string]any
	decodeBody(t, resp.Body, &out)
	return out["upload_url"].(string), out["id"].(string)
}

func putImage(t *testing.T, uploadURL string) {
	t.Helper()
	img := bytes.Repeat([]byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A}, 40)
	req, err := http.NewRequest(http.MethodPut, uploadURL, bytes.NewReader(img))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "image/png")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("signed upload failed: %d %s", resp.StatusCode, string(body))
	}
}

func confirmUpload(t *testing.T, baseURL, auth, uploadSessionID string) string {
	t.Helper()
	resp := postJSON(t, baseURL+"/api/v1/evidence/confirm-upload", auth, map[string]any{"upload_session_id": uploadSessionID, "metadata_exif": `{"device":"test"}`})
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("confirm upload failed: %d %s", resp.StatusCode, string(body))
	}
	var out map[string]any
	decodeBody(t, resp.Body, &out)
	return out["id"].(string)
}

func approveEvidence(t *testing.T, baseURL, auth, evidenceID string) {
	t.Helper()
	resp := postJSON(t, baseURL+"/api/v1/evidences/"+evidenceID+"/approve", auth, map[string]any{"comment": "Aprobada para cliente", "visible_to_client": true})
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("approve evidence failed: %d %s", resp.StatusCode, string(body))
	}
}

func waitForEvidenceApproved(t *testing.T, baseURL, auth, taskID, evidenceID string) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		evidences := getJSONArray(t, baseURL+"/api/v1/tasks/"+taskID+"/evidences", auth)
		for _, raw := range evidences {
			evidence := raw.(map[string]any)
			if evidence["id"].(string) == evidenceID && evidence["status"].(string) == "approved" && int(evidence["quality_score"].(float64)) > 0 {
				return
			}
		}
		time.Sleep(150 * time.Millisecond)
	}
	t.Fatal("evidence did not reach approved state")
}

func postJSON(t *testing.T, url, auth string, payload any) *http.Response {
	t.Helper()
	body, _ := json.Marshal(payload)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	if auth != "" {
		req.Header.Set("Authorization", auth)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return resp
}

func patchJSONObj(t *testing.T, url, auth string, payload any) map[string]any {
	t.Helper()
	resp := patchJSON(t, url, auth, payload)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("patch json obj failed: %d %s", resp.StatusCode, string(body))
	}
	var out map[string]any
	decodeBody(t, resp.Body, &out)
	return out
}

func postJSONObj(t *testing.T, url, auth string, payload any) map[string]any {
	t.Helper()
	resp := postJSON(t, url, auth, payload)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("post json obj failed: %d %s", resp.StatusCode, string(body))
	}
	var out map[string]any
	decodeBody(t, resp.Body, &out)
	return out
}

func patchJSON(t *testing.T, url, auth string, payload any) *http.Response {
	t.Helper()
	body, _ := json.Marshal(payload)
	req, err := http.NewRequest(http.MethodPatch, url, bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	if auth != "" {
		req.Header.Set("Authorization", auth)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return resp
}

func getJSON(t *testing.T, url, auth string) map[string]any {
	t.Helper()
	resp := getRaw(t, url, auth)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("get json failed: %d %s", resp.StatusCode, string(body))
	}
	var out map[string]any
	decodeBody(t, resp.Body, &out)
	return out
}

func getJSONArray(t *testing.T, url, auth string) []any {
	t.Helper()
	resp := getRaw(t, url, auth)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("get json array failed: %d %s", resp.StatusCode, string(body))
	}
	var out []any
	decodeBody(t, resp.Body, &out)
	return out
}

func getRaw(t *testing.T, url, auth string) *http.Response {
	t.Helper()
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	if auth != "" {
		req.Header.Set("Authorization", auth)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return resp
}

func decodeBody(t *testing.T, r io.Reader, dst any) {
	t.Helper()
	if err := json.NewDecoder(r).Decode(dst); err != nil {
		t.Fatal(err)
	}
}

func bearer(token string) string {
	return "Bearer " + strings.TrimSpace(token)
}

func TestMain(m *testing.M) {
	os.Exit(m.Run())
}
