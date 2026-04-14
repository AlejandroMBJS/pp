export type PlanId = "starter" | "professional" | "business" | "enterprise";
export type PlanCta = "signup" | "checkout" | "contact";

export type Plan = {
  id: PlanId;
  name: string;
  tagline: string;
  priceAmount: number | null;
  priceDisplay: string;
  priceSuffix: string;
  interval: "month" | "custom";
  features: string[];
  cta: PlanCta;
  ctaLabel: string;
  highlight?: boolean;
};

export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    tagline: "Prueba la plataforma sin tarjeta",
    priceAmount: 0,
    priceDisplay: "$0",
    priceSuffix: "USD/mes",
    interval: "month",
    features: [
      "1 proyecto activo",
      "3 usuarios internos",
      "50 capturas/mes",
      "1 GB storage",
      "Exportes CSV",
    ],
    cta: "signup",
    ctaLabel: "Empezar gratis",
  },
  {
    id: "professional",
    name: "Professional",
    tagline: "Para PYMES con 1–5 proyectos simultáneos",
    priceAmount: 49,
    priceDisplay: "$49",
    priceSuffix: "USD/mes",
    interval: "month",
    features: [
      "5 proyectos activos",
      "15 usuarios internos",
      "500 capturas/mes",
      "10 GB storage",
      "Subir planos CAD",
      "Quality score IA",
      "Exportes CSV/PDF",
    ],
    cta: "checkout",
    ctaLabel: "Elegir Professional",
    highlight: true,
  },
  {
    id: "business",
    name: "Business",
    tagline: "Para empresas medianas con múltiples proyectos",
    priceAmount: 149,
    priceDisplay: "$149",
    priceSuffix: "USD/mes",
    interval: "month",
    features: [
      "20 proyectos activos",
      "50 usuarios internos",
      "2,000 capturas/mes",
      "50 GB storage",
      "AI Predictions",
      "API Access",
      "Audit log",
    ],
    cta: "checkout",
    ctaLabel: "Elegir Business",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "Para grandes constructoras y firmas",
    priceAmount: null,
    priceDisplay: "Custom",
    priceSuffix: "",
    interval: "custom",
    features: [
      "Proyectos ilimitados",
      "Usuarios ilimitados",
      "500 GB storage",
      "SSO/SAML",
      "White-label",
      "Soporte 24/7",
      "SLA 99.9%",
    ],
    cta: "contact",
    ctaLabel: "Contactar ventas",
  },
];

export const PAID_PLANS = PLANS.filter((p) => p.id !== "starter");

export function planById(id: PlanId): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}
