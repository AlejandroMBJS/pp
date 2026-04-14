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
    title: "CAD and 3D viewer",
    body: "Upload DWG, DXF, PDF, STL, 3MF and GLB. View 2D blueprints and 3D models (prints, machined parts, jewelry) and link tasks to project zones.",
  },
  {
    title: "Exports and reports",
    body: "CSV reports and executive summaries to share with stakeholders.",
  },
];

const PLAN_SEO: Record<string, { name: string; blurb: string }> = {
  starter: { name: "Starter", blurb: "Try the platform, no credit card." },
  professional: { name: "Professional", blurb: "For SMBs with 1–5 concurrent projects." },
  business: { name: "Business", blurb: "For mid-size firms with multiple projects." },
  enterprise: { name: "Enterprise", blurb: "For organizations needing dedicated infrastructure and custom SLAs." },
};

const plans = PLANS.map((p) => ({
  name: PLAN_SEO[p.id].name,
  price: p.priceAmount === null ? p.priceDisplay : `${p.priceDisplay} USD/month`,
  blurb: PLAN_SEO[p.id].blurb,
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
          "Project control for technical teams shipping physical parts — construction, architecture, jewelry, 3D printing, CNC machining, installations, prototyping and digital fabrication. CAD/3D viewer (DWG, DXF, STL, 3MF), geolocated evidence and AI audits.",
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
          Project control for technical teams shipping physical parts — from the job site to the
          CNC shop. Construction, architecture, jewelry, 3D printing, CNC machining, installations,
          prototyping and digital fabrication in one console with CAD/3D viewer (DWG, DXF, STL,
          3MF, GLB), geolocated evidence, AI audits and client approval.
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
          Construction firms, architecture studios, jewelry workshops, 3D printing labs, CNC
          machining shops, installation teams, rapid prototyping studios and digital fabrication
          outfits that need verifiable traceability of every deliverable.
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
