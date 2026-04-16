import { test, expect, chromium } from "@playwright/test";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { COURSES, ChapterContext, Course } from "./courses";
import { seedDemo, SeedResult, SeedUser } from "./seed";
import {
  captureChapter,
  clearSession,
  freezeTime,
  grantGeolocation,
  injectSession,
  setLocaleCookie,
} from "./capture";
import { writeCoursePDF } from "./pdf";
import type { Locale } from "./copy";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:1212";
const LOCALES = (process.env.PLAYWRIGHT_LOCALES ?? "en,es").split(",") as Locale[];
const SKIP_EXISTING = process.env.GUIDE_SKIP_EXISTING === "1";
const PDF_ONLY = process.env.GUIDE_PDF_ONLY === "1";
const ROOT = path.resolve(__dirname);
const ARTIFACTS = path.join(ROOT, ".artifacts");
const OUT_DIR = path.resolve(ROOT, "../../../docs/courses");
const PLATFORM_ADMIN_EMAIL = process.env.PLATFORM_ADMIN_EMAIL ?? "admin@projectpulse.local";
const PLATFORM_ADMIN_PASSWORD = process.env.PLATFORM_ADMIN_PASSWORD ?? "demo123";

type CaptureReport = {
  locale: Locale;
  course: string;
  chapter: string;
  ok: boolean;
  error?: string;
};

test.describe.configure({ mode: "serial" });

test("generate role-based course PDFs", async () => {
  test.setTimeout(60 * 60 * 1000); // up to 1h

  fs.mkdirSync(ARTIFACTS, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();

  let seed: SeedResult | null = null;
  if (!PDF_ONLY) {
    const apiCtx = await browser.newContext();
    const api = apiCtx.request;
    const health = await api.get(`${BASE_URL}/healthz`);
    expect(health.ok(), "backend /healthz must be reachable").toBeTruthy();
    seed = await seedDemo(api, {
      platformAdminEmail: PLATFORM_ADMIN_EMAIL,
      platformAdminPassword: PLATFORM_ADMIN_PASSWORD,
    });
    await apiCtx.close();
  }

  const report: CaptureReport[] = [];

  for (const locale of LOCALES) {
    for (const course of COURSES as Course[]) {
      const courseArtifacts = path.join(ARTIFACTS, locale, course.slug);
      fs.mkdirSync(courseArtifacts, { recursive: true });

      // Decide which chapters need (re)capture.
      const needed = course.chapters.filter((ch) => {
        if (PDF_ONLY) return false;
        const p = path.join(courseArtifacts, `${ch.id}.png`);
        if (SKIP_EXISTING && fs.existsSync(p)) return false;
        return true;
      });

      const context = await browser.newContext({
        baseURL: BASE_URL,
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
        locale: locale === "es" ? "es-MX" : "en-US",
        timezoneId: "America/Mexico_City",
        ignoreHTTPSErrors: true,
      });

      if (needed.length > 0) {
        await grantGeolocation(context);
        await setLocaleCookie(context, locale);

        const page = await context.newPage();
        await freezeTime(page);

        const loginAs = async (u: SeedUser) => {
          await clearSession(context);
          await setLocaleCookie(context, locale);
          await injectSession(page, u.token, u.user);
        };

        const ctx: ChapterContext = {
          context,
          page,
          locale,
          seed: seed as SeedResult,
          baseURL: BASE_URL,
          loginAs,
        };

        const seenHashes = new Map<string, string>();
        // Pre-load hashes of already-kept files so dup detection spans skipped chapters too.
        for (const ch of course.chapters) {
          const p = path.join(courseArtifacts, `${ch.id}.png`);
          if (fs.existsSync(p) && !needed.includes(ch)) {
            const h = crypto.createHash("md5").update(fs.readFileSync(p)).digest("hex");
            seenHashes.set(h, ch.id);
          }
        }

        for (const chapter of needed) {
          let runError: string | undefined;
          try {
            await chapter.run(ctx);
          } catch (err: any) {
            runError = `run() failed: ${err?.message ?? err}`;
          }
          const outPath = path.join(courseArtifacts, `${chapter.id}.png`);
          const res = await captureChapter(page, outPath);
          if (!res.ok) {
            report.push({ locale, course: course.slug, chapter: chapter.id, ok: false, error: res.error ?? runError });
            continue;
          }
          const hash = crypto.createHash("md5").update(fs.readFileSync(outPath)).digest("hex");
          const dupOf = seenHashes.get(hash);
          if (dupOf && dupOf !== chapter.id) {
            report.push({ locale, course: course.slug, chapter: chapter.id, ok: false, error: `duplicate of ${dupOf}${runError ? ` (run error: ${runError})` : ""}` });
          } else {
            seenHashes.set(hash, chapter.id);
            report.push({ locale, course: course.slug, chapter: chapter.id, ok: !runError, error: runError });
          }
        }

        await page.close();
      }

      const pdfOut = path.join(OUT_DIR, `${course.slug}.${locale}.pdf`);
      await writeCoursePDF(context, course, locale, courseArtifacts, pdfOut);

      await context.close();
      console.log(`[guide] wrote ${pdfOut}`);
    }
  }

  await browser.close();

  const reportPath = path.join(ARTIFACTS, "capture-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const failures = report.filter((r) => !r.ok);
  if (failures.length > 0) {
    console.warn(`[guide] ${failures.length} captures failed — see ${reportPath}`);
  }

  expect(report.length, "must have captured at least one chapter").toBeGreaterThan(0);
});
