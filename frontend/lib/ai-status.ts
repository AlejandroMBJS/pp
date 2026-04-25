export type AIStatus =
  | "not_requested"
  | "queued"
  | "processing"
  | "completed"
  | "needs_review"
  | "disabled";

export type AIStatusColor = "amber" | "blue" | "green" | "red" | "gray";

export function aiStatusLabel(status: string): string {
  switch (status) {
    case "not_requested": return "IA no solicitada";
    case "queued": return "IA en cola";
    case "processing": return "IA procesando";
    case "completed": return "IA auditada";
    case "needs_review": return "Revisión manual";
    case "disabled": return "IA deshabilitada";
    default: return status ? `IA: ${status}` : "IA";
  }
}

export function aiStatusColor(status: string): AIStatusColor {
  switch (status) {
    case "completed": return "green";
    case "processing":
    case "queued": return "blue";
    case "needs_review": return "amber";
    case "disabled": return "red";
    default: return "gray";
  }
}

export function aiStatusTooltip(status: string): string {
  switch (status) {
    case "not_requested":
      return "No se solicitó auditoría de IA para esta evidencia.";
    case "queued":
      return "Esta evidencia está en cola para ser auditada por la IA. Revisa en unos segundos.";
    case "processing":
      return "La IA está analizando esta evidencia en este momento.";
    case "completed":
      return "La IA terminó de auditar esta evidencia. Revisa el score y el feedback.";
    case "needs_review":
      return "La IA no pudo completar la auditoría. Requiere revisión manual. Puedes reintentar con el botón Re-auditar.";
    case "disabled":
      return "IA deshabilitada en el momento de la subida (GEMINI_API_KEY no configurada). Usa Re-auditar para reintentar.";
    default:
      return "";
  }
}

export function aiStatusPillClasses(status: string): string {
  const color = aiStatusColor(status);
  switch (color) {
    case "green": return "bg-green-500/10 text-green-400 border-green-500/30";
    case "amber": return "bg-amber-500/10 text-amber-400 border-amber-500/30";
    case "red":   return "bg-red-500/10 text-red-400 border-red-500/30";
    case "blue":  return "bg-blue-500/10 text-blue-400 border-blue-500/30";
    default:      return "bg-white/5 text-white/60 border-white/10";
  }
}

export function canReAudit(status: string): boolean {
  return status === "disabled" || status === "needs_review" || status === "not_requested";
}
