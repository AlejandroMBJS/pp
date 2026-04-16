import { Fragment } from "react";
import { getTranslations } from "next-intl/server";
import { Check, Minus } from "lucide-react";

type Plan = "professional" | "business" | "enterprise";
const PLAN_ORDER: Plan[] = ["professional", "business", "enterprise"];

type Row =
  | { kind: "value"; key: string; valueKey: string }
  | { kind: "bool"; key: string; values: Record<Plan, boolean> };

type Section = { id: string; rows: Row[] };

const SECTIONS: Section[] = [
  {
    id: "limits",
    rows: [
      { kind: "value", key: "projects", valueKey: "projectsValue" },
      { kind: "value", key: "users", valueKey: "usersValue" },
      { kind: "value", key: "clients", valueKey: "clientsValue" },
      { kind: "value", key: "evidence", valueKey: "evidenceValue" },
      { kind: "value", key: "storage", valueKey: "storageValue" },
    ],
  },
  {
    id: "core",
    rows: [
      { kind: "bool", key: "tasks",           values: { professional: true,  business: true,  enterprise: true  } },
      { kind: "bool", key: "geoEvidence",     values: { professional: true,  business: true,  enterprise: true  } },
      { kind: "bool", key: "blueprints",      values: { professional: true,  business: true,  enterprise: true  } },
      { kind: "bool", key: "zones",           values: { professional: true,  business: true,  enterprise: true  } },
      { kind: "bool", key: "clientPortal",    values: { professional: true,  business: true,  enterprise: true  } },
      { kind: "bool", key: "publicDashboard", values: { professional: false, business: true,  enterprise: true  } },
      { kind: "bool", key: "csv",             values: { professional: true,  business: true,  enterprise: true  } },
      { kind: "bool", key: "pdf",             values: { professional: true,  business: true,  enterprise: true  } },
    ],
  },
  {
    id: "ai",
    rows: [
      { kind: "bool", key: "aiAudit",    values: { professional: true,  business: true,  enterprise: true  } },
      { kind: "bool", key: "aiInsights", values: { professional: false, business: true,  enterprise: true  } },
    ],
  },
  {
    id: "billing",
    rows: [
      { kind: "bool", key: "stripe",  values: { professional: true,  business: true,  enterprise: true  } },
      { kind: "bool", key: "webhook", values: { professional: false, business: true,  enterprise: true  } },
      { kind: "bool", key: "api",     values: { professional: false, business: true,  enterprise: true  } },
      { kind: "bool", key: "sso",     values: { professional: false, business: false, enterprise: true  } },
    ],
  },
  {
    id: "support",
    rows: [
      { kind: "bool", key: "emailSupport",    values: { professional: true,  business: true,  enterprise: true  } },
      { kind: "bool", key: "prioritySupport", values: { professional: false, business: true,  enterprise: true  } },
      { kind: "bool", key: "dedicatedCSM",    values: { professional: false, business: false, enterprise: true  } },
      { kind: "bool", key: "customSLA",       values: { professional: false, business: false, enterprise: true  } },
      { kind: "bool", key: "msa",             values: { professional: false, business: false, enterprise: true  } },
      { kind: "bool", key: "dataResidency",   values: { professional: false, business: false, enterprise: true  } },
    ],
  },
];

export async function ComparisonTable({ locale }: { locale: string }) {
  const t  = await getTranslations({ locale, namespace: "pricing" });
  const tp = await getTranslations({ locale, namespace: "plans" });

  const planLabels = PLAN_ORDER.map((p) => ({ id: p, name: tp(`${p}.name`) }));

  return (
    <section className="max-w-6xl mx-auto px-6 py-20">
      <div className="text-center mb-10">
        <h2 className="text-3xl md:text-4xl font-black mb-3">{t("compareTitle")}</h2>
        <p className="text-white/60 max-w-2xl mx-auto text-sm">{t("compareSubtitle")}</p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left px-6 py-4 font-semibold text-white/70 w-1/3">&nbsp;</th>
              {planLabels.map((p) => (
                <th
                  key={p.id}
                  className={`px-6 py-4 font-bold text-center ${p.id === "professional" ? "text-cyan-300" : "text-white"}`}
                >
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SECTIONS.map((section) => (
              <Fragment key={section.id}>
                <tr className="bg-white/[0.03]">
                  <td
                    colSpan={PLAN_ORDER.length + 1}
                    className="px-6 py-3 text-[11px] uppercase tracking-widest font-bold text-cyan-400"
                  >
                    {t(`categories.${section.id}`)}
                  </td>
                </tr>
                {section.rows.map((row) => (
                  <tr key={`${section.id}-${row.key}`} className="border-t border-white/5">
                    <td className="px-6 py-3 text-white/80">{t(`rows.${row.key}`)}</td>
                    {PLAN_ORDER.map((plan) => (
                      <td key={plan} className="px-6 py-3 text-center">
                        {row.kind === "value" ? (
                          <span className="text-white font-medium">
                            {t(`rows.${row.valueKey}.${plan}`)}
                          </span>
                        ) : row.values[plan] ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-cyan-500/15 text-cyan-300" aria-label={t("included")}>
                            <Check size={14} strokeWidth={3} />
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white/5 text-white/30" aria-label={t("notIncluded")}>
                            <Minus size={14} />
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
