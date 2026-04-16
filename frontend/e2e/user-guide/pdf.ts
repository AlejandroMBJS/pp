import type { BrowserContext } from "@playwright/test";
import fs from "fs";
import path from "path";
import { BUNDLE, FAQS, Locale } from "./copy";
import { readPngAsDataUri } from "./capture";
import type { Course, Chapter } from "./courses";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const BRAND = {
  name: "ProjectPulse",
  tagline: { en: "Field quality, delivered.", es: "Calidad en obra, entregada." },
  accent: "#6366f1",
  accentDark: "#4338ca",
  ink: "#0b1120",
  inkSoft: "#1f2937",
  muted: "#64748b",
  line: "#e2e8f0",
  bg: "#f8fafc",
};

const ROLE_BADGE: Record<string, { en: string; es: string; hue: string }> = {
  owner: { en: "OWNER PROGRAM", es: "PROGRAMA OWNER", hue: "#6366f1" },
  supervisor: { en: "SUPERVISOR PROGRAM", es: "PROGRAMA SUPERVISOR", hue: "#0ea5e9" },
  helper: { en: "FIELD OPERATOR PROGRAM", es: "PROGRAMA OPERADOR DE CAMPO", hue: "#f59e0b" },
  client: { en: "CLIENT PROGRAM", es: "PROGRAMA CLIENTE", hue: "#10b981" },
  platform_admin: { en: "PLATFORM ADMIN PROGRAM", es: "PROGRAMA ADMIN DE PLATAFORMA", hue: "#ef4444" },
};

export function renderCourseHTML(
  course: Course,
  locale: Locale,
  artifactsDir: string,
): string {
  const bundle = BUNDLE[locale];
  const title = locale === "en" ? course.titleEn : course.titleEs;
  const intro = locale === "en" ? course.introEn : course.introEs;
  const audience = locale === "en" ? course.audienceEn : course.audienceEs;
  const prereq = locale === "en" ? course.prerequisitesEn : course.prerequisitesEs;
  const faqs = (FAQS[course.role] ?? { en: [], es: [] })[locale];
  const badge = ROLE_BADGE[course.role] ?? ROLE_BADGE.owner;
  const badgeLabel = locale === "en" ? badge.en : badge.es;
  const tagline = BRAND.tagline[locale];

  const chaptersHTML = course.chapters
    .map((ch, i) => {
      const imgPath = path.join(artifactsDir, `${ch.id}.png`);
      const dataUri = fs.existsSync(imgPath) ? readPngAsDataUri(imgPath) : "";
      const t = locale === "en" ? ch.titleEn : ch.titleEs;
      const cap = locale === "en" ? ch.captionEn : ch.captionEs;
      const num = String(i + 1).padStart(2, "0");
      const imgTag = dataUri
        ? `<img src="${dataUri}" alt="${esc(t)}"/>`
        : `<div class="missing">[screenshot missing: ${esc(ch.id)}]</div>`;
      return `
        <section class="chapter">
          <div class="chapter-head">
            <span class="chapter-num">${num}</span>
            <div class="chapter-meta">
              <div class="chapter-kicker">${esc(bundle.chapterLabel)} ${i + 1} · ${esc(badgeLabel)}</div>
              <h2>${esc(t)}</h2>
            </div>
          </div>
          <div class="shot">${imgTag}</div>
          <p class="caption">${esc(cap)}</p>
        </section>`;
    })
    .join("\n");

  const tocItems = course.chapters
    .map((ch, i) => {
      const num = String(i + 1).padStart(2, "0");
      return `<li><span class="toc-num">${num}</span><span class="toc-title">${esc(
        locale === "en" ? ch.titleEn : ch.titleEs,
      )}</span></li>`;
    })
    .join("\n");

  const faqHTML = faqs
    .map(
      (f) =>
        `<div class="faq-item"><p class="q"><span class="q-mark">Q</span>${esc(f.q)}</p><p class="a"><span class="a-mark">A</span>${esc(f.a)}</p></div>`,
    )
    .join("\n");

  const genDate = new Date().toISOString().slice(0, 10);

  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8"/>
<title>${esc(title)} — ${BRAND.name}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, "SF Pro Display", "Segoe UI", Inter, Roboto, sans-serif;
    color: ${BRAND.ink};
    line-height: 1.5;
    font-size: 12px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  h1, h2, h3 { margin: 0; font-weight: 700; letter-spacing: -0.01em; }
  p { margin: 0 0 10px; }

  /* ---------- COVER ---------- */
  .cover {
    position: relative;
    height: 297mm;
    width: 210mm;
    background:
      radial-gradient(1200px 600px at 80% -10%, ${badge.hue}33 0%, transparent 60%),
      radial-gradient(900px 500px at -10% 110%, ${BRAND.accent}22 0%, transparent 60%),
      linear-gradient(180deg, #0b1120 0%, #0f172a 55%, #111827 100%);
    color: #fff;
    page-break-after: always;
    overflow: hidden;
  }
  .cover::before {
    content: "";
    position: absolute; inset: 0;
    background-image:
      linear-gradient(${badge.hue}10 1px, transparent 1px),
      linear-gradient(90deg, ${badge.hue}10 1px, transparent 1px);
    background-size: 28px 28px;
    opacity: 0.35;
  }
  .cover-inner { position: relative; padding: 30mm 22mm; height: 100%; display: flex; flex-direction: column; }
  .brand-row { display: flex; align-items: center; gap: 14px; }
  .logo-dot {
    width: 36px; height: 36px; border-radius: 10px;
    background: linear-gradient(135deg, ${badge.hue}, ${BRAND.accentDark});
    box-shadow: 0 8px 24px ${badge.hue}55;
  }
  .brand-name { font-size: 18px; font-weight: 700; letter-spacing: 0.02em; }
  .brand-tag { font-size: 11px; color: #94a3b8; margin-top: 2px; letter-spacing: 0.08em; text-transform: uppercase; }

  .cover-title-block { margin-top: auto; }
  .cover-kicker {
    display: inline-block;
    padding: 6px 14px;
    border-radius: 999px;
    background: ${badge.hue}22;
    border: 1px solid ${badge.hue}66;
    color: ${badge.hue};
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-weight: 600;
  }
  .cover h1 {
    font-size: 56px;
    line-height: 1.05;
    margin: 22px 0 14px;
    color: #fff;
    letter-spacing: -0.02em;
  }
  .cover .sub {
    font-size: 16px;
    color: #cbd5e1;
    max-width: 140mm;
    line-height: 1.5;
  }

  .cover-foot {
    margin-top: auto;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    padding-top: 30mm;
  }
  .cover-foot .chip {
    display: inline-block;
    padding: 8px 14px;
    border-radius: 8px;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.12);
    font-size: 10px;
    color: #e2e8f0;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .cover-foot .date { font-size: 11px; color: #94a3b8; }

  /* ---------- PAGE WRAPPER ---------- */
  .page {
    position: relative;
    padding: 22mm 20mm 24mm;
    min-height: 297mm;
    page-break-after: always;
  }
  .page::before {
    content: "";
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 6px;
    background: linear-gradient(90deg, ${badge.hue}, ${BRAND.accent}, ${BRAND.accentDark});
  }
  .page-header {
    display: flex; justify-content: space-between; align-items: center;
    padding-bottom: 10px;
    border-bottom: 1px solid ${BRAND.line};
    margin-bottom: 18px;
    font-size: 10px;
    color: ${BRAND.muted};
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .page-header .hdr-brand { font-weight: 700; color: ${BRAND.ink}; letter-spacing: 0.04em; }

  /* ---------- INTRO ---------- */
  .intro h2 {
    font-size: 13px;
    color: ${badge.hue};
    text-transform: uppercase;
    letter-spacing: 0.12em;
    margin: 24px 0 8px;
  }
  .intro .big {
    font-size: 26px;
    color: ${BRAND.ink};
    line-height: 1.2;
    margin-bottom: 18px;
    max-width: 150mm;
  }
  .intro p { font-size: 12.5px; color: ${BRAND.inkSoft}; line-height: 1.7; max-width: 150mm; }
  .intro .panel {
    margin-top: 14px;
    padding: 14px 16px;
    background: ${BRAND.bg};
    border-left: 3px solid ${badge.hue};
    border-radius: 4px;
  }

  /* ---------- TOC ---------- */
  .toc h1 {
    font-size: 30px;
    color: ${BRAND.ink};
    margin-bottom: 6px;
  }
  .toc .toc-sub { color: ${BRAND.muted}; font-size: 12px; margin-bottom: 20px; }
  .toc ol { list-style: none; padding: 0; margin: 0; }
  .toc li {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 10px 0;
    border-bottom: 1px solid ${BRAND.line};
    font-size: 13px;
    color: ${BRAND.inkSoft};
  }
  .toc .toc-num {
    display: inline-block;
    width: 34px;
    font-weight: 700;
    color: ${badge.hue};
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
  }
  .toc .toc-title { flex: 1; }

  /* ---------- CHAPTERS ---------- */
  .chapter { padding-top: 4px; }
  .chapter-head {
    display: flex;
    gap: 16px;
    align-items: flex-start;
    margin-bottom: 14px;
  }
  .chapter-num {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 56px; height: 56px;
    border-radius: 14px;
    background: linear-gradient(135deg, ${badge.hue}, ${BRAND.accentDark});
    color: #fff;
    font-size: 22px;
    font-weight: 700;
    box-shadow: 0 6px 20px ${badge.hue}33;
    font-variant-numeric: tabular-nums;
  }
  .chapter-meta { flex: 1; padding-top: 4px; }
  .chapter-kicker {
    font-size: 9.5px;
    color: ${BRAND.muted};
    text-transform: uppercase;
    letter-spacing: 0.14em;
    margin-bottom: 4px;
    font-weight: 600;
  }
  .chapter h2 {
    font-size: 22px;
    color: ${BRAND.ink};
    letter-spacing: -0.01em;
  }
  .shot {
    border-radius: 10px;
    overflow: hidden;
    border: 1px solid ${BRAND.line};
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
    background: #fff;
    margin-bottom: 14px;
  }
  .chapter img {
    width: 100%;
    max-height: 480px;
    object-fit: contain;
    display: block;
    background: ${BRAND.bg};
  }
  .chapter .missing {
    padding: 40px;
    border: 2px dashed #fca5a5;
    color: #b91c1c;
    text-align: center;
    font-size: 12px;
  }
  .chapter .caption {
    font-size: 12.5px;
    color: ${BRAND.inkSoft};
    line-height: 1.7;
    padding: 12px 16px;
    background: ${BRAND.bg};
    border-radius: 8px;
    border-left: 3px solid ${badge.hue};
  }

  /* ---------- FAQ ---------- */
  .faq h1 {
    font-size: 30px;
    color: ${BRAND.ink};
    margin-bottom: 4px;
  }
  .faq .sub { color: ${BRAND.muted}; font-size: 12px; margin-bottom: 20px; }
  .faq-item {
    margin-top: 14px;
    padding: 14px 16px;
    background: ${BRAND.bg};
    border-radius: 8px;
    border: 1px solid ${BRAND.line};
  }
  .faq-item .q { font-weight: 700; font-size: 13px; color: ${BRAND.ink}; margin-bottom: 6px; }
  .faq-item .a { font-size: 12px; color: ${BRAND.inkSoft}; line-height: 1.65; margin: 0; }
  .q-mark, .a-mark {
    display: inline-block;
    width: 18px; height: 18px;
    line-height: 18px;
    text-align: center;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
    margin-right: 8px;
    vertical-align: 1px;
  }
  .q-mark { background: ${badge.hue}; color: #fff; }
  .a-mark { background: ${BRAND.line}; color: ${BRAND.inkSoft}; }

  /* ---------- BACK COVER ---------- */
  .back {
    height: 297mm;
    background: linear-gradient(180deg, #0b1120, #0f172a);
    color: #fff;
    padding: 40mm 22mm;
    page-break-before: always;
    position: relative;
  }
  .back::before {
    content: "";
    position: absolute; top: 0; left: 0; right: 0;
    height: 6px;
    background: linear-gradient(90deg, ${badge.hue}, ${BRAND.accent}, ${BRAND.accentDark});
  }
  .back h2 {
    font-size: 32px;
    margin-bottom: 14px;
    letter-spacing: -0.01em;
  }
  .back p { color: #cbd5e1; font-size: 13px; max-width: 140mm; line-height: 1.7; }
  .back .divider {
    width: 60px; height: 3px;
    background: ${badge.hue};
    margin: 28px 0;
    border-radius: 2px;
  }
  .back .signoff {
    margin-top: 60mm;
    font-size: 11px;
    color: #64748b;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
</style>
</head>
<body>

  <!-- COVER -->
  <section class="cover">
    <div class="cover-inner">
      <div class="brand-row">
        <div class="logo-dot"></div>
        <div>
          <div class="brand-name">${BRAND.name}</div>
          <div class="brand-tag">${esc(tagline)}</div>
        </div>
      </div>

      <div class="cover-title-block">
        <span class="cover-kicker">${esc(badgeLabel)}</span>
        <h1>${esc(title)}</h1>
        <p class="sub">${esc(intro)}</p>
      </div>

      <div class="cover-foot">
        <span class="chip">${locale.toUpperCase()} · ${esc(bundle.coverSubtitle)}</span>
        <div class="date">${esc(bundle.generatedOn)} ${genDate}</div>
      </div>
    </div>
  </section>

  <!-- INTRO -->
  <section class="page intro">
    <div class="page-header">
      <span class="hdr-brand">${BRAND.name}</span>
      <span>${esc(badgeLabel)}</span>
    </div>
    <h2>${esc(bundle.coverSubtitle)}</h2>
    <div class="big">${esc(title)}</div>
    <p>${esc(intro)}</p>
    <h2>${esc(bundle.audienceHeading)}</h2>
    <div class="panel"><p>${esc(audience)}</p></div>
    <h2>${esc(bundle.prerequisitesHeading)}</h2>
    <div class="panel"><p>${esc(prereq)}</p></div>
  </section>

  <!-- TOC -->
  <section class="page toc">
    <div class="page-header">
      <span class="hdr-brand">${BRAND.name}</span>
      <span>${esc(badgeLabel)}</span>
    </div>
    <h1>${esc(bundle.tocHeading)}</h1>
    <div class="toc-sub">${course.chapters.length} ${esc(bundle.chapterLabel.toLowerCase())}${course.chapters.length === 1 ? "" : "s"}</div>
    <ol>
      ${tocItems}
    </ol>
  </section>

  <!-- CHAPTERS -->
  ${course.chapters
    .map((ch, i) => {
      const imgPath = path.join(artifactsDir, `${ch.id}.png`);
      const dataUri = fs.existsSync(imgPath) ? readPngAsDataUri(imgPath) : "";
      const t = locale === "en" ? ch.titleEn : ch.titleEs;
      const cap = locale === "en" ? ch.captionEn : ch.captionEs;
      const num = String(i + 1).padStart(2, "0");
      const imgTag = dataUri
        ? `<img src="${dataUri}" alt="${esc(t)}"/>`
        : `<div class="missing">[screenshot missing: ${esc(ch.id)}]</div>`;
      return `
  <section class="page">
    <div class="page-header">
      <span class="hdr-brand">${BRAND.name}</span>
      <span>${esc(badgeLabel)} · ${num}</span>
    </div>
    <div class="chapter">
      <div class="chapter-head">
        <span class="chapter-num">${num}</span>
        <div class="chapter-meta">
          <div class="chapter-kicker">${esc(bundle.chapterLabel)} ${i + 1}</div>
          <h2>${esc(t)}</h2>
        </div>
      </div>
      <div class="shot">${imgTag}</div>
      <p class="caption">${esc(cap)}</p>
    </div>
  </section>`;
    })
    .join("\n")}

  <!-- FAQ -->
  <section class="page faq">
    <div class="page-header">
      <span class="hdr-brand">${BRAND.name}</span>
      <span>${esc(badgeLabel)}</span>
    </div>
    <h1>${esc(bundle.faqHeading)}</h1>
    <div class="sub">${esc(bundle.coverSubtitle)}</div>
    ${faqHTML}
  </section>

  <!-- BACK COVER -->
  <section class="back">
    <div class="brand-row">
      <div class="logo-dot"></div>
      <div>
        <div class="brand-name">${BRAND.name}</div>
        <div class="brand-tag">${esc(tagline)}</div>
      </div>
    </div>
    <div class="divider"></div>
    <h2>${esc(title)}</h2>
    <p>${esc(intro)}</p>
    <div class="signoff">© ${new Date().getFullYear()} ${BRAND.name} · ${esc(bundle.generatedOn)} ${genDate}</div>
  </section>

</body>
</html>`;
}

export async function writeCoursePDF(
  context: BrowserContext,
  course: Course,
  locale: Locale,
  artifactsDir: string,
  outPath: string,
) {
  const html = renderCourseHTML(course, locale, artifactsDir);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const page = await context.newPage();
  await page.setContent(html, { waitUntil: "networkidle" });
  const title = locale === "en" ? course.titleEn : course.titleEs;
  await page.pdf({
    path: outPath,
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: `<div></div>`,
    footerTemplate: `<div style="font-size:8px;width:100%;padding:0 18mm;display:flex;justify-content:space-between;color:#94a3b8;font-family:-apple-system,Segoe UI,Roboto,sans-serif"><span>${esc(
      BRAND.name,
    )} · ${esc(title)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    margin: { top: "0", bottom: "14mm", left: "0", right: "0" },
  });
  await page.close();
}
