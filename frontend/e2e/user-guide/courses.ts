import type { BrowserContext, Page } from "@playwright/test";
import path from "path";
import type { Locale } from "./copy";
import type { SeedResult, SeedUser } from "./seed";

export type Role = "owner" | "supervisor" | "helper" | "client" | "platform_admin";

export type ChapterContext = {
  context: BrowserContext;
  page: Page;
  locale: Locale;
  seed: SeedResult;
  baseURL: string;
  loginAs: (u: SeedUser) => Promise<void>;
};

export type Chapter = {
  id: string;
  titleEn: string;
  titleEs: string;
  captionEn: string;
  captionEs: string;
  run: (ctx: ChapterContext) => Promise<void>;
};

export type Course = {
  role: Role;
  slug: string;
  titleEn: string;
  titleEs: string;
  introEn: string;
  introEs: string;
  audienceEn: string;
  audienceEs: string;
  prerequisitesEn: string;
  prerequisitesEs: string;
  chapters: Chapter[];
};

const ASSETS = path.resolve(__dirname, "assets");
const RENDER_1 = path.join(ASSETS, "render-1.png");
const RENDER_2 = path.join(ASSETS, "render-2.png");
const REAL_1 = path.join(ASSETS, "real-1.png");
const REAL_2 = path.join(ASSETS, "real-2.png");
const DXF_RES = path.join(ASSETS, "blueprint-residential.dxf");
const DXF_COM = path.join(ASSETS, "blueprint-commercial.dxf");

const wait = (page: Page, ms = 700) => page.waitForTimeout(ms);

const gotoApp = async (ctx: ChapterContext, subPath = "") => {
  const url = `${ctx.baseURL}/${ctx.locale}${subPath}`;
  await ctx.page.goto(url, { waitUntil: "domcontentloaded" });
  await wait(ctx.page, 1200);
};

// Click a sidebar nav button by its exact label text. Sidebar labels are
// hardcoded English in components/sidebar.tsx, so locale-independent.
const clickNav = async (c: ChapterContext, label: string) => {
  const btn = c.page.locator(`nav button:has-text("${label}")`).first();
  await btn.click({ timeout: 5000 }).catch(() => {});
  await wait(c.page, 700);
};

// Click any visible button matching text in the main panel.
const clickButton = async (c: ChapterContext, text: string) => {
  const btn = c.page.locator(`button:has-text("${text}")`).first();
  await btn.click({ timeout: 5000 }).catch(() => {});
  await wait(c.page, 600);
};

// Try to upload a file by setting input[type=file]. Returns whether an input was found.
const uploadFile = async (c: ChapterContext, filePath: string): Promise<boolean> => {
  try {
    const input = c.page.locator('input[type="file"]').first();
    await input.setInputFiles(filePath, { timeout: 3000 });
    await wait(c.page, 800);
    return true;
  } catch {
    return false;
  }
};

// =============================================================
// OWNER COURSE — 20 chapters, all unique sidebar/modal/route views
// =============================================================

const ownerChapters: Chapter[] = [
  {
    id: "01-welcome",
    titleEn: "Welcome to ProjectPulse",
    titleEs: "Bienvenido a ProjectPulse",
    captionEn: "The landing page is the first touchpoint for any new owner. It summarizes the value proposition and leads into signup.",
    captionEs: "La landing es el primer contacto de cualquier owner nuevo. Resume la propuesta de valor y lleva al signup.",
    run: async (c) => { await gotoApp(c, ""); },
  },
  {
    id: "02-pricing",
    titleEn: "Plans and pricing",
    titleEs: "Planes y precios",
    captionEn: "Compare the Starter, Pro and Enterprise plans before signing up. Each tier unlocks more projects, users and storage.",
    captionEs: "Compara los planes Starter, Pro y Enterprise antes de registrarte. Cada tier desbloquea más proyectos, usuarios y almacenamiento.",
    run: async (c) => { await gotoApp(c, "/pricing"); },
  },
  {
    id: "03-signup",
    titleEn: "Sign up your company",
    titleEs: "Registra tu empresa",
    captionEn: "Create your company tenant with the owner email. The slug becomes part of every internal URL inside ProjectPulse.",
    captionEs: "Crea el tenant de tu empresa con el email del owner. El slug forma parte de cada URL interna en ProjectPulse.",
    run: async (c) => { await gotoApp(c, "/signup"); },
  },
  {
    id: "04-login",
    titleEn: "Log in for the first time",
    titleEs: "Primer inicio de sesión",
    captionEn: "After signup you land on the login screen. Use the owner email and the password you just set.",
    captionEs: "Después del signup llegas a la pantalla de login. Usa el email del owner y la contraseña que acabas de crear.",
    run: async (c) => { await gotoApp(c, "/login"); },
  },
  {
    id: "05-overview",
    titleEn: "Executive overview",
    titleEs: "Vista ejecutiva",
    captionEn: "The executive overview is your home base. It surfaces active projects, alerts, health score and budget variance in one glance.",
    captionEs: "La vista ejecutiva es tu base. Muestra proyectos activos, alertas, score de salud y variación de presupuesto de un solo vistazo.",
    run: async (c) => {
      await c.loginAs(c.seed.owner);
      await gotoApp(c, "/app");
      await clickNav(c, "Executive overview");
    },
  },
  {
    id: "06-projects",
    titleEn: "Projects and timeline",
    titleEs: "Proyectos y línea de tiempo",
    captionEn: "Switch to the Projects panel to see every project in your company with its progress, supervisor and current status.",
    captionEs: "Cambia al panel de Proyectos para ver cada proyecto de tu empresa con su progreso, supervisor y estado actual.",
    run: async (c) => {
      await c.loginAs(c.seed.owner);
      await gotoApp(c, "/app");
      await clickNav(c, "Projects and timeline");
    },
  },
  {
    id: "07-create-project-modal",
    titleEn: "Create a new project",
    titleEs: "Crear un proyecto nuevo",
    captionEn: "Click New project to open the modal. Capture name, budget, dates, supervisor, client and geofence coordinates here.",
    captionEs: "Haz clic en Nuevo proyecto para abrir el modal. Aquí capturas nombre, presupuesto, fechas, supervisor, cliente y coordenadas del geofence.",
    run: async (c) => {
      await c.loginAs(c.seed.owner);
      await gotoApp(c, "/app");
      await clickNav(c, "Projects and timeline");
      await clickButton(c, "New project");
    },
  },
  {
    id: "08-finance",
    titleEn: "Finance and costs",
    titleEs: "Finanzas y costos",
    captionEn: "The financial control view tracks planned vs spent budget per project. You can adjust budgets and log expenses here.",
    captionEs: "La vista de control financiero rastrea presupuesto planeado vs gastado por proyecto. Aquí puedes ajustar presupuestos y registrar gastos.",
    run: async (c) => {
      await c.loginAs(c.seed.owner);
      await gotoApp(c, `/app?project=${c.seed.project.id}`);
      await clickNav(c, "Finance and costs");
    },
  },
  {
    id: "09-daily-log",
    titleEn: "Daily log",
    titleEs: "Bitácora diaria",
    captionEn: "Daily log entries form the audit trail of what happened on the site. Owners read this to spot risks early.",
    captionEs: "Las entradas de la bitácora diaria forman el trail de auditoría de lo que pasa en obra. Los owners la leen para detectar riesgos a tiempo.",
    run: async (c) => {
      await c.loginAs(c.seed.owner);
      await gotoApp(c, `/app?project=${c.seed.project.id}`);
      await clickNav(c, "Daily log");
    },
  },
  {
    id: "10-messages-rfi",
    titleEn: "Messages and RFI",
    titleEs: "Mensajes y RFI",
    captionEn: "The internal messaging hub keeps RFIs and announcements pinned to the project, separate from email.",
    captionEs: "El hub de mensajes internos mantiene RFIs y anuncios fijados al proyecto, separados del email.",
    run: async (c) => {
      await c.loginAs(c.seed.owner);
      await gotoApp(c, `/app?project=${c.seed.project.id}`);
      await clickNav(c, "Messages and RFI");
    },
  },
  {
    id: "11-cad-empty",
    titleEn: "CAD and 3D files — empty state",
    titleEs: "Archivos CAD y 3D — estado vacío",
    captionEn: "Before any blueprint is uploaded, the plan viewer shows the empty state with the upload affordance.",
    captionEs: "Antes de subir cualquier blueprint, el visor muestra el estado vacío con el control de subida.",
    run: async (c) => {
      await c.loginAs(c.seed.owner);
      await gotoApp(c, `/app?project=${c.seed.project.id}`);
      await clickNav(c, "CAD and 3D files");
    },
  },
  {
    id: "12-cad-uploaded",
    titleEn: "CAD and 3D files — DXF loaded",
    titleEs: "Archivos CAD y 3D — DXF cargado",
    captionEn: "After uploading a DXF the viewer renders the file and adds it to the blueprints library for the project.",
    captionEs: "Tras subir un DXF el visor renderiza el archivo y lo añade a la librería de blueprints del proyecto.",
    run: async (c) => {
      await c.loginAs(c.seed.owner);
      await gotoApp(c, `/app?project=${c.seed.project.id}`);
      await clickNav(c, "CAD and 3D files");
      await uploadFile(c, DXF_RES);
      await wait(c.page, 2000);
    },
  },
  {
    id: "13-progress-gallery",
    titleEn: "Progress gallery",
    titleEs: "Galería de progreso",
    captionEn: "Every captured evidence shows up in the progress gallery, sorted by task and status.",
    captionEs: "Cada evidencia capturada aparece en la galería de progreso, ordenada por tarea y estado.",
    run: async (c) => {
      await c.loginAs(c.seed.owner);
      await gotoApp(c, `/app?project=${c.seed.project.id}`);
      await clickNav(c, "Progress gallery");
    },
  },
  {
    id: "14-team-tasks",
    titleEn: "Team and tasks",
    titleEs: "Equipo y tareas",
    captionEn: "Manage your team and the task list from a single panel. Invite users and assign work without leaving this view.",
    captionEs: "Gestiona tu equipo y la lista de tareas desde un solo panel. Invita usuarios y asigna trabajo sin salir de esta vista.",
    run: async (c) => {
      await c.loginAs(c.seed.owner);
      await gotoApp(c, `/app?project=${c.seed.project.id}`);
      await clickNav(c, "Team and tasks");
    },
  },
  {
    id: "15-review-queue",
    titleEn: "Review queue",
    titleEs: "Cola de revisión",
    captionEn: "Owners can act as supervisors when needed. The review queue surfaces every evidence pending QA across all projects.",
    captionEs: "Los owners pueden actuar como supervisores cuando sea necesario. La cola de revisión muestra cada evidencia pendiente de QA en todos los proyectos.",
    run: async (c) => {
      await c.loginAs(c.seed.owner);
      await gotoApp(c, `/app?project=${c.seed.project.id}`);
      await clickNav(c, "Review queue");
    },
  },
  {
    id: "16-timeline-gantt",
    titleEn: "Timeline Gantt",
    titleEs: "Línea de tiempo Gantt",
    captionEn: "The Gantt view plots every task across the project calendar, including dependencies and slack.",
    captionEs: "La vista Gantt grafica cada tarea sobre el calendario del proyecto, incluyendo dependencias y holgura.",
    run: async (c) => {
      await c.loginAs(c.seed.owner);
      await gotoApp(c, `/app?project=${c.seed.project.id}`);
      await clickNav(c, "Timeline Gantt");
    },
  },
  {
    id: "17-capture-progress",
    titleEn: "Capture progress (helper view)",
    titleEs: "Capturar progreso (vista helper)",
    captionEn: "Owners can also see the helper capture view to validate what field workers experience day to day.",
    captionEs: "Los owners también ven la vista de captura del helper para validar qué experimentan los operadores en obra.",
    run: async (c) => {
      await c.loginAs(c.seed.owner);
      await gotoApp(c, `/app?project=${c.seed.project.id}`);
      await clickNav(c, "Capture progress");
    },
  },
  {
    id: "18-client-view",
    titleEn: "Client view",
    titleEs: "Vista del cliente",
    captionEn: "Preview exactly what the client sees — progress, budget, deliverables and approved gallery.",
    captionEs: "Previsualiza exactamente lo que ve el cliente — progreso, presupuesto, entregables y galería aprobada.",
    run: async (c) => {
      await c.loginAs(c.seed.owner);
      await gotoApp(c, `/app?project=${c.seed.project.id}`);
      await clickNav(c, "Client view");
    },
  },
  {
    id: "19-billing",
    titleEn: "Billing and subscription",
    titleEs: "Billing y suscripción",
    captionEn: "Manage your plan, see usage against quotas and open the Stripe customer portal from the billing page.",
    captionEs: "Gestiona tu plan, consulta uso vs cuotas y abre el portal de Stripe desde la página de billing.",
    run: async (c) => {
      await c.loginAs(c.seed.owner);
      await gotoApp(c, "/billing");
    },
  },
  {
    id: "20-field-history",
    titleEn: "Field history",
    titleEs: "Historial de campo",
    captionEn: "The field history view shows every captured evidence in chronological order, doubling as a project changelog.",
    captionEs: "La vista de historial de campo muestra cada evidencia capturada en orden cronológico, sirviendo como changelog del proyecto.",
    run: async (c) => {
      await c.loginAs(c.seed.owner);
      await gotoApp(c, `/app?project=${c.seed.project.id}`);
      await clickNav(c, "Field history");
    },
  },
];

// =============================================================
// SUPERVISOR COURSE — 10 chapters, sidebar items + actions
// =============================================================

const supervisorChapters: Chapter[] = [
  {
    id: "01-login",
    titleEn: "Supervisor login",
    titleEs: "Login del supervisor",
    captionEn: "Supervisors log in with the credentials set from their invite email. The login page is shared with all roles.",
    captionEs: "Los supervisores inician sesión con las credenciales creadas desde su email de invitación. La página de login es compartida.",
    run: async (c) => { await gotoApp(c, "/login"); },
  },
  {
    id: "02-review-queue",
    titleEn: "Review queue",
    titleEs: "Cola de revisión",
    captionEn: "The review queue is the home tab for supervisors. Every pending evidence shows up here sorted by task.",
    captionEs: "La cola de revisión es la home del supervisor. Cada evidencia pendiente aparece aquí ordenada por tarea.",
    run: async (c) => {
      await c.loginAs(c.seed.supervisor);
      await gotoApp(c, `/app?project=${c.seed.project.id}`);
      await clickNav(c, "Review queue");
    },
  },
  {
    id: "03-timeline-gantt",
    titleEn: "Timeline Gantt",
    titleEs: "Línea de tiempo Gantt",
    captionEn: "Switch to the Gantt view to plan tasks across days and spot blockers in the critical path.",
    captionEs: "Cambia a la vista Gantt para planear tareas por día y detectar bloqueos en la ruta crítica.",
    run: async (c) => {
      await c.loginAs(c.seed.supervisor);
      await gotoApp(c, `/app?project=${c.seed.project.id}`);
      await clickNav(c, "Timeline Gantt");
    },
  },
  {
    id: "04-expenses",
    titleEn: "Expenses",
    titleEs: "Gastos",
    captionEn: "Supervisors can log expenses and see the project budget consumption in the Expenses panel.",
    captionEs: "Los supervisores pueden registrar gastos y ver el consumo del presupuesto del proyecto en el panel de Gastos.",
    run: async (c) => {
      await c.loginAs(c.seed.supervisor);
      await gotoApp(c, `/app?project=${c.seed.project.id}`);
      await clickNav(c, "Expenses");
    },
  },
  {
    id: "05-daily-log",
    titleEn: "Daily log",
    titleEs: "Bitácora diaria",
    captionEn: "Record what happened on the site every day. The owner and client read this to follow the work.",
    captionEs: "Registra lo que pasa en obra cada día. El owner y el cliente lo leen para seguir el trabajo.",
    run: async (c) => {
      await c.loginAs(c.seed.supervisor);
      await gotoApp(c, `/app?project=${c.seed.project.id}`);
      await clickNav(c, "Daily log");
    },
  },
  {
    id: "06-messages",
    titleEn: "Messages",
    titleEs: "Mensajes",
    captionEn: "Coordinate with helpers and the owner from the project messaging hub.",
    captionEs: "Coordina con helpers y el owner desde el hub de mensajes del proyecto.",
    run: async (c) => {
      await c.loginAs(c.seed.supervisor);
      await gotoApp(c, `/app?project=${c.seed.project.id}`);
      await clickNav(c, "Messages");
    },
  },
  {
    id: "07-cad-files",
    titleEn: "CAD and 3D files",
    titleEs: "Archivos CAD y 3D",
    captionEn: "Open the blueprint viewer to consult the technical files attached to the project.",
    captionEs: "Abre el visor de blueprints para consultar los archivos técnicos adjuntos al proyecto.",
    run: async (c) => {
      await c.loginAs(c.seed.supervisor);
      await gotoApp(c, `/app?project=${c.seed.project.id}`);
      await clickNav(c, "CAD and 3D files");
    },
  },
  {
    id: "08-blueprint-upload",
    titleEn: "Attach a commercial DXF",
    titleEs: "Adjuntar un DXF comercial",
    captionEn: "Supervisors can also upload blueprints. Drop a DXF file from the local machine into the plan viewer.",
    captionEs: "Los supervisores también pueden subir blueprints. Suelta un archivo DXF de la máquina local en el visor.",
    run: async (c) => {
      await c.loginAs(c.seed.supervisor);
      await gotoApp(c, `/app?project=${c.seed.project.id}`);
      await clickNav(c, "CAD and 3D files");
      await uploadFile(c, DXF_COM);
    },
  },
  {
    id: "09-progress-gallery",
    titleEn: "Progress gallery",
    titleEs: "Galería de progreso",
    captionEn: "All approved evidence aggregated into a chronological gallery — useful for site reviews.",
    captionEs: "Toda la evidencia aprobada agregada en una galería cronológica — útil para reviews de obra.",
    run: async (c) => {
      await c.loginAs(c.seed.supervisor);
      await gotoApp(c, `/app?project=${c.seed.project.id}`);
      await clickNav(c, "Progress gallery");
    },
  },
  {
    id: "10-create-task",
    titleEn: "Create a task",
    titleEs: "Crear una tarea",
    captionEn: "Open the new task modal to define a task, assign a helper and set the expected quality spec.",
    captionEs: "Abre el modal de nueva tarea para definir una tarea, asignar un helper y fijar la especificación esperada.",
    run: async (c) => {
      await c.loginAs(c.seed.supervisor);
      await gotoApp(c, `/app?project=${c.seed.project.id}`);
      await clickNav(c, "Review queue");
      await clickButton(c, "New task");
    },
  },
];

// =============================================================
// HELPER COURSE — 6 chapters, matches actual UI surface
// =============================================================

const helperChapters: Chapter[] = [
  {
    id: "01-login",
    titleEn: "Helper login",
    titleEs: "Login del helper",
    captionEn: "Helpers log in from the same login page. The app is mobile-first and works on any modern browser.",
    captionEs: "Los helpers inician sesión desde la misma página. La app es mobile-first y funciona en cualquier navegador moderno.",
    run: async (c) => { await gotoApp(c, "/login"); },
  },
  {
    id: "02-capture-empty",
    titleEn: "Capture progress — empty dropzone",
    titleEs: "Capturar progreso — dropzone vacío",
    captionEn: "The capture view shows the active task card and an empty dropzone ready for the helper's evidence photo.",
    captionEs: "La vista de captura muestra la tarea activa y un dropzone vacío listo para la foto de evidencia del helper.",
    run: async (c) => {
      await c.loginAs(c.seed.helper);
      await gotoApp(c, "/app");
      await clickNav(c, "Capture progress");
    },
  },
  {
    id: "03-photo-preview",
    titleEn: "Photo preview before submit",
    titleEs: "Preview de foto antes de enviar",
    captionEn: "After selecting a site photo the helper sees the full preview, file name pill, and the Submit Evidence button becomes active.",
    captionEs: "Tras seleccionar la foto de obra el helper ve el preview, la píldora con el nombre del archivo y el botón Submit Evidence se activa.",
    run: async (c) => {
      await c.loginAs(c.seed.helper);
      await gotoApp(c, "/app");
      await clickNav(c, "Capture progress");
      await uploadFile(c, REAL_1);
    },
  },
  {
    id: "04-evidence-submitted",
    titleEn: "Evidence submitted",
    titleEs: "Evidencia enviada",
    captionEn: "On submit the backend stores the photo, attaches geolocation from EXIF and queues the AI quality score.",
    captionEs: "Al enviar, el backend guarda la foto, adjunta la geolocalización del EXIF y encola el score de calidad por IA.",
    run: async (c) => {
      await c.loginAs(c.seed.helper);
      await gotoApp(c, "/app");
      await clickNav(c, "Capture progress");
      await uploadFile(c, REAL_1);
      await clickButton(c, "Submit Evidence");
      await wait(c.page, 2000);
    },
  },
  {
    id: "05-history",
    titleEn: "Evidence history",
    titleEs: "Historial de evidencia",
    captionEn: "History lists every evidence the helper has already submitted together with its approval status and AI quality score.",
    captionEs: "El historial lista cada evidencia enviada con su estado de aprobación y el score de calidad por IA.",
    run: async (c) => {
      await c.loginAs(c.seed.helper);
      await gotoApp(c, "/app");
      await clickNav(c, "History");
    },
  },
  {
    id: "06-second-task-preview",
    titleEn: "Second task — photo preview",
    titleEs: "Segunda tarea — preview de foto",
    captionEn: "Back on capture, picking a different photo for another task shows that the flow is identical regardless of which task is active.",
    captionEs: "De vuelta en captura, elegir otra foto para otra tarea muestra que el flujo es idéntico sin importar qué tarea esté activa.",
    run: async (c) => {
      await c.loginAs(c.seed.helper);
      await gotoApp(c, "/app");
      await clickNav(c, "Capture progress");
      await uploadFile(c, REAL_2);
    },
  },
];

// =============================================================
// CLIENT COURSE — 6 chapters
// =============================================================

const clientChapters: Chapter[] = [
  {
    id: "01-login",
    titleEn: "Client login",
    titleEs: "Login del cliente",
    captionEn: "Clients use the same login page as everyone else. They land on a read-only summary of their project.",
    captionEs: "Los clientes usan la misma página de login. Llegan a un resumen de solo-lectura de su proyecto.",
    run: async (c) => { await gotoApp(c, "/login"); },
  },
  {
    id: "02-project-summary",
    titleEn: "Project summary",
    titleEs: "Resumen del proyecto",
    captionEn: "The summary tab shows progress, budget consumption, deliverable status and approved gallery counts at a glance.",
    captionEs: "La pestaña resumen muestra progreso, consumo de presupuesto, estado de entregables y galería aprobada de un vistazo.",
    run: async (c) => {
      await c.loginAs(c.seed.client);
      await gotoApp(c, "/app");
      await clickNav(c, "Project summary");
    },
  },
  {
    id: "03-final-gallery",
    titleEn: "Final gallery",
    titleEs: "Galería final",
    captionEn: "Only evidence approved by the supervisor and marked visible to client lands here. Tap any image for details.",
    captionEs: "Solo la evidencia aprobada por el supervisor y marcada como visible al cliente llega aquí. Toca cualquier imagen para ver detalles.",
    run: async (c) => {
      await c.loginAs(c.seed.client);
      await gotoApp(c, "/app");
      await clickNav(c, "Final gallery");
    },
  },
  {
    id: "04-cad-files",
    titleEn: "CAD and 3D files",
    titleEs: "Archivos CAD y 3D",
    captionEn: "Clients can also browse the technical files attached to their project — but cannot upload new ones.",
    captionEs: "Los clientes también pueden navegar los archivos técnicos del proyecto — pero no pueden subir nuevos.",
    run: async (c) => {
      await c.loginAs(c.seed.client);
      await gotoApp(c, "/app");
      await clickNav(c, "CAD and 3D files");
    },
  },
  {
    id: "05-deliverable-detail",
    titleEn: "Deliverable detail",
    titleEs: "Detalle del entregable",
    captionEn: "Click a deliverable card to see all related evidence and the approval state for each item.",
    captionEs: "Haz clic en la tarjeta de un entregable para ver toda la evidencia relacionada y el estado de aprobación de cada ítem.",
    run: async (c) => {
      await c.loginAs(c.seed.client);
      await gotoApp(c, "/app");
      await clickNav(c, "Project summary");
      await c.page.locator('[data-testid="deliverable-card"], button:has-text("Entrega")').first().click({ timeout: 3000 }).catch(() => {});
      await wait(c.page, 600);
    },
  },
  {
    id: "06-billing-portal",
    titleEn: "Billing visibility",
    titleEs: "Visibilidad de billing",
    captionEn: "Even read-only roles can preview the billing page if their owner has shared the link — useful for procurement.",
    captionEs: "Incluso roles de solo-lectura pueden previsualizar la página de billing si su owner compartió el enlace — útil para procurement.",
    run: async (c) => {
      await c.loginAs(c.seed.client);
      await gotoApp(c, "/billing");
    },
  },
];

// =============================================================
// PLATFORM ADMIN COURSE — 6 chapters
// =============================================================

const platformChapters: Chapter[] = [
  {
    id: "01-login",
    titleEn: "Platform admin login",
    titleEs: "Login del admin de plataforma",
    captionEn: "Platform admins use the same login form with a special account that has no tenant attached.",
    captionEs: "Los admins de plataforma usan el mismo formulario de login con una cuenta especial sin tenant.",
    run: async (c) => { await gotoApp(c, "/login"); },
  },
  {
    id: "02-overview",
    titleEn: "Operator console overview",
    titleEs: "Vista general de la consola",
    captionEn: "The operator console aggregates platform-wide metrics: MRR, tenants, users, active subs and trialing accounts.",
    captionEs: "La consola operativa agrega métricas globales: MRR, tenants, usuarios, suscripciones activas y trials.",
    run: async (c) => {
      await c.loginAs(c.seed.platformAdmin);
      await gotoApp(c, "/platform");
    },
  },
  {
    id: "03-tenants-list",
    titleEn: "Tenants list",
    titleEs: "Lista de tenants",
    captionEn: "Browse every registered company. Filter by plan, status or search by name from this table.",
    captionEs: "Navega cada empresa registrada. Filtra por plan, estado o busca por nombre desde esta tabla.",
    run: async (c) => {
      await c.loginAs(c.seed.platformAdmin);
      await gotoApp(c, "/platform");
      await c.page.locator('input[type="search"], input[placeholder*="search" i]').first().fill("course").catch(() => {});
      await wait(c.page, 500);
    },
  },
  {
    id: "04-tenant-detail",
    titleEn: "Tenant detail",
    titleEs: "Detalle de un tenant",
    captionEn: "Click a tenant row to drill into its users, subscription, usage and recent activity.",
    captionEs: "Haz clic en una fila de tenant para entrar a sus usuarios, suscripción, uso y actividad reciente.",
    run: async (c) => {
      await c.loginAs(c.seed.platformAdmin);
      await gotoApp(c, "/platform");
      await c.page.locator(`text=${c.seed.tenantSlug}`).first().click({ timeout: 3000 }).catch(() => {});
      await wait(c.page, 700);
    },
  },
  {
    id: "05-suspend",
    titleEn: "Suspend a tenant",
    titleEs: "Suspender un tenant",
    captionEn: "Suspension blocks writes for every user in the tenant while keeping the data available for later recovery.",
    captionEs: "La suspensión bloquea escrituras para todos los usuarios del tenant y mantiene los datos disponibles.",
    run: async (c) => {
      await c.loginAs(c.seed.platformAdmin);
      await gotoApp(c, "/platform");
      await c.page.locator(`text=${c.seed.tenantSlug}`).first().click({ timeout: 3000 }).catch(() => {});
      await clickButton(c, "Suspend");
    },
  },
  {
    id: "06-metrics",
    titleEn: "Metrics and usage",
    titleEs: "Métricas y uso",
    captionEn: "Track how the platform is growing and where capacity is tight. Useful for infrastructure capacity planning.",
    captionEs: "Rastrea cómo crece la plataforma y dónde la capacidad está ajustada. Útil para planeación de infra.",
    run: async (c) => {
      await c.loginAs(c.seed.platformAdmin);
      await gotoApp(c, "/platform");
      await c.page.locator('button:has-text("Metrics"), button:has-text("Métricas")').first().click({ timeout: 3000 }).catch(() => {});
      await wait(c.page, 700);
    },
  },
];

// =============================================================
// COURSES
// =============================================================

export const COURSES: Course[] = [
  {
    role: "owner",
    slug: "owner-course",
    titleEn: "Owner Course",
    titleEs: "Curso Owner",
    introEn: "This course walks through every screen an owner uses to run their construction company on ProjectPulse.",
    introEs: "Este curso recorre cada pantalla que un owner usa para operar su constructora en ProjectPulse.",
    audienceEn: "Company owners and top-level administrators. You decide budgets, invite the team and approve deliverables.",
    audienceEs: "Dueños de empresa y administradores de alto nivel. Tú decides presupuestos, invitas al equipo y apruebas entregables.",
    prerequisitesEn: "You should have signed up and received your initial login credentials.",
    prerequisitesEs: "Ya debes haberte registrado y tener tus credenciales iniciales.",
    chapters: ownerChapters,
  },
  {
    role: "supervisor",
    slug: "supervisor-course",
    titleEn: "Supervisor Course",
    titleEs: "Curso Supervisor",
    introEn: "Everything a supervisor needs to manage helpers, review evidence and keep projects on spec.",
    introEs: "Todo lo que necesitas como supervisor para gestionar helpers, revisar evidencias y mantener los proyectos en spec.",
    audienceEn: "Site supervisors responsible for quality control and helper coordination.",
    audienceEs: "Supervisores de obra responsables del control de calidad y coordinación de helpers.",
    prerequisitesEn: "You need an invitation from your company owner. Check your email before starting.",
    prerequisitesEs: "Necesitas una invitación del owner de tu empresa. Revisa tu email antes de comenzar.",
    chapters: supervisorChapters,
  },
  {
    role: "helper",
    slug: "helper-course",
    titleEn: "Helper Course",
    titleEs: "Curso Helper",
    introEn: "Step-by-step guide for field workers executing tasks and uploading evidence from the site.",
    introEs: "Guía paso a paso para operadores de campo que ejecutan tareas y suben evidencia desde obra.",
    audienceEn: "Field workers assigned to specific tasks inside a project.",
    audienceEs: "Operadores de campo asignados a tareas específicas dentro de un proyecto.",
    prerequisitesEn: "You need an invitation from your supervisor and a phone with camera and location enabled.",
    prerequisitesEs: "Necesitas una invitación de tu supervisor y un teléfono con cámara y ubicación activadas.",
    chapters: helperChapters,
  },
  {
    role: "client",
    slug: "client-course",
    titleEn: "Client Course",
    titleEs: "Curso Cliente",
    introEn: "How to follow your project, review approved evidence, track budget and approve deliverables.",
    introEs: "Cómo seguir tu proyecto, revisar evidencias aprobadas, vigilar el presupuesto y aprobar entregables.",
    audienceEn: "Clients hiring a construction company that uses ProjectPulse.",
    audienceEs: "Clientes que contratan a una constructora que usa ProjectPulse.",
    prerequisitesEn: "Your company owner needs to invite you first. Look for the invitation email in your inbox.",
    prerequisitesEs: "El owner de la empresa debe invitarte primero. Busca el email de invitación en tu bandeja.",
    chapters: clientChapters,
  },
  {
    role: "platform_admin",
    slug: "platform-admin-course",
    titleEn: "Platform Admin Course",
    titleEs: "Curso Platform Admin",
    introEn: "Operational guide for ProjectPulse platform operators managing tenants and global metrics.",
    introEs: "Guía operativa para los operadores de la plataforma ProjectPulse que gestionan tenants y métricas globales.",
    audienceEn: "Internal staff with platform admin credentials.",
    audienceEs: "Personal interno con credenciales de platform admin.",
    prerequisitesEn: "You need a platform admin account — these are provisioned outside of the normal signup flow.",
    prerequisitesEs: "Necesitas una cuenta de platform admin — se provisionan fuera del flujo normal de signup.",
    chapters: platformChapters,
  },
];
