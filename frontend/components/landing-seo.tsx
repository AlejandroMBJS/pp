import { PLANS } from "../lib/plans";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://projpul.com";

const features = [
  {
    title: "Geolocated photo evidence",
    body: "Field captures with coordinates and timestamps. Every photo is tied to a task and to a responsible user.",
  },
  {
    title: "AI-powered audits",
    body: "Automated quality review of deliverables with a score and actionable feedback.",
  },
  {
    title: "Multi-tenant RBAC",
    body: "Admin, owner, supervisor, helper and client roles with strict per-company isolation.",
  },
  {
    title: "Client workflows",
    body: "Client portal to review progress, approve deliverables and download reports.",
  },
  {
    title: "Blueprints and plans",
    body: "Upload blueprints (DWG, DXF, PDF) and link tasks to specific zones of the project.",
  },
  {
    title: "Exports and reports",
    body: "CSV reports and executive summaries to share with stakeholders.",
  },
];

const plans = PLANS.map((p) => ({
  name: p.name,
  price: p.priceSuffix ? `${p.priceDisplay} ${p.priceSuffix}` : p.priceDisplay,
  blurb: p.tagline,
}));

export function LandingSeo() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name: "ProjectPulse",
        url: siteUrl,
        logo: `${siteUrl}/og-image.png`,
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${siteUrl}/#software`,
        name: "ProjectPulse",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description:
          "Multi-tenant CRM and quality-control platform for technical projects with geolocated evidence and AI-powered audits.",
        offers: {
          "@type": "AggregateOffer",
          priceCurrency: "USD",
          lowPrice: "0",
          highPrice: String(Math.max(...PLANS.map((p) => p.priceAmount ?? 0))),
          offerCount: plans.length,
        },
        publisher: { "@id": `${siteUrl}/#organization` },
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: siteUrl,
        name: "ProjectPulse",
        publisher: { "@id": `${siteUrl}/#organization` },
        inLanguage: "en-US",
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <section className="sr-only" aria-hidden="false">
        <h1>ProjectPulse — Strategic control for technical projects</h1>
        <p>
          Multi-tenant platform for CRM, quality control and supervision of technical projects.
          Digitize, supervise and scale any field operation from a single console with geolocated
          photo evidence, AI-powered automated audits and role-based approval workflows.
        </p>
        <h2>Key features</h2>
        <ul>
          {features.map((f) => (
            <li key={f.title}>
              <strong>{f.title}:</strong> {f.body}
            </li>
          ))}
        </ul>
        <h2>Plans</h2>
        <ul>
          {plans.map((p) => (
            <li key={p.name}>
              <strong>{p.name}</strong> — {p.price}. {p.blurb}
            </li>
          ))}
        </ul>
        <h2>Who it's for</h2>
        <p>
          Construction firms, architecture studios, site supervisors, field technical services,
          installers and consultancies that need verifiable traceability of every deliverable.
        </p>
        <h2>How to get started</h2>
        <p>
          Create a free account with a 14-day trial, invite your team, register your projects and
          start capturing evidence from day one.
        </p>
      </section>
    </>
  );
}
