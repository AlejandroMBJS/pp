"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
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

// ── Types ──────────────────────────────────────────────────────────────────

type DemoPayload = {
  product: string;
  message: string;
  demo_accounts: Array<{ role: string; email: string; password: string }>;
  suggested_flow: string[];
};

type User = { id: string; tenant_id: string; email: string; full_name: string; role: string };
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

async function api<T = any>(
  path: string,
  options: { method?: string; token?: string; body?: any; signal?: AbortSignal } = {}
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [authForm, setAuthForm] = useState<AuthFormState>({
    company_name: "",
    company_slug: "",
    owner_name: "",
    owner_email: "",
    password: "demo123",
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

  // UI state
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [activeView, setActiveView] = useState("overview");
  const [highlightedDeliverableId, setHighlightedDeliverableId] = useState<string | null>(null);
  const [clientGalleryTaskId, setClientGalleryTaskId] = useState<string | null>(null);
  const [lastUserInvite, setLastUserInvite] = useState<UserInviteResponse | null>(null);
  const [inviteToken, setInviteToken] = useState("");
  const [inviteSetupForm, setInviteSetupForm] = useState<InviteSetupFormState>({
    password: "",
    confirmPassword: "",
  });

  // Modal state
  const [settingsGeneralOpen, setSettingsGeneralOpen] = useState(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
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

  const supervisors = useMemo(() => users.filter((u) => u.role === "supervisor"), [users]);
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

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setInviteToken(params.get("invite") ?? "");
    const raw = window.localStorage.getItem(storageKey) ?? window.localStorage.getItem(legacyStorageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        // Check JWT expiry before restoring session
        const payload = JSON.parse(atob(parsed.access_token.split(".")[1]));
        if (payload.exp && payload.exp * 1000 < Date.now()) {
          window.localStorage.removeItem(storageKey);
          window.localStorage.removeItem(legacyStorageKey);
          toast.info("Tu sesión ha expirado. Por favor inicia sesión nuevamente.");
        } else {
          setSession(parsed);
          window.localStorage.setItem(storageKey, raw);
          window.localStorage.removeItem(legacyStorageKey);
        }
      } catch {
        // Corrupted session data — clear it
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

  useEffect(() => {
    if (!session || !selectedTaskId) return;
    const controller = new AbortController();
    const { signal } = controller;

    if (["owner", "supervisor", "helper"].includes(session.user.role)) {
      api<Evidence[]>(`/api/v1/tasks/${selectedTaskId}/evidences`, {
        token: session.access_token,
        signal,
      })
        .then((data) => {
          if (signal.aborted) return;
          setEvidences(data);
          // Accumulate in allEvidences map for Gantt
          setAllEvidences((prev) => {
            const next = new Map(prev);
            next.set(selectedTaskId, data);
            return next;
          });
        })
        .catch((err) => { if (!signal.aborted) toast.error("No se pudieron cargar las evidencias de la tarea."); });
    }

    // Also fetch all project evidence if in gallery view or for owner/supervisor overview
    if (["owner", "supervisor"].includes(session.user.role)) {
       api<Evidence[]>(`/api/v1/projects/${selectedProjectId}/evidence`, {
          token: session.access_token,
          signal,
       }).then(data => {
          if (!signal.aborted) setEvidences(data);
       }).catch((err) => { if (!signal.aborted) toast.error("No se pudieron cargar las evidencias del proyecto."); });
    }

    return () => controller.abort();
  }, [session, selectedTaskId, selectedProjectId, activeView]);

  // ── Data fetchers ─────────────────────────────────────────────────────────

  async function refreshRoleData(activeSession: LoginResponse) {
    const token = activeSession.access_token;
    const role = activeSession.user.role;

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

  async function handleHelperUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !selectedTaskId || !uploadFile) return;
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

  async function handleTaskEditSave(taskId: string, data: Partial<Task>, comparisonFile?: File | null) {
    if (!session) return;
    setLoading(true);
    try {
      let savedTaskId = taskId;
      if (taskId) {
        await api(`/api/v1/tasks/${taskId}`, {
          method: "PATCH",
          token: session.access_token,
          body: data,
        });
        toast.success("Task updated successfully.");
      } else {
        // Map data to the format handleCreateTask expects
        const result = await api<{ task: Task }>(`/api/v1/projects/${selectedProjectId}/tasks`, {
          method: "POST",
          token: session.access_token,
          body: {
            task: {
              ...data,
              budget_cents: Number(data.budget_cents),
              spent_cents: Number(data.spent_cents),
              progress_percent: Number(data.progress_percent),
            },
            deliverable: {
              title: data.title,
              description: data.description,
              due_date: data.end_date,
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
          const photoUrl = await uploadComparisonPhoto(comparisonFile, selectedProjectId);
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
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleTaskDelete(taskId: string) {
    if (!session || !confirm("Are you sure you want to delete this task?")) return;
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
    if (!session || !confirm("Delete this technical file?")) return;
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

  async function handleEvidenceDecision(evidenceID: string, action: "approve" | "reject") {
    if (!session) return;
    setLoading(true);
    try {
      await api(`/api/v1/evidences/${evidenceID}/${action}`, {
        method: "POST",
        token: session.access_token,
        body:
          action === "approve"
            ? { comment: "Validada desde UI", visible_to_client: true }
            : { reason: "Manual review note" },
      });
      if (selectedTaskId) {
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
      }
      if (["client", "owner", "supervisor"].includes(session.user.role) && selectedProjectId) {
        const summary = await api<ClientSummary>(
          `/api/v1/client/projects/${selectedProjectId}/summary`,
          { token: session.access_token }
        );
        setClientSummary(summary);
      }
      toast.success(action === "approve" ? "Evidence approved." : "Evidence rejected.");
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
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
        inviteSetupForm={inviteSetupForm}
        setInviteSetupForm={setInviteSetupForm}
        onRegister={handleRegister}
        onLogin={handleLogin}
        onSetupAccount={handleSetupAccount}
        onExitInviteSetup={clearInviteSetupState}
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
            highlightedDeliverableId={highlightedDeliverableId}
            onDeliverableNavigate={handleDeliverableNavigate}
            loading={loading}
            isMobile={isMobile}
          />
        );
      }
      // Helper views
      if (activeView === "capture" || activeView === "history") {
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
          />
        );
      }
      // New Operational Views
      if (activeView === "finances" && currentProject) {
        return <FinancialControl project={currentProject} session={session} tasks={tasks} />;
      }
      if (activeView === "journal" && currentProject) {
        return <DailyJournal project={currentProject} session={session} />;
      }
      if (activeView === "messages" && currentProject) {
        return <MessagingHub project={currentProject} session={session} users={users} tasks={tasks} isMobile={isMobile} />;
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
          onNewProject={() => setSettingsProjectOpen(true)}
          onNewTask={() => {
            setSelectedTaskId("");
            setTaskEditOpen(true);
          }}
          isMobile={isMobile}
        />
      );
    }
    
    if (role === "supervisor") {
      if (activeView === "finances" && currentProject) {
        return <FinancialControl project={currentProject} session={session} tasks={tasks} />;
      }
      if (activeView === "journal" && currentProject) {
        return <DailyJournal project={currentProject} session={session} />;
      }
      if (activeView === "messages" && currentProject) {
        return <MessagingHub project={currentProject} session={session} users={users} tasks={tasks} isMobile={isMobile} />;
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
      return (
        <HelperCanvas
          activeView={activeView}
          currentTask={currentTask}
          evidences={evidences}
          uploadMessage={uploadMessage}
          onFileChange={setUploadFile}
          onUpload={handleHelperUpload}
          loading={loading}
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
    
    if (role === "admin") {
      return (
        <AdminCanvas
          activeView={activeView}
          tenants={tenants}
          rbac={rbac}
          token={session.access_token}
          onRefresh={async () => {
            const rbacData = await api<RBACRule[]>("/api/v1/admin/rbac", { token: session.access_token });
            setRbac(rbacData);
          }}
        />
      );
    }
    
    return null;
  };

  return (
    <AuthTokenProvider value={session?.access_token ?? null}>
    <BillingProvider token={session?.access_token ?? null}>
    <div className="app-shell">
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
        />

        <div className="app-content">
          <main className="canvas-area">
            {renderCanvas()}
          </main>

          {!isMobile && (
            <RightInspector
              session={session}
              activeView={activeView}
              users={users}
              supervisors={supervisors}
              helpers={helpers}
              clients={clients}
              newUser={newUser}
              setNewUser={setNewUser}
              lastUserInvite={lastUserInvite}
              newProject={newProject}
              setNewProject={setNewProject}
              newTask={newTask}
              setNewTask={setNewTask}
              currentProject={currentProject}
              currentTask={currentTask}
              deliverables={deliverables}
              evidences={evidences}
              rbac={rbac}
              onCreateUser={handleCreateUser}
              onCopyInviteLink={handleCopyInviteLink}
              onCreateProject={handleCreateProject}
              onCreateTask={handleCreateTask}
              onDeliverableClick={(id) => handleDeliverableNavigate(id)}
              onOpenSettingsGeneral={() => setSettingsGeneralOpen(true)}
              onOpenSettingsProject={() => setSettingsProjectOpen(true)}
              onOpenTaskApproval={(idx = 0) => {
                setTaskApprovalIndex(idx);
                setTaskApprovalOpen(true);
              }}
              onOpenPhotoUpload={() => setPhotoUploadOpen(true)}
              loading={loading}
            />
          )}
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
    </BillingProvider>
    </AuthTokenProvider>
  );
}
