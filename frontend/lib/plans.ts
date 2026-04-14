export type PlanId = "starter" | "professional" | "business" | "enterprise";
export type PlanCta = "signup" | "checkout" | "contact";

export type Plan = {
  id: PlanId;
  priceAmount: number | null;
  priceDisplay: string;
  interval: "month" | "custom";
  cta: PlanCta;
  highlight?: boolean;
};

export const PLANS: Plan[] = [
  // {
  //   id: "starter",
  //   priceAmount: 0,
  //   priceDisplay: "$0",
  //   interval: "month",
  //   cta: "signup",
  // },
  {
    id: "professional",
    priceAmount: 49,
    priceDisplay: "$49",
    interval: "month",
    cta: "checkout",
    highlight: true,
  },
  {
    id: "business",
    priceAmount: 149,
    priceDisplay: "$149",
    interval: "month",
    cta: "checkout",
  },
  {
    id: "enterprise",
    priceAmount: null,
    priceDisplay: "Custom",
    interval: "custom",
    cta: "contact",
  },
];

export const PAID_PLANS = PLANS.filter((p) => p.id !== "starter");

export function planById(id: PlanId): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}
