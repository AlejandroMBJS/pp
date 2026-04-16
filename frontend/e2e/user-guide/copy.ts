export type Locale = "en" | "es";

export type FAQ = { q: string; a: string };

export type CopyBundle = {
  coverTitle: string;
  coverSubtitle: string;
  audienceHeading: string;
  prerequisitesHeading: string;
  tocHeading: string;
  chapterLabel: string;
  faqHeading: string;
  generatedOn: string;
};

export const BUNDLE: Record<Locale, CopyBundle> = {
  en: {
    coverTitle: "ProjectPulse",
    coverSubtitle: "Role-based course",
    audienceHeading: "Who is this course for?",
    prerequisitesHeading: "Before you start",
    tocHeading: "Table of contents",
    chapterLabel: "Chapter",
    faqHeading: "Troubleshooting & FAQ",
    generatedOn: "Generated on",
  },
  es: {
    coverTitle: "ProjectPulse",
    coverSubtitle: "Curso por rol",
    audienceHeading: "¿Para quién es este curso?",
    prerequisitesHeading: "Antes de empezar",
    tocHeading: "Tabla de contenidos",
    chapterLabel: "Capítulo",
    faqHeading: "Solución de problemas y FAQ",
    generatedOn: "Generado el",
  },
};

export const FAQS: Record<string, { en: FAQ[]; es: FAQ[] }> = {
  owner: {
    en: [
      { q: "My supervisor never received the invitation email.", a: "Ask them to check spam. From Users tab, click Resend invite next to their name." },
      { q: "Can I have more than one client on a project?", a: "Not in the current MVP. Reach out to support for early access to multi-client projects." },
      { q: "How do I cancel my subscription?", a: "Go to Settings → Billing → Manage subscription → Cancel. Your data stays read-only until the end of the billing period." },
      { q: "What happens if I hit my project or storage quota?", a: "Uploads are blocked until you upgrade or archive old projects. No data is deleted automatically." },
      { q: "Can I change the project budget after creation?", a: "Yes. Open Financial Control → Budget adjustments, add a positive or negative adjustment with a reason." },
    ],
    es: [
      { q: "Mi supervisor no recibió el email de invitación.", a: "Pídele que revise spam. Desde Users puedes hacer clic en Reenviar invitación junto a su nombre." },
      { q: "¿Puedo tener más de un cliente en un proyecto?", a: "No en el MVP actual. Escribe a soporte si necesitas acceso temprano a proyectos multi-cliente." },
      { q: "¿Cómo cancelo mi suscripción?", a: "Settings → Billing → Manage subscription → Cancel. Tus datos quedan en modo solo-lectura hasta fin del periodo." },
      { q: "¿Qué pasa si llego al límite de proyectos o almacenamiento?", a: "Los uploads se bloquean hasta que subas de plan o archives proyectos viejos. Nada se borra automáticamente." },
      { q: "¿Puedo cambiar el presupuesto del proyecto después de crearlo?", a: "Sí. Abre Control Financiero → Ajustes de presupuesto, y agrega un ajuste positivo o negativo con un motivo." },
    ],
  },
  supervisor: {
    en: [
      { q: "I can see the project but can't create tasks.", a: "Only the owner can assign you as supervisor. Ask them to open the project and set you in the Supervisor field." },
      { q: "A helper uploaded blurry evidence. What's the right action?", a: "Reject with a clear comment describing what's missing. The helper gets notified and can re-upload on the same task." },
      { q: "How do I change the helper on an existing task?", a: "Open the task → edit → change the assignee. The previous helper loses access to that task only." },
      { q: "Evidence auto-approved with a low score. Why?", a: "AI audits never auto-approve below 80. If you see that, the AI was disabled or the image was flagged — always review manually." },
    ],
    es: [
      { q: "Veo el proyecto pero no puedo crear tareas.", a: "Solo el owner puede asignarte como supervisor. Pídele que abra el proyecto y te ponga en el campo Supervisor." },
      { q: "Un helper subió evidencia borrosa. ¿Qué hago?", a: "Rechaza con un comentario claro describiendo lo que falta. El helper recibe notificación y puede volver a subir en la misma tarea." },
      { q: "¿Cómo cambio el helper de una tarea existente?", a: "Abre la tarea → editar → cambia el asignado. El helper anterior pierde acceso solo a esa tarea." },
      { q: "La evidencia se auto-aprobó con score bajo. ¿Por qué?", a: "Las auditorías IA nunca auto-aprueban debajo de 80. Si lo ves, la IA estaba deshabilitada o la imagen fue marcada — siempre revísala a mano." },
    ],
  },
  helper: {
    en: [
      { q: "The app says I'm outside the geofence.", a: "Move closer to the project site. The geofence is set by the owner when the project is created." },
      { q: "My photo upload failed mid-way.", a: "Retry from the same task. Partial uploads are discarded automatically." },
      { q: "Can I delete an evidence I uploaded by mistake?", a: "Yes, while it's still Pending. Once approved, ask your supervisor to remove it." },
      { q: "I don't see any assigned tasks.", a: "Your supervisor hasn't assigned anything yet. Ping them in the Messaging Hub." },
    ],
    es: [
      { q: "La app dice que estoy fuera de la geocerca.", a: "Acércate a la obra. La geocerca la define el owner al crear el proyecto." },
      { q: "Se cortó el upload de mi foto.", a: "Vuelve a intentar desde la misma tarea. Los uploads parciales se descartan automáticamente." },
      { q: "¿Puedo borrar una evidencia que subí por error?", a: "Sí, mientras esté en Pendiente. Una vez aprobada, pide a tu supervisor que la quite." },
      { q: "No veo tareas asignadas.", a: "Tu supervisor no te ha asignado nada aún. Escríbele en Messaging Hub." },
    ],
  },
  client: {
    en: [
      { q: "Why don't I see every photo the team uploaded?", a: "You only see approved evidence marked visible to client. Ask the supervisor if you expected to see more." },
      { q: "I approved a deliverable by mistake.", a: "Contact the owner. Approvals are timestamped and reversing one needs owner confirmation." },
      { q: "Where do I see the full invoice breakdown?", a: "Open Budget Tracker on the project summary. Line-item expenses show there." },
      { q: "Can I message the supervisor directly?", a: "Yes, through the Messaging Hub tab from your project view." },
    ],
    es: [
      { q: "¿Por qué no veo todas las fotos que subió el equipo?", a: "Solo ves evidencias aprobadas y marcadas como visibles al cliente. Pregúntale al supervisor si esperabas ver más." },
      { q: "Aprobé un entregable por error.", a: "Contacta al owner. Las aprobaciones quedan con timestamp y revertirlas requiere confirmación del owner." },
      { q: "¿Dónde veo el desglose completo de gastos?", a: "Abre Budget Tracker en el resumen del proyecto. Ahí aparecen los gastos línea por línea." },
      { q: "¿Puedo escribirle al supervisor directamente?", a: "Sí, desde la pestaña Messaging Hub en la vista del proyecto." },
    ],
  },
  platform_admin: {
    en: [
      { q: "A tenant can't log in and says Stripe blocked them.", a: "Check billing status in Tenant detail. Statuses past_due, paused, unpaid and incomplete_expired all block writes by design." },
      { q: "How do I impersonate a user for support?", a: "Impersonation is not enabled in the MVP. Request their consent and use their credentials over a secure channel." },
      { q: "Where are audit logs?", a: "Audit log tab under each tenant shows the last 100 actions. Full log lives in structured backend logs." },
    ],
    es: [
      { q: "Un tenant no puede iniciar sesión, dice que Stripe lo bloqueó.", a: "Revisa el estado de billing en el detalle del tenant. past_due, paused, unpaid e incomplete_expired bloquean escrituras por diseño." },
      { q: "¿Cómo impersono a un usuario para soporte?", a: "La impersonación no está habilitada en el MVP. Pide consentimiento y usa sus credenciales por un canal seguro." },
      { q: "¿Dónde veo los logs de auditoría?", a: "La pestaña Audit log dentro de cada tenant muestra las últimas 100 acciones. El log completo vive en los logs estructurados del backend." },
    ],
  },
};
