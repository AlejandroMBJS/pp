"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "./ui/confirm-dialog";
import { Sidebar } from "./sidebar";
import { TopBar } from "./topbar";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { PublicWorkspace } from "./public-workspace";
import { OwnerCanvas } from "./owner-canvas";
import { SupervisorCanvas } from "./supervisor-canvas";
import { HelperCanvas } from "./helper-canvas";
import { ClientCanvas } from "./client-canvas";
import { AdminCanvas } from "./admin-canvas";
import { RightInspector } from "./right-inspector";
import { SettingsGeneralModal } from "./settings-general-modal";
import { SettingsProjectModal } from "./settings-project-modal";
import { TaskApprovalModal } from "./task-approval-modal";
import { PhotoUploadModal } from "./photo-upload-modal";
import { TaskEditModal } from "./task-edit-modal";
import { FinancialControl } from "./financial-control";
import { DailyJournal } from "./daily-journal";
import { MessagingHub } from "./messaging-hub";
import { PlanViewer } from "./plan-viewer";
import { CapturesCanvas } from "./captures-canvas";
import { AuthTokenProvider } from "./auth-context";
import { BillingProvider } from "./billing-context";
import { TrialBanner } from "./trial-banner";
import { UpgradeModal } from "./upgrade-modal";

import { FabActions, FolderPlus, ListPlus, UserPlus } from "./fab-actions";
import { NewProjectModal } from "./new-project-modal";
import { InviteUserModal } from "./invite-user-modal";
// ── Types ──────────────────────────────────────────────────────────────────

type DemoPayload = {
  product: string;
  message: string;
  demo_accounts: Array<{ role: string; email: string; password: string }>;
  suggested_flow: string[];
};

type User = { id: string; tenant_id: string; email: string; full_name: string; role: string; is_active?: boolean; email_verified?: boolean };
type LoginResponse = { access_token: string; user: User };
type UserInviteResponse = { user: User; invite_url: string; invite_expires_at: string };

type Project = {
  id: string;
  name: string;
  description: string;
  status: string;
  client_user_id: string;
  supervisor_user_id: string;
  budget_total_cents: number;
  spent_total_cents: number;
  start_date: string;
  planned_end_date: string;
  latitude_center: number;
  longitude_center: number;
  geofence_radius_m: number;
  logo_url?: string;
};

type TenantInfo = {
  id: string;
  name: string;
  slug: string;
  logo_url: string;
  primary_color?: string;
  secondary_color?: string;
};

type Task = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  assigned_to_user_id: string;
  status: string;
  start_date: string;
  end_date: string;
  budget_cents: number;
  spent_cents: number;
  progress_percent: number;
  predecessor_task_id?: string;
  comparison_photo_url?: string;
};

type Deliverable = {
  id: string;
  task_id: string;
  title: string;
  due_date: string;
  status: string;
  client_visible: boolean;
};

type Evidence = {
  id: string;
  task_id: string;
  file_name: string;
  status: string;
  quality_score: number;
  is_visible_to_client: boolean;
  ai_processing_status: string;
  url_archivo: string;
  created_at?: string;
};

type Dashboard = {
  product_name: string;
  portfolio: {
    active_projects: number;
    open_alerts: number;
    health_score: number;
    budget_variance: string;
  };
  projects: Array<{
    id: string;
    name: string;
    status: string;
    timeline_progress: number;
    budget_consumed: number;
    quality_score: number;
    deliverables_due: number;
  }>;
};

type ClientSummary = {
  project_name: string;
  timeline_progress: number;
  budget_spent_percent: number;
  deliverables: Deliverable[];
  gallery: Evidence[];
};

type Blueprint = {
  id: string;
  file_name: string;
  file_type: string;
  file_size_bytes: number;
  url_archivo: string;
  status: string;
  scale: string;
  version: number;
  created_at: string;
};

type RBACRule = { resource: string; role: string; effect: string };

type AuthFormState = {
  company_name: string;
  company_slug: string;
  owner_name: string;
  owner_email: string;
  password: string;
  email: string;
};

type InviteSetupFormState = {
  password: string;
  confirmPassword: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────

const storageKey = "projectpulse-session";
const legacyStorageKey = "arquicheck-session";

function defaultViewForRole(role: string) {
  switch (role) {
    case "owner":      return "overview";
    case "supervisor": return "review";
    case "helper":     return "capture";
    case "client":     return "summary";
    default:           return "platform";
  }
}

function money(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format((value || 0) / 100);
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Operation failed";
}

function browserSafeURL(rawUrl: string) {
  if (typeof window === "undefined" || !rawUrl) return rawUrl;
  try {
    const current = new URL(window.location.origin);
    const candidate = new URL(rawUrl, current.origin);
    const internalPath =
      candidate.pathname.startsWith("/uploads/") || candidate.pathname.startsWith("/api/");
    const localHost = ["localhost", "127.0.0.1", "0.0.0.0", "backend", "frontend", "gateway"].includes(
      candidate.hostname
    );
    if ((internalPath || localHost) && candidate.origin !== current.origin) {
      return `${current.origin}${candidate.pathname}${candidate.search}`;
    }
    return candidate.toString();
  } catch {
    return rawUrl;
  }
}

// Mirror of backend whitelists in backend/internal/app/validation.go.
// Keep in sync — rejecting here saves a round-trip on obvious misuse, but
// the backend remains the source of truth.
const EVIDENCE_MIME_WHITELIST = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif",
  "image/tiff", "image/gif", "application/pdf", "video/mp4", "video/quicktime",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const BLUEPRINT_MIME_WHITELIST = new Set([
  "application/pdf", "image/png", "image/jpeg", "image/tiff",
  "image/vnd.dxf", "image/vnd.dwg",
  "application/acad", "application/x-dwg", "application/dxf",
  "application/octet-stream",
  "application/vnd.ms-pki.stl", "model/stl",
  "application/vnd.ms-3mf", "model/3mf",
  "model/gltf-binary", "model/gltf+json",
]);

function validateEvidenceFile(file: File): string | null {
  // Empty file.type can happen on older browsers or iOS .heic drag-drop.
  // Let the backend be the source of truth in that case — rejecting here
  // would block legitimate uploads.
  const ct = (file.type || "").toLowerCase();
  if (!ct) return null;
  if (!EVIDENCE_MIME_WHITELIST.has(ct)) return `Unsupported file type: ${ct}`;
  return null;
}

const BLUEPRINT_EXT_WHITELIST = new Set([
  "pdf", "png", "jpg", "jpeg", "tif", "tiff",
  "dxf", "dwg", "stl", "3mf", "obj", "glb", "gltf",
]);

function validateBlueprintFile(file: File): string | null {
  const ct = (file.type || "application/octet-stream").toLowerCase();
  if (BLUEPRINT_MIME_WHITELIST.has(ct)) return null;
  // Browsers disagree on MIME for CAD/3D formats — fall back to the file
  // extension so legit .stl/.3mf/.dwg uploads aren't blocked client-side.
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (BLUEPRINT_EXT_WHITELIST.has(ext)) return null;
  return `Unsupported blueprint type: ${ct}`;
}

async function api<T = unknown>(
  path: string,
  options: { method?: string; token?: string; body?: unknown; signal?: AbortSignal } = {}
): Promise<T> {
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });
  if (response.status === 401) {
    // Token expired — clear session
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(storageKey);
      window.localStorage.removeItem(storageKey);
      window.localStorage.removeItem(legacyStorageKey);
      window.location.reload();
    }
    throw new Error("Session expired. Please sign in again.");
  }
  if (response.status === 402) {
    // Payment required — feature locked, quota exceeded, or trial ended.
    const payload = await response.json().catch(() => ({ error: "payment required", type: "feature_locked" }));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("billing:paywall", { detail: payload }));
    }
    throw new Error(payload.error ?? "payment required");
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(payload.error ?? `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

// ── Component ──────────────────────────────────────────────────────────────

export function ControlCenter() {
  const emptyNewUser = {
    full_name: "",
    email: "",
    role: "supervisor",
  };

  // Auth & session
  const [session, setSession] = useState<LoginResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmTaskDeleteId, setConfirmTaskDeleteId] = useState<string | null>(null);
  const [confirmBlueprintDeleteId, setConfirmBlueprintDeleteId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [authForm, setAuthForm] = useState<AuthFormState>({
    company_name: "",
    company_slug: "",
    owner_name: "",
    owner_email: "",
    password: "",
    email: "",
  });

  // Public data
  const [demo, setDemo] = useState<DemoPayload | null>(null);
  const [publicDashboard, setPublicDashboard] = useState<Dashboard | null>(null);

  // Authenticated data
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [evidences, setEvidences] = useState<Evidence[]>([]);
  const [allEvidences, setAllEvidences] = useState<Map<string, Evidence[]>>(new Map());
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [clientSummary, setClientSummary] = useState<ClientSummary | null>(null);
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [tenants, setTenants] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [rbac, setRbac] = useState<RBACRule[]>([]);
  const [currentTenant, setCurrentTenant] = useState<TenantInfo | null>(null);

  // UI state
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [activeView, setActiveView] = useState("overview");
  const [highlightedDeliverableId, setHighlightedDeliverableId] = useState<string | null>(null);
  const [clientGalleryTaskId, setClientGalleryTaskId] = useState<string | null>(null);
  const [lastUserInvite, setLastUserInvite] = useState<UserInviteResponse | null>(null);
  const [inviteToken, setInviteToken] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [inviteSetupForm, setInviteSetupForm] = useState<InviteSetupFormState>({
    password: "",
    confirmPassword: "",
  });

  // Modal state
  const [settingsGeneralOpen, setSettingsGeneralOpen] = useState(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [newProjectModalOpen, setNewProjectModalOpen] = useState(false);
  const [inviteUserModalOpen, setInviteUserModalOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<{ type?: string; error?: string } | null>(null);

  // Listen for billing:paywall events dispatched by api() on HTTP 402 responses.
  useEffect(() => {
    function onPaywall(e: Event) {
      const detail = (e as CustomEvent).detail;
      setUpgradeReason(detail ?? null);
      setUpgradeModalOpen(true);
    }
    window.addEventListener("billing:paywall", onPaywall);
    return () => window.removeEventListener("billing:paywall", onPaywall);
  }, []);
  const [settingsProjectOpen, setSettingsProjectOpen] = useState(false);
  const [taskApprovalOpen, setTaskApprovalOpen] = useState(false);
  const [taskApprovalIndex, setTaskApprovalIndex] = useState(0);
  const [photoUploadOpen, setPhotoUploadOpen] = useState(false);
  const [taskEditOpen, setTaskEditOpen] = useState(false);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleOpenTaskEdit = (taskId: string) => {
    setSelectedTaskId(taskId);
    setTaskEditOpen(true);
  };

  // Forms
  const [newUser, setNewUser] = useState({
    ...emptyNewUser,
  });
  const [newProject, setNewProject] = useState({
    name: "",
    description: "",
    supervisor_user_id: "",
    client_user_id: "",
    budget_total_cents: 0,
    spent_total_cents: 0,
    start_date: "2026-04-01",
    planned_end_date: "2026-05-30",
    latitude_center: 19.4326,
    longitude_center: -99.1332,
    geofence_radius_m: 120,
  });
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    assigned_to_user_id: "",
    status: "pending",
    start_date: "2026-04-02",
    end_date: "2026-04-10",
    expected_finish_quality: "",
    technical_spec_text: "",
    budget_cents: 0,
    spent_cents: 0,
    progress_percent: 0,
    deliverable_title: "",
    deliverable_due_date: "2026-04-10",
    requires_comparison: false,
    comparison_file: null as File | null,
  });
  const [timelineForm, setTimelineForm] = useState({
    start_date: "",
    end_date: "",
    status: "in_progress",
    progress_percent: 50,
    predecessor_task_id: "",
  });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadMessage, setUploadMessage] = useState("");

  // ── Computed ──────────────────────────────────────────────────────────────

  // Supervisors the owner can assign to a project. A solo owner should be able
  // to assign themselves, so we include the current user (if they're owner)
  // as the first option with a clear "(you)" label.
  const supervisors = useMemo(() => {
    const actual = users.filter((u) => u.role === "supervisor");
    if (session?.user.role === "owner") {
      const me = users.find((u) => u.id === session.user.id);
      if (me) {
        const meAsSupervisor = { ...me, full_name: `${me.full_name || me.email} (you)` };
        // De-dupe in case the owner has also been given the supervisor role.
        return [meAsSupervisor, ...actual.filter((u) => u.id !== me.id)];
      }
    }
    return actual;
  }, [users, session?.user.role, session?.user.id]);
  const helpers = useMemo(() => users.filter((u) => u.role === "helper"), [users]);
  const clients = useMemo(() => users.filter((u) => u.role === "client"), [users]);
  const currentProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );
  const currentTask = useMemo(
    () => tasks.find((t) => t.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId]
  );
  const pendingEvidenceCount = useMemo(
    () => evidences.filter((e) => e.status === "pending_approval").length,
    [evidences]
  );
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);

  // ── Effects ───────────────────────────────────────────────────────────────

  // Poll unread notification count every 60s while logged in.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    async function poll() {
      try {
        const data = await api<Array<{ read_at?: string | null }>>("/api/v1/notifications?unread=true", {
          token: session!.access_token,
        });
        if (!cancelled) setUnreadNotifCount(data.length);
      } catch {
        // silent — bell just won't update
      }
    }
    void poll();
    const id = window.setInterval(poll, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [session]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inviteParam = params.get("invite") ?? "";
    const resetParam = params.get("reset") ?? "";
    setInviteToken(inviteParam);
    setResetToken(resetParam);
    // If the URL carries an invite or reset token, skip restoring any stale
    // session — the user must complete the flow before landing on the dashboard.
    const impRaw = window.sessionStorage.getItem(storageKey);
    const raw = inviteParam || resetParam
      ? null
      : impRaw
        ?? window.localStorage.getItem(storageKey)
        ?? window.localStorage.getItem(legacyStorageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        // Check JWT expiry before restoring session
        const payload = JSON.parse(atob(parsed.access_token.split(".")[1]));
        if (payload.exp && payload.exp * 1000 < Date.now()) {
          window.sessionStorage.removeItem(storageKey);
          window.localStorage.removeItem(storageKey);
          window.localStorage.removeItem(legacyStorageKey);
          toast.info("Tu sesión ha expirado. Por favor inicia sesión nuevamente.");
        } else {
          setSession(parsed);
          if (!impRaw) {
            // Normal session → normalize into localStorage and clear legacy key.
            window.localStorage.setItem(storageKey, raw);
            window.localStorage.removeItem(legacyStorageKey);
          }
        }
      } catch {
        // Corrupted session data — clear it
        window.sessionStorage.removeItem(storageKey);
        window.localStorage.removeItem(storageKey);
        window.localStorage.removeItem(legacyStorageKey);
      }
    }
    Promise.all([
      api<DemoPayload>("/api/v1/public/demo"),
      api<Dashboard>("/api/v1/public/dashboard"),
    ])
      .then(([d, dash]) => {
        setDemo(d);
        setPublicDashboard(dash);
      })
      .catch(() => toast.error("Unable to load the public demo."));
  }, []);

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (!session) {
      setUsers([]);
      setProjects([]);
      setTasks([]);
      setDeliverables([]);
      setEvidences([]);
      setAllEvidences(new Map());
      setDashboard(null);
      setClientSummary(null);
      setTenants([]);
      setRbac([]);
      return;
    }
    setActiveView(defaultViewForRole(session.user.role));
    refreshRoleData(session).catch((err) => {
      toast.error(messageOf(err));
    });
  }, [session]);

  useEffect(() => {
    if (!session || !selectedProjectId || session.user.role === "helper") return;
    // Clear accumulated evidence pins when switching projects
    setAllEvidences(new Map());
    loadProjectContext(selectedProjectId).catch((err) => {
      toast.error(messageOf(err));
    });
  }, [session, selectedProjectId]);

  useEffect(() => {
    if (activeView !== "gallery") {
      setClientGalleryTaskId(null);
    }
  }, [activeView]);

  // Single source of truth for "should the evidence list be project-scoped or
  // task-scoped right now". Used by the load effect, the poll loop and the
  // post-decision refresh so they never disagree.
  function evidenceScope(): "project" | "task" | null {
    if (!session) return null;
    const role = session.user.role;
    if (["owner", "supervisor"].includes(role) &&
        ["review", "timeline", "ownergallery", "gallery"].includes(activeView)) {
      return selectedProjectId ? "project" : null;
    }
    if (["owner", "supervisor", "helper"].includes(role) && selectedTaskId) {
      return "task";
    }
    return null;
  }

  function applyProjectEvidences(data: Evidence[]) {
    setEvidences(data);
    setAllEvidences(() => {
      const next = new Map<string, Evidence[]>();
      for (const e of data) {
        const list = next.get(e.task_id) ?? [];
        list.push(e);
        next.set(e.task_id, list);
      }
      return next;
    });
  }

  function applyTaskEvidences(taskID: string, data: Evidence[]) {
    setEvidences(data);
    setAllEvidences((prev) => {
      const next = new Map(prev);
      next.set(taskID, data);
      return next;
    });
  }

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    const { signal } = controller;
    const scope = evidenceScope();
    if (scope === null) return;

    if (scope === "project") {
      api<Evidence[]>(`/api/v1/projects/${selectedProjectId}/evidences`, {
        token: session.access_token,
        signal,
      })
        .then((data) => { if (!signal.aborted) applyProjectEvidences(data); })
        .catch(() => { if (!signal.aborted) toast.error("No se pudieron cargar las evidencias del proyecto."); });
      return () => controller.abort();
    }

    // scope === "task"
    api<Evidence[]>(`/api/v1/tasks/${selectedTaskId}/evidences`, {
      token: session.access_token,
      signal,
    })
      .then((data) => { if (!signal.aborted) applyTaskEvidences(selectedTaskId, data); })
      .catch(() => { if (!signal.aborted) toast.error("No se pudieron cargar las evidencias de la tarea."); });

    return () => controller.abort();
  }, [session, selectedTaskId, selectedProjectId, activeView]);

  // ── Data fetchers ─────────────────────────────────────────────────────────

  async function refreshRoleData(activeSession: LoginResponse) {
    const token = activeSession.access_token;
    const role = activeSession.user.role;

    // Fetch tenant branding for all authenticated roles
    api<TenantInfo>("/api/v1/tenants/current", { token })
      .then(setCurrentTenant)
      .catch((err) => console.error("tenant branding fetch failed", err));

    if (role === "owner") {
      const [dashboardData, userData, projectData] = await Promise.all([
        api<Dashboard>("/api/v1/dashboard/owner/overview", { token }),
        api<User[]>("/api/v1/users", { token }),
        api<Project[]>("/api/v1/projects", { token }),
      ]);
      setDashboard(dashboardData);
      setUsers(userData);
      setProjects(projectData);
      if (projectData[0]) setSelectedProjectId(projectData[0].id);
      return;
    }

    if (role === "supervisor") {
      const [projectData, userData] = await Promise.all([
        api<Project[]>("/api/v1/projects", { token }),
        api<User[]>("/api/v1/users", { token }).catch(() => { toast.error("No se pudieron cargar los usuarios."); return []; }),
      ]);
      setUsers(userData);
      setProjects(projectData);
      if (projectData[0]) setSelectedProjectId(projectData[0].id);
      return;
    }

    if (role === "helper") {
      const assigned = await api<Task[]>("/api/v1/tasks/assigned", { token });
      setTasks(assigned);
      if (assigned[0]) setSelectedTaskId(assigned[0].id);
      return;
    }

    if (role === "client") {
      const projectData = await api<Project[]>("/api/v1/projects", { token });
      setProjects(projectData);
      if (projectData[0]) {
        setSelectedProjectId(projectData[0].id);
        const summary = await api<ClientSummary>(
          `/api/v1/client/projects/${projectData[0].id}/summary`,
          { token }
        );
        setClientSummary(summary);
      }
      return;
    }

    if (role === "admin") {
      const [tenantData, rbacData] = await Promise.all([
        api<Array<{ id: string; name: string; slug: string }>>("/api/v1/admin/tenants", { token }),
        api<RBACRule[]>("/api/v1/admin/rbac", { token }),
      ]);
      setTenants(tenantData);
      setRbac(rbacData);
    }
  }

  async function loadProjectContext(projectID: string) {
    if (!session) return;
    const token = session.access_token;
    const [taskData, deliverableData] = await Promise.all([
      api<Task[]>(`/api/v1/projects/${projectID}/tasks`, { token }),
      api<Deliverable[]>(`/api/v1/projects/${projectID}/deliverables`, { token }),
    ]);
    setTasks(taskData);
    setDeliverables(deliverableData);
    if (taskData[0]) {
      setSelectedTaskId(taskData[0].id);
      setTimelineForm({
        start_date: taskData[0].start_date,
        end_date: taskData[0].end_date,
        status: taskData[0].status,
        progress_percent: taskData[0].progress_percent,
        predecessor_task_id: taskData[0].predecessor_task_id || "",
      });
    }
    if (["client", "owner", "supervisor"].includes(session.user.role)) {
      const summary = await api<ClientSummary>(
        `/api/v1/client/projects/${projectID}/summary`,
        { token }
      );
      setClientSummary(summary);
    }
    // Always load blueprints for the project if not helper
    if (session.user.role !== "helper") {
      api<Blueprint[]>(`/api/v1/projects/${projectID}/blueprints`, { token })
        .then(setBlueprints)
        .catch(() => { toast.error("No se pudieron cargar los planos del proyecto."); setBlueprints([]); });
    }
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  function clearInviteSetupState() {
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", window.location.pathname);
    }
    setInviteToken("");
    setInviteSetupForm({ password: "", confirmPassword: "" });
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { company_name, company_slug, owner_name, owner_email, password } = authForm;
    if (!company_name.trim() || !company_slug.trim() || !owner_name.trim() || !owner_email.trim() || !password.trim()) {
      toast.error("Todos los campos son requeridos.");
      return;
    }
    setLoading(true);
    try {
      const result = await api<LoginResponse>("/api/v1/auth/register", {
        method: "POST",
        body: authForm,
      });
      window.localStorage.setItem(storageKey, JSON.stringify(result));
      setSession(result);
      toast.success(`Welcome, ${result.user.full_name}!`);
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authForm.email.trim() || !authForm.password.trim()) {
      toast.error("Email y contraseña son requeridos.");
      return;
    }
    setLoading(true);
    try {
      const result = await api<LoginResponse>("/api/v1/auth/login", {
        method: "POST",
        body: { email: authForm.email, password: authForm.password },
      });
      window.localStorage.setItem(storageKey, JSON.stringify(result));
      setSession(result);
      toast.success(`Signed in as ${result.user.role}.`);
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    const payload = {
      full_name: newUser.full_name.trim(),
      email: newUser.email.trim(),
      role: newUser.role,
    };
    if (!payload.full_name || !payload.email || !payload.role) {
      toast.error("Nombre, email y rol son requeridos.");
      return;
    }
    setLoading(true);
    try {
      const invite = await api<UserInviteResponse>("/api/v1/users/invite", {
        method: "POST",
        token: session.access_token,
        body: payload,
      });
      setLastUserInvite(invite);
      setNewUser(emptyNewUser);
      await refreshRoleData(session);
      toast.success("Invitation created successfully.");
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSetupAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!inviteToken) {
      toast.error("Invitation token is missing.");
      return;
    }
    if (!inviteSetupForm.password.trim() || !inviteSetupForm.confirmPassword.trim()) {
      toast.error("Password and confirmation are required.");
      return;
    }
    if (inviteSetupForm.password !== inviteSetupForm.confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const result = await api<LoginResponse>("/api/v1/auth/setup-account", {
        method: "POST",
        body: { token: inviteToken, password: inviteSetupForm.password },
      });
      clearInviteSetupState();
      window.localStorage.setItem(storageKey, JSON.stringify(result));
      setSession(result);
      toast.success(`Account ready. Welcome, ${result.user.full_name}!`);
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleCopyInviteLink() {
    if (!lastUserInvite?.invite_url) return;
    try {
      await navigator.clipboard.writeText(lastUserInvite.invite_url);
      toast.success("Invite link copied.");
    } catch {
      toast.error("Could not copy the invite link.");
    }
  }

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    setLoading(true);
    try {
      const project = await api<Project>("/api/v1/projects", {
        method: "POST",
        token: session.access_token,
        body: newProject,
      });
      setNewProject({ ...newProject, name: "", description: "" });
      await refreshRoleData(session);
      setSelectedProjectId(project.id);
      setActiveView("projects");
      toast.success(`Project "${project.name}" created.`);
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateProjectModal(data: any) {
    if (!session) return;
    setLoading(true);
    try {
      const project = await api<Project>("/api/v1/projects", {
        method: "POST",
        token: session.access_token,
        body: data,
      });
      await refreshRoleData(session);
      setSelectedProjectId(project.id);
      setActiveView("projects");
      setNewProjectModalOpen(false);
      toast.success(`Project "${project.name}" created.`);
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !selectedProjectId) return;
    if (!newTask.title.trim()) { toast.error("El título de la tarea es requerido."); return; }
    if (!newTask.deliverable_title.trim()) { toast.error("El título del entregable es requerido."); return; }
    if (!newTask.start_date || !newTask.end_date) { toast.error("Las fechas de inicio y fin son requeridas."); return; }
    if (newTask.start_date > newTask.end_date) { toast.error("La fecha de inicio debe ser anterior a la fecha de fin."); return; }
    setLoading(true);
    try {
      const created = await api<{ task: Task }>(`/api/v1/projects/${selectedProjectId}/tasks`, {
        method: "POST",
        token: session.access_token,
        body: {
          task: {
            title: newTask.title,
            description: newTask.description,
            assigned_to_user_id: newTask.assigned_to_user_id,
            status: newTask.status,
            start_date: newTask.start_date,
            end_date: newTask.end_date,
            expected_finish_quality: newTask.expected_finish_quality,
            technical_spec_text: newTask.technical_spec_text,
            budget_cents: Number(newTask.budget_cents),
            spent_cents: Number(newTask.spent_cents),
            progress_percent: Number(newTask.progress_percent),
          },
          deliverable: {
            title: newTask.deliverable_title,
            description: newTask.description,
            due_date: newTask.deliverable_due_date,
            status: "pending",
            client_visible: true,
          },
        },
      });
      // Upload comparison reference photo if checkbox enabled and file provided
      if (newTask.requires_comparison && newTask.comparison_file && created.task?.id) {
        const tId = toast.loading("Subiendo foto de referencia...");
        try {
          const photoUrl = await uploadComparisonPhoto(newTask.comparison_file, selectedProjectId);
          await api(`/api/v1/tasks/${created.task.id}`, {
            method: "PATCH",
            token: session.access_token,
            body: { comparison_photo_url: photoUrl },
          });
          toast.dismiss(tId);
          toast.success("Foto de referencia guardada — la IA comparará evidencias contra ella.");
        } catch (err) {
          toast.dismiss(tId);
          toast.error("Error subiendo foto de referencia: " + messageOf(err));
        }
      }
      setNewTask({
        title: "",
        description: "",
        assigned_to_user_id: helpers[0]?.id ?? "",
        status: "pending",
        start_date: "2026-04-02",
        end_date: "2026-04-10",
        expected_finish_quality: "",
        technical_spec_text: "",
        budget_cents: 0,
        spent_cents: 0,
        progress_percent: 0,
        deliverable_title: "",
        deliverable_due_date: "2026-04-10",
        requires_comparison: false,
        comparison_file: null,
      });
      await loadProjectContext(selectedProjectId);
      setActiveView("projects");
      toast.success("Task and deliverable created.");
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleTimelineUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !selectedTaskId) return;
    setLoading(true);
    try {
      await api(`/api/v1/tasks/${selectedTaskId}/timeline`, {
        method: "PATCH",
        token: session.access_token,
        body: timelineForm,
      });
      if (selectedProjectId) await loadProjectContext(selectedProjectId);
      toast.success("Timeline actualizado.");
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleHelperUpload(event: FormEvent<HTMLFormElement>, progressPercent?: number) {
    event.preventDefault();
    if (!session || !selectedTaskId || !uploadFile) return;
    const mimeError = validateEvidenceFile(uploadFile);
    if (mimeError) {
      toast.error(mimeError);
      return;
    }
    setLoading(true);
    setUploadMessage("");
    const toastId = toast.loading("Uploading evidence...");
    try {
      const uploadSession = await api<{ id: string; upload_url: string }>(
        `/api/v1/tasks/${selectedTaskId}/evidence/upload-url`,
        {
          method: "POST",
          token: session.access_token,
          body: {
            file_name: uploadFile.name,
            content_type: uploadFile.type || "image/png",
            file_size_bytes: uploadFile.size,
            latitude: 19.43261,
            longitude: -99.13319,
          },
        }
      );

      const uploadResponse = await fetch(browserSafeURL(uploadSession.upload_url), {
        method: "PUT",
        headers: { "Content-Type": uploadFile.type || "image/png" },
        body: uploadFile,
      });
      if (!uploadResponse.ok) throw new Error("Direct file upload failed.");

      await api(`/api/v1/evidence/confirm-upload`, {
        method: "POST",
        token: session.access_token,
        body: {
          upload_session_id: uploadSession.id,
          metadata_exif: JSON.stringify({ device: "browser-demo" }),
        },
      });

      // Helper-driven progress bump: only fires when the helper moved the slider
      // to a value different from the task's current progress. Best-effort; a
      // failure here shouldn't invalidate the already-stored evidence.
      if (
        typeof progressPercent === "number" &&
        session.user.role === "helper" &&
        currentTask &&
        progressPercent !== currentTask.progress_percent
      ) {
        try {
          await api(`/api/v1/tasks/${selectedTaskId}/progress`, {
            method: "POST",
            token: session.access_token,
            body: { progress_percent: progressPercent },
          });
        } catch (err) {
          toast.error(`Progress not saved: ${messageOf(err)}`);
        }
      }

      toast.dismiss(toastId);
      toast.success("Evidence uploaded and sent for approval.");
      setUploadMessage("Evidence uploaded and sent for approval.");
      setUploadFile(null);

      const assigned = await api<Task[]>("/api/v1/tasks/assigned", { token: session.access_token });
      setTasks(assigned);
      const evidenceData = await api<Evidence[]>(
        `/api/v1/tasks/${selectedTaskId}/evidences`,
        { token: session.access_token }
      );
      setEvidences(evidenceData);
      setAllEvidences((prev) => {
        const next = new Map(prev);
        next.set(selectedTaskId, evidenceData);
        return next;
      });
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(messageOf(err));
    } finally {
      setLoading(false);
    }
  }

  async function uploadComparisonPhoto(file: File, projectId: string): Promise<string> {
    if (!session) throw new Error("No session");
    const mimeError = validateEvidenceFile(file);
    if (mimeError) throw new Error(mimeError);
    // 3-phase upload using SYSTEM task (project-level upload)
    const uploadSession = await api<{ id: string; upload_url: string }>(
      `/api/v1/tasks/SYSTEM/evidence/upload-url`,
      {
        method: "POST",
        token: session.access_token,
        body: {
          file_name: file.name,
          content_type: file.type || "image/png",
          file_size_bytes: file.size,
          latitude: 0,
          longitude: 0,
          project_id: projectId,
        },
      }
    );
    const uploadResponse = await fetch(browserSafeURL(uploadSession.upload_url), {
      method: "PUT",
      headers: { "Content-Type": file.type || "image/png" },
      body: file,
    });
    if (!uploadResponse.ok) throw new Error("Failed to upload comparison photo.");
    const evidence = await api<{ id: string }>(`/api/v1/evidence/confirm-upload`, {
      method: "POST",
      token: session.access_token,
      body: {
        upload_session_id: uploadSession.id,
        metadata_exif: JSON.stringify({ type: "comparison_reference", device: "browser" }),
      },
    });
    return `/api/v1/files/${evidence.id}`;
  }

  async function handleTaskEditSave(taskId: string, data: Partial<Task> & { project_id?: string }, comparisonFile?: File | null) {
    if (!session) return;
    const targetProjectId = data.project_id || selectedProjectId;
    if (!taskId && !targetProjectId) {
      toast.error("Select a project for this task.");
      return;
    }
    const { project_id: _pid, ...taskFields } = data;
    setLoading(true);
    try {
      let savedTaskId = taskId;
      if (taskId) {
        await api(`/api/v1/tasks/${taskId}`, {
          method: "PATCH",
          token: session.access_token,
          body: taskFields,
        });
        toast.success("Task updated successfully.");
      } else {
        // Map data to the format handleCreateTask expects
        const result = await api<{ task: Task }>(`/api/v1/projects/${targetProjectId}/tasks`, {
          method: "POST",
          token: session.access_token,
          body: {
            task: {
              ...taskFields,
              budget_cents: Number(taskFields.budget_cents),
              spent_cents: Number(taskFields.spent_cents),
              progress_percent: Number(taskFields.progress_percent),
            },
            deliverable: {
              title: taskFields.title,
              description: taskFields.description,
              due_date: taskFields.end_date,
              status: "pending",
              client_visible: true,
            }
          }
        });
        savedTaskId = result.task?.id || "";
        toast.success("Task and deliverable created.");
      }

      // Upload comparison photo if provided
      if (comparisonFile && savedTaskId) {
        const toastId = toast.loading("Subiendo foto de comparación...");
        try {
          const photoUrl = await uploadComparisonPhoto(comparisonFile, targetProjectId);
          await api(`/api/v1/tasks/${savedTaskId}`, {
            method: "PATCH",
            token: session.access_token,
            body: { comparison_photo_url: photoUrl },
          });
          toast.dismiss(toastId);
          toast.success("Foto de comparación guardada.");
        } catch (err) {
          toast.dismiss(toastId);
          toast.error("Error subiendo foto de comparación: " + messageOf(err));
        }
      }
      // Refresh: switch to the target project (if different), reload its tasks,
      // and refresh the projects list so task counts on cards stay accurate.
      if (targetProjectId && targetProjectId !== selectedProjectId) {
        setSelectedProjectId(targetProjectId);
      }
      if (targetProjectId) {
        await loadProjectContext(targetProjectId);
      }
      try {
        const refreshed = await api<Project[]>("/api/v1/projects", { token: session.access_token });
        setProjects(refreshed);
      } catch {
        // non-fatal: task counts may be stale until next navigation
      }
      setTaskEditOpen(false);
      if (savedTaskId) setSelectedTaskId(savedTaskId);
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleTaskDelete(taskId: string) {
    if (!session) return;
    setConfirmTaskDeleteId(taskId);
  }

  async function doTaskDelete(taskId: string) {
    if (!session) return;
    setConfirmTaskDeleteId(null);
    setLoading(true);
    try {
      await api(`/api/v1/tasks/${taskId}`, {
        method: "DELETE",
        token: session.access_token,
      });
      if (selectedProjectId) await loadProjectContext(selectedProjectId);
      setTaskEditOpen(false);
      toast.success("Task deleted.");
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleBlueprintDelete(blueprintId: string) {
    if (!session) return;
    setConfirmBlueprintDeleteId(blueprintId);
  }

  async function doBlueprintDelete(blueprintId: string) {
    if (!session) return;
    setConfirmBlueprintDeleteId(null);
    setLoading(true);
    try {
      await api(`/api/v1/blueprints/${blueprintId}`, {
        method: "DELETE",
        token: session.access_token,
      });
      toast.success("Technical file deleted.");
      if (selectedProjectId) await loadProjectContext(selectedProjectId);
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleEvidenceDecision(
    evidenceID: string,
    action: "approve" | "reject",
    opts?: { reason?: string; visibleToClient?: boolean }
  ) {
    if (!session) return;
    setLoading(true);
    try {
      await api(`/api/v1/evidences/${evidenceID}/${action}`, {
        method: "POST",
        token: session.access_token,
        body:
          action === "approve"
            ? { comment: "Validada desde UI", visible_to_client: opts?.visibleToClient ?? true }
            : { reason: opts?.reason?.trim() || "Rechazada en revisión" },
      });
      await refreshEvidencesAfterDecision();
      toast.success(action === "approve" ? "Evidencia aprobada." : "Evidencia rechazada.");
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleReAuditEvidence(evidenceID: string) {
    if (!session) return;
    try {
      await api(`/api/v1/evidences/${evidenceID}/re-audit`, {
        method: "POST",
        token: session.access_token,
      });
      // Optimistic: mark as queued locally so the badge flips immediately
      // without blowing away other evidences from the current list.
      setEvidences((prev) =>
        prev.map((e) =>
          e.id === evidenceID ? { ...e, ai_processing_status: "queued" } : e
        )
      );
      setAllEvidences((prev) => {
        const next = new Map(prev);
        for (const [taskID, list] of prev.entries()) {
          next.set(
            taskID,
            list.map((e) =>
              e.id === evidenceID ? { ...e, ai_processing_status: "queued" } : e
            )
          );
        }
        return next;
      });
      toast.success("Re-auditoría encolada. El score aparecerá en unos segundos.");
    } catch (err) {
      const msg = messageOf(err);
      if (msg.includes("rate_limited")) {
        toast.error("Espera 30 segundos antes de re-auditar esta evidencia.");
      } else if (msg.includes("ai_disabled")) {
        toast.error("IA deshabilitada: GEMINI_API_KEY no configurada.");
      } else if (/429|quota|rate.?limit/i.test(msg)) {
        toast.error("Cuota de Gemini agotada. Intenta de nuevo en 1 minuto o revisa tu plan.");
      } else {
        toast.error(msg);
      }
    }
  }

  async function pollAuditProgress() {
    if (!session) return;
    const scope = evidenceScope();
    try {
      if (scope === "project") {
        const data = await api<Evidence[]>(
          `/api/v1/projects/${selectedProjectId}/evidences`,
          { token: session.access_token }
        );
        applyProjectEvidences(data);
      } else if (scope === "task") {
        const data = await api<Evidence[]>(
          `/api/v1/tasks/${selectedTaskId}/evidences`,
          { token: session.access_token }
        );
        applyTaskEvidences(selectedTaskId, data);
      }
    } catch {
      // silent — poll is best effort
    }
  }

  async function refreshEvidencesAfterDecision() {
    if (!session) return;
    const scope = evidenceScope();
    if (scope === "project") {
      try {
        const data = await api<Evidence[]>(
          `/api/v1/projects/${selectedProjectId}/evidences`,
          { token: session.access_token }
        );
        applyProjectEvidences(data);
      } catch {
        /* ignore */
      }
    } else if (scope === "task") {
      try {
        const data = await api<Evidence[]>(
          `/api/v1/tasks/${selectedTaskId}/evidences`,
          { token: session.access_token }
        );
        applyTaskEvidences(selectedTaskId, data);
      } catch {
        /* ignore */
      }
    }
    if (["client", "owner", "supervisor"].includes(session.user.role) && selectedProjectId) {
      try {
        const summary = await api<ClientSummary>(
          `/api/v1/client/projects/${selectedProjectId}/summary`,
          { token: session.access_token }
        );
        setClientSummary(summary);
      } catch {
        /* ignore — client summary may not be authorized */
      }
    }
  }

  function handleLogout() {
    // Best-effort server-side revocation. Even if it fails (offline, token
    // already expired), we still clear local state so the user sees a clean
    // logout. Server blacklist is in-memory; subsequent requests with the
    // same token get 401. See audit-findings.md F2.
    if (session) {
      void api("/api/v1/auth/logout", {
        method: "POST",
        token: session.access_token,
      }).catch(() => {});
    }
    window.sessionStorage.removeItem(storageKey);
    window.localStorage.removeItem(storageKey);
    setSession(null);
    setProjects([]);
    setUsers([]);
    setTasks([]);
    setDeliverables([]);
    setEvidences([]);
    setAllEvidences(new Map());
    setDashboard(null);
    setClientSummary(null);
    setBlueprints([]);
    setTenants([]);
    setRbac([]);
    setSelectedProjectId("");
    setSelectedTaskId("");
    setActiveView("overview");
    setHighlightedDeliverableId(null);
    toast.success("Session closed.");
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }

  async function handleExportCsv() {
    if (!session || !selectedProjectId) return;
    try {
      const response = await fetch(
        `/api/v1/projects/${selectedProjectId}/export.csv`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${currentProject?.name ?? "project"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV exported successfully.");
    } catch (err) {
      toast.error(messageOf(err));
    }
  }

  function handleTaskSelect(taskId: string) {
    setSelectedTaskId(taskId);
    const task = tasks.find((t) => t.id === taskId);
    if (task) {
      setTimelineForm({
        start_date: task.start_date,
        end_date: task.end_date,
        status: task.status,
        progress_percent: task.progress_percent,
        predecessor_task_id: task.predecessor_task_id || "",
      });
    }
  }

  async function handleDeliverableApprove(deliverableId: string) {
    if (!session) return;
    await api(`/api/v1/deliverables/${deliverableId}/approve`, { token: session.access_token, method: "POST" });
    // Refresh client summary
    if (selectedProjectId) {
      try {
        const summary = await api<ClientSummary>(
          `/api/v1/client/projects/${selectedProjectId}/summary`,
          { token: session.access_token }
        );
        setClientSummary(summary);
      } catch { /* ignore */ }
    }
  }

  async function handleDeliverableReject(deliverableId: string, reason: string) {
    if (!session) return;
    await api(`/api/v1/deliverables/${deliverableId}/reject`, {
      token: session.access_token,
      method: "POST",
      body: JSON.stringify({ reason }),
    });
    if (selectedProjectId) {
      try {
        const summary = await api<ClientSummary>(
          `/api/v1/client/projects/${selectedProjectId}/summary`,
          { token: session.access_token }
        );
        setClientSummary(summary);
      } catch { /* ignore */ }
    }
  }

  function handleDeliverableNavigate(deliverableId: string, taskId?: string) {
    setHighlightedDeliverableId(deliverableId);
    if (taskId) {
      setSelectedTaskId(taskId);
    }
    // For supervisor: switch to timeline view
    if (session?.user.role === "supervisor") {
      setActiveView("timeline");
    }
    if (session?.user.role === "client") {
      setClientGalleryTaskId(taskId ?? null);
      setActiveView("gallery");
    }
    // For owner: switch to projects view
    if (session?.user.role === "owner") {
      if (activeView === "summary" || activeView === "gallery") {
        setClientGalleryTaskId(taskId ?? null);
        setActiveView("gallery");
      } else {
        setActiveView("projects");
      }
    }
    // Load evidences for the task if known
    if (taskId && session && !allEvidences.has(taskId)) {
      setSelectedTaskId(taskId);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!session) {
    return (
      <PublicWorkspace
        demo={demo}
        authForm={authForm}
        setAuthForm={setAuthForm}
        inviteToken={inviteToken}
        resetToken={resetToken}
        inviteSetupForm={inviteSetupForm}
        setInviteSetupForm={setInviteSetupForm}
        onRegister={handleRegister}
        onLogin={handleLogin}
        onSetupAccount={handleSetupAccount}
        onExitInviteSetup={clearInviteSetupState}
        onResetComplete={(loginResp) => {
          setSession(loginResp);
          window.localStorage.setItem(storageKey, JSON.stringify(loginResp));
          setResetToken("");
          const url = new URL(window.location.href);
          url.searchParams.delete("reset");
          window.history.replaceState({}, "", url.toString());
        }}
        loading={loading}
      />
    );
  }

  const role = session.user.role;

  async function handleBlueprintUpload(file: File) {
    if (!session) return;
    if (!selectedProjectId) {
      toast.error("Select a project before uploading a technical file.");
      return;
    }
    
    const MAX_SIZE = 500 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      toast.error(`The file exceeds the 500MB limit (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
      return;
    }
    const mimeError = validateBlueprintFile(file);
    if (mimeError) {
      toast.error(mimeError);
      return;
    }

    setLoading(true);
    const toastId = toast.loading("Preparing upload...");
    
    try {
      const uploadSession = await api<{ id: string; upload_url: string }>(
        `/api/v1/projects/${selectedProjectId}/blueprints/upload-url`,
        {
          method: "POST",
          token: session.access_token,
          body: {
            file_name: file.name,
            content_type: file.type || "application/octet-stream",
            file_size_bytes: file.size,
          },
        }
      );

      const uploadUrl = browserSafeURL(uploadSession.upload_url);
      
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            toast.loading(`Uploading: ${percent}%`, { id: toastId });
          }
        });
        
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed: HTTP ${xhr.status}`));
          }
        });
        
        xhr.addEventListener("error", () => reject(new Error("Network error while uploading the file")));
        xhr.addEventListener("timeout", () => reject(new Error("Timeout: upload took too long")));
        
        xhr.open("PUT", uploadUrl);
        xhr.timeout = 600000;
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
        xhr.send(file);
      });

      await api(`/api/v1/blueprints/register`, {
        method: "POST",
        token: session.access_token,
        body: { upload_session_id: uploadSession.id },
      });

      toast.dismiss(toastId);
      toast.success("Technical file uploaded successfully.");
      await loadProjectContext(selectedProjectId);
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(messageOf(err));
    } finally {
      setLoading(false);
    }
  }

  const renderCanvas = () => {
    // ── Owner: full-access to all canvases based on activeView ──
    if (role === "owner") {
      // Supervisor views
      if (activeView === "review" || activeView === "timeline") {
        return (
          <SupervisorCanvas
            activeView={activeView}
            currentTask={currentTask}
            currentProject={currentProject}
            tasks={tasks}
            deliverables={deliverables}
            evidences={evidences}
            allEvidences={allEvidences}
            timelineForm={timelineForm}
            setTimelineForm={setTimelineForm}
            onTimelineUpdate={handleTimelineUpdate}
            onEvidenceDecision={handleEvidenceDecision}
            onReAudit={handleReAuditEvidence}
            onPollAudit={pollAuditProgress}
            highlightedDeliverableId={highlightedDeliverableId}
            onDeliverableNavigate={handleDeliverableNavigate}
            onTaskClick={handleOpenTaskEdit}
            onViewChange={setActiveView}
            onNewTask={() => {
              setSelectedTaskId("");
              setTaskEditOpen(true);
            }}
            loading={loading}
            isMobile={isMobile}
          />
        );
      }
      // Helper views
      if (activeView === "capture" || activeView === "history") {
        if (!currentTask) {
          const hasNoTasks = tasks.length === 0;
          const hasNoProjects = projects.length === 0;
          return (
            <div className="flex flex-col items-center justify-center py-20 text-center animate-fadeIn">
              <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                <ListPlus size={28} className="text-white/20" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">
                {hasNoTasks ? (hasNoProjects ? "No projects yet" : "No tasks in this project") : "No task selected"}
              </h2>
              <p className="text-sm text-white/40 max-w-sm mb-6">
                {hasNoProjects
                  ? "Create your first project, then add tasks to it to start capturing evidence."
                  : hasNoTasks
                  ? "Add at least one task to this project to start capturing evidence."
                  : `Select a task from the sidebar to ${activeView === "capture" ? "capture progress" : "view field history"}.`}
              </p>
              {hasNoProjects ? (
                <button
                  type="button"
                  onClick={() => setNewProjectModalOpen(true)}
                  className="px-6 py-3 rounded-xl font-bold text-sm text-white transition-all"
                  style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)", boxShadow: "0 4px 20px rgba(59,130,246,0.3)" }}
                >
                  Create your first project
                </button>
              ) : hasNoTasks ? (
                <button
                  type="button"
                  onClick={() => { setSelectedTaskId(""); setTaskEditOpen(true); }}
                  className="px-6 py-3 rounded-xl font-bold text-sm text-white transition-all"
                  style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)", boxShadow: "0 4px 20px rgba(59,130,246,0.3)" }}
                >
                  Add a task
                </button>
              ) : null}
            </div>
          );
        }
        return (
          <HelperCanvas
            activeView={activeView}
            currentTask={currentTask}
            evidences={evidences}
            uploadMessage={uploadMessage}
            onFileChange={setUploadFile}
            onUpload={handleHelperUpload}
            loading={loading}
            isMobile={isMobile}
            token={session.access_token}
          />
        );
      }
      // New Operational Views — require a project selected
      if (activeView === "finances" || activeView === "journal" || activeView === "messages") {
        if (!currentProject) {
          return (
            <div className="flex flex-col items-center justify-center py-20 text-center animate-fadeIn">
              <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                <FolderPlus size={28} className="text-white/20" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">No project selected</h2>
              <p className="text-sm text-white/40 max-w-sm mb-6">
                Select a project from the sidebar to access {activeView === "finances" ? "finance and costs" : activeView === "journal" ? "the daily log" : "messages and RFI"}.
              </p>
              {projects.length > 0 ? (
                <button
                  type="button"
                  onClick={() => { setSelectedProjectId(projects[0].id); }}
                  className="px-6 py-3 rounded-xl font-bold text-sm text-white transition-all"
                  style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)", boxShadow: "0 4px 20px rgba(59,130,246,0.3)" }}
                >
                  Open "{projects[0].name}"
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setNewProjectModalOpen(true)}
                  className="px-6 py-3 rounded-xl font-bold text-sm text-white transition-all"
                  style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)", boxShadow: "0 4px 20px rgba(59,130,246,0.3)" }}
                >
                  Create your first project
                </button>
              )}
            </div>
          );
        }
        if (activeView === "finances") return <FinancialControl project={currentProject} session={session} tasks={tasks} />;
        if (activeView === "journal") return <DailyJournal project={currentProject} session={session} />;
        if (activeView === "messages") return <MessagingHub project={currentProject} session={session} users={users} tasks={tasks} isMobile={isMobile} />;
      }
      if (activeView === "ownergallery") {
        return (
          <CapturesCanvas
            project={currentProject}
            evidences={evidences}
            tasks={tasks}
            onNewCapture={() => setPhotoUploadOpen(true)}
            onApprove={(id) => handleEvidenceDecision(id, "approve")}
            onReject={(id) => handleEvidenceDecision(id, "reject")}
            loading={loading}
          />
        );
      }
      
      // Client views
      if (activeView === "summary" || activeView === "gallery") {
        return (
          <ClientCanvas
            activeView={activeView}
            clientSummary={clientSummary}
            selectedTaskId={clientGalleryTaskId}
            onDeliverableClick={(id, taskId) => handleDeliverableNavigate(id, taskId)}
            onClearTaskFilter={() => setClientGalleryTaskId(null)}
            onApproveDeliverable={handleDeliverableApprove}
            onRejectDeliverable={handleDeliverableReject}
            isMobile={isMobile}
          />
        );
      }
      if (activeView === "blueprints") {
        return <PlanViewer blueprints={blueprints} token={session.access_token} onUpload={handleBlueprintUpload} onDelete={handleBlueprintDelete} isMobile={isMobile} />;
      }

      // Owner native views (overview, projects, team)
      return (
        <OwnerCanvas
          activeView={activeView}
          dashboard={dashboard}
          projects={projects}
          currentProject={currentProject}
          tasks={tasks}
          deliverables={deliverables}
          evidences={evidences}
          allEvidences={allEvidences}
          highlightedDeliverableId={highlightedDeliverableId}
          onDeliverableNavigate={handleDeliverableNavigate}
          onEvidenceDecision={handleEvidenceDecision}
          onTaskClick={handleOpenTaskEdit}
          onViewChange={setActiveView}
          onNewProject={() => setNewProjectModalOpen(true)}
          onNewTask={() => {
            setSelectedTaskId("");
            setTaskEditOpen(true);
          }}
          onInviteUser={() => setInviteUserModalOpen(true)}
          users={users}
          isMobile={isMobile}
          token={session.access_token}
          currentUserId={session.user.id}
          onTeamChanged={() => refreshRoleData(session)}
        />
      );
    }

    if (role === "supervisor") {
      if (activeView === "finances" || activeView === "journal" || activeView === "messages") {
        if (!currentProject) {
          return (
            <div className="flex flex-col items-center justify-center py-20 text-center animate-fadeIn">
              <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                <FolderPlus size={28} className="text-white/20" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">
                {projects.length > 0 ? "No project selected" : "No projects assigned"}
              </h2>
              <p className="text-sm text-white/40 max-w-sm mb-6">
                {projects.length > 0
                  ? `Select a project from the sidebar to access ${activeView === "finances" ? "finance and costs" : activeView === "journal" ? "the daily log" : "messages and RFI"}.`
                  : "You haven't been assigned to any project yet. Ask an owner to assign one, or create one yourself."}
              </p>
              {projects.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setSelectedProjectId(projects[0].id); }}
                  className="px-6 py-3 rounded-xl font-bold text-sm text-white transition-all"
                  style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)", boxShadow: "0 4px 20px rgba(59,130,246,0.3)" }}
                >
                  Open "{projects[0].name}"
                </button>
              )}
            </div>
          );
        }
        if (activeView === "finances") return <FinancialControl project={currentProject} session={session} tasks={tasks} />;
        if (activeView === "journal") return <DailyJournal project={currentProject} session={session} />;
        if (activeView === "messages") return <MessagingHub project={currentProject} session={session} users={users} tasks={tasks} isMobile={isMobile} />;
      }
      if (activeView === "blueprints" && !currentProject) {
        return (
          <div className="flex flex-col items-center justify-center py-20 text-center animate-fadeIn">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
              <FolderPlus size={28} className="text-white/20" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">
              {projects.length > 0 ? "No project selected" : "No projects assigned"}
            </h2>
            <p className="text-sm text-white/40 max-w-sm mb-6">
              {projects.length > 0
                ? "Select a project from the sidebar to view its technical files."
                : "You haven't been assigned to any project yet."}
            </p>
            {projects.length > 0 && (
              <button
                type="button"
                onClick={() => { setSelectedProjectId(projects[0].id); }}
                className="px-6 py-3 rounded-xl font-bold text-sm text-white transition-all"
                style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)", boxShadow: "0 4px 20px rgba(59,130,246,0.3)" }}
              >
                Open "{projects[0].name}"
              </button>
            )}
          </div>
        );
      }
      if (activeView === "gallery") {
        return (
          <CapturesCanvas
            project={currentProject}
            evidences={evidences}
            tasks={tasks}
            onNewCapture={() => setPhotoUploadOpen(true)}
            onApprove={(id) => handleEvidenceDecision(id, "approve")}
            onReject={(id) => handleEvidenceDecision(id, "reject")}
            loading={loading}
          />
        );
      }
      if (activeView === "blueprints") {
        return <PlanViewer blueprints={blueprints} token={session.access_token} onUpload={handleBlueprintUpload} onDelete={handleBlueprintDelete} isMobile={isMobile} />;
      }

      return (
        <SupervisorCanvas
          activeView={activeView}
          currentTask={currentTask}
          currentProject={currentProject}
          tasks={tasks}
          deliverables={deliverables}
          evidences={evidences}
          allEvidences={allEvidences}
          timelineForm={timelineForm}
          setTimelineForm={setTimelineForm}
          onTimelineUpdate={handleTimelineUpdate}
          onEvidenceDecision={handleEvidenceDecision}
          onReAudit={handleReAuditEvidence}
          onPollAudit={pollAuditProgress}
          highlightedDeliverableId={highlightedDeliverableId}
          onDeliverableNavigate={handleDeliverableNavigate}
          onTaskClick={handleOpenTaskEdit}
          loading={loading}
          onViewChange={setActiveView}
          onNewTask={() => {
            setSelectedTaskId("");
            setTaskEditOpen(true);
          }}
          isMobile={isMobile}
        />
      );
    }
    
    if (role === "helper") {
      if (activeView === "journal") {
        if (!currentProject) {
          return (
            <div className="flex flex-col items-center justify-center py-20 text-center animate-fadeIn">
              <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                <FolderPlus size={28} className="text-white/20" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">
                {projects.length > 0 ? "No project selected" : "No projects assigned"}
              </h2>
              <p className="text-sm text-white/40 max-w-sm mb-6">
                {projects.length > 0
                  ? "Select a project from the sidebar to access the daily log."
                  : "You haven't been assigned to any project yet."}
              </p>
              {projects.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setSelectedProjectId(projects[0].id); }}
                  className="px-6 py-3 rounded-xl font-bold text-sm text-white transition-all"
                  style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)", boxShadow: "0 4px 20px rgba(59,130,246,0.3)" }}
                >
                  Open &quot;{projects[0].name}&quot;
                </button>
              )}
            </div>
          );
        }
        return <DailyJournal project={currentProject} session={session} />;
      }
      if ((activeView === "capture" || activeView === "history") && !currentTask && tasks.length === 0) {
        return (
          <div className="flex flex-col items-center justify-center py-20 text-center animate-fadeIn">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
              <ListPlus size={28} className="text-white/20" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">No assigned tasks yet</h2>
            <p className="text-sm text-white/40 max-w-sm mb-6">
              Your supervisor hasn&apos;t assigned any tasks to you. Once they do, you&apos;ll be able to capture evidence here.
            </p>
          </div>
        );
      }
      return (
        <HelperCanvas
          activeView={activeView}
          currentTask={currentTask}
          evidences={evidences}
          uploadMessage={uploadMessage}
          onFileChange={setUploadFile}
          onUpload={handleHelperUpload}
          loading={loading}
          isMobile={isMobile}
          token={session.access_token}
        />
      );
    }
    
    if (role === "client") {
      return (
        <ClientCanvas
          activeView={activeView}
          clientSummary={clientSummary}
          selectedTaskId={clientGalleryTaskId}
          onDeliverableClick={(id, taskId) => handleDeliverableNavigate(id, taskId)}
          onClearTaskFilter={() => setClientGalleryTaskId(null)}
        />
      );
    }
    
    if (role === "admin" && !session.user.tenant_id) {
      return (
        <AdminCanvas
          activeView={activeView}
          tenants={tenants}
          rbac={rbac}
          token={session.access_token}
          onRefresh={async () => {
            try {
              const rbacData = await api<RBACRule[]>("/api/v1/admin/rbac", { token: session.access_token });
              setRbac(rbacData);
            } catch (err) {
              toast.error(messageOf(err));
            }
          }}
        />
      );
    }
    
    return null;
  };

  const brandStyle = (() => {
    const p = currentTenant?.primary_color?.trim();
    const s = currentTenant?.secondary_color?.trim();
    const style: Record<string, string> = {};
    if (p) {
      style["--brand-primary"] = p;
      style["--accent-primary"] = p;
    }
    if (s) {
      style["--brand-secondary"] = s;
      style["--accent-secondary"] = s;
    }
    return style as React.CSSProperties;
  })();

  return (
    <AuthTokenProvider value={session?.access_token ?? null}>
    <BillingProvider token={session?.access_token ?? null}>
    <div className="app-shell" style={brandStyle}>
      <ConfirmDialog
        open={confirmTaskDeleteId !== null}
        title="Delete task?"
        body="This task and its evidence will be permanently removed."
        confirmLabel="Delete"
        destructive
        onConfirm={() => confirmTaskDeleteId && void doTaskDelete(confirmTaskDeleteId)}
        onCancel={() => setConfirmTaskDeleteId(null)}
      />
      <ConfirmDialog
        open={confirmBlueprintDeleteId !== null}
        title="Delete technical file?"
        body="This file will be permanently removed from the project."
        confirmLabel="Delete"
        destructive
        onConfirm={() => confirmBlueprintDeleteId && void doBlueprintDelete(confirmBlueprintDeleteId)}
        onCancel={() => setConfirmBlueprintDeleteId(null)}
      />
      <TrialBanner onUpgrade={() => { setUpgradeReason(null); setUpgradeModalOpen(true); }} />
      <UpgradeModal
        isOpen={upgradeModalOpen}
        onClose={() => { setUpgradeModalOpen(false); setUpgradeReason(null); }}
        token={session?.access_token ?? null}
        reason={upgradeReason}
      />
      {/* ── Modals ─────────────────────────────────── */}
      <SettingsGeneralModal
        open={settingsGeneralOpen}
        onClose={() => setSettingsGeneralOpen(false)}
        companyName={session.user.full_name ?? "Mi Empresa"}
        userCount={users.length}
        users={users}
        currentUserId={session.user.id}
        currentUserRole={session.user.role}
        token={session.access_token}
        projects={projects.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          status: p.status,
          start_date: p.start_date,
          planned_end_date: p.planned_end_date,
          supervisor_user_id: p.supervisor_user_id,
          client_user_id: p.client_user_id,
          latitude_center: p.latitude_center,
          longitude_center: p.longitude_center,
          geofence_radius_m: p.geofence_radius_m,
        }))}
        onUsersChanged={() => refreshRoleData(session)}
        onTenantUpdated={(t) => setCurrentTenant(t)}
        onProjectAssignmentChanged={async () => {
          try {
            const refreshed = await api<Project[]>("/api/v1/projects", { token: session.access_token });
            setProjects(refreshed);
          } catch (err) {
            console.error("projects refresh after assignment failed", err);
          }
        }}
      />
      <SettingsProjectModal
        open={settingsProjectOpen}
        onClose={() => setSettingsProjectOpen(false)}
        project={currentProject as any}
        supervisors={supervisors}
        clients={clients}
        token={session.access_token}
        onSaved={(updated) => {
          setProjects((prev) => prev.map((p) => p.id === updated.id ? { ...p, ...updated } : p));
        }}
        onDeleted={(deletedId) => {
          setProjects((prev) => prev.filter((p) => p.id !== deletedId));
          if (selectedProjectId === deletedId) {
            setSelectedProjectId("");
            setTasks([]);
            setDeliverables([]);
            setEvidences([]);
            setSelectedTaskId("");
          }
        }}
      />
      <TaskApprovalModal
        open={taskApprovalOpen}
        onClose={() => setTaskApprovalOpen(false)}
        evidences={evidences.filter((e) => e.status === "pending_approval")}
        initialIndex={taskApprovalIndex}
        onApprove={(id) => handleEvidenceDecision(id, "approve")}
        onReject={(id) => handleEvidenceDecision(id, "reject")}
        loading={loading}
      />
      <PhotoUploadModal
        open={photoUploadOpen}
        onClose={() => { setPhotoUploadOpen(false); setUploadFile(null); setUploadMessage(""); }}
        currentTask={currentTask}
        loading={loading}
        onFileChange={setUploadFile}
        onUpload={async (e) => {
          await handleHelperUpload(e);
          setPhotoUploadOpen(false);
        }}
        uploadMessage={uploadMessage}
      />
      <TaskEditModal
        isOpen={taskEditOpen}
        onClose={() => setTaskEditOpen(false)}
        task={currentTask}
        users={helpers}
        onSave={handleTaskEditSave}
        onDelete={handleTaskDelete}
        loading={loading}
        token={session?.access_token}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        defaultProjectId={selectedProjectId}
      />

      {!isMobile && (
        <Sidebar
          session={session}
          activeView={activeView}
          setActiveView={setActiveView}
          projects={projects}
          selectedProjectId={selectedProjectId}
          setSelectedProjectId={setSelectedProjectId}
          tasks={tasks}
          selectedTaskId={selectedTaskId}
          onTaskSelect={handleTaskSelect}
          tenants={tenants}
          pendingEvidenceCount={pendingEvidenceCount}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onOpenSettingsGeneral={() => setSettingsGeneralOpen(true)}
          onOpenSettingsProject={() => setSettingsProjectOpen(true)}
          tenantLogoUrl={currentTenant?.logo_url}
          tenantName={currentTenant?.name}
        />
      )}

      <div className="app-main">
        <TopBar
          session={session}
          currentProject={currentProject}
          activeView={activeView}
          onLogout={handleLogout}
          onMenuOpen={() => setSidebarOpen(true)}
          onExportCsv={handleExportCsv}
          pendingCount={pendingEvidenceCount}
          isMobile={isMobile}
          onNotificationClick={() => setActiveView("review")}
          unreadNotifCount={unreadNotifCount}
          onUnreadNotifCountChange={setUnreadNotifCount}
          onOpenSettings={() => setSettingsGeneralOpen(true)}
          tenantName={currentTenant?.name}
        />

        <div className="app-content">
          <main className="canvas-area">
            {renderCanvas()}
          </main>

          {/* Right inspector removed — actions moved to FAB + modals */}
        </div>

        {isMobile && (
          <MobileBottomNav
            role={session.user.role}
            activeView={activeView}
            onViewChange={setActiveView}
            pendingCount={pendingEvidenceCount}
          />
        )}
      </div>
    </div>
    <NewProjectModal
        open={newProjectModalOpen}
        onClose={() => setNewProjectModalOpen(false)}
        supervisors={supervisors}
        clients={clients}
        loading={loading}
        onInviteClient={() => setInviteUserModalOpen(true)}
        onSubmit={handleCreateProjectModal}
      />
      <InviteUserModal
        isOpen={inviteUserModalOpen}
        onClose={() => setInviteUserModalOpen(false)}
        token={session?.access_token ?? ""}
        onInvited={() => refreshRoleData(session!)}
      />
      {(role === "owner" || role === "supervisor") && (
        <FabActions
          actions={[
            { id: "project", label: "New Project", icon: <FolderPlus size={20} className="text-white" />, color: "#3b82f6", onClick: () => setNewProjectModalOpen(true) },
            {
              id: "task",
              label: "New Task",
              icon: <ListPlus size={20} className="text-white" />,
              color: "#10b981",
              disabled: projects.length === 0,
              disabledHint: "Create a project first",
              onClick: () => {
                if (projects.length === 0) {
                  toast.error("Create a project first, then add tasks to it.");
                  setNewProjectModalOpen(true);
                  return;
                }
                setSelectedTaskId("");
                setTaskEditOpen(true);
              },
            },
            { id: "invite", label: "Invite User", icon: <UserPlus size={20} className="text-white" />, color: "#8b5cf6", onClick: () => setInviteUserModalOpen(true) },
          ]}
        />
      )}
    </BillingProvider>
    </AuthTokenProvider>
  );
}
