import type { BrowserContext, Page } from "@playwright/test";
import fs from "fs";
import path from "path";

export async function freezeAnimations(page: Page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
      }
    `,
  });
}

export async function hideEphemera(page: Page) {
  await page.addStyleTag({
    content: `
      [data-sonner-toaster],
      [data-toast-root],
      [role="status"][aria-live],
      .sonner-toast,
      .toast {
        visibility: hidden !important;
      }
    `,
  });
}

export async function freezeTime(page: Page, iso = "2026-04-15T12:00:00Z") {
  await page.addInitScript((fixedISO: string) => {
    const fixed = new Date(fixedISO).getTime();
    // Only override Date.now — replacing the Date constructor breaks
    // libraries that rely on Date.UTC, Date.parse, subclassing, etc.
    Date.now = () => fixed;
  }, iso);
}

export async function grantGeolocation(context: BrowserContext, lat = 19.4326, lng = -99.1332) {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: lat, longitude: lng });
}

export async function setLocaleCookie(context: BrowserContext, locale: "en" | "es") {
  await context.addCookies([
    { name: "NEXT_LOCALE", value: locale, url: "http://localhost:1212" },
  ]);
}

export async function clearSession(context: BrowserContext) {
  await context.clearCookies();
}

export async function injectSession(page: Page, token: string, user: any) {
  await page.addInitScript(
    ({ tok, u }) => {
      try {
        const payload = { access_token: tok, user: u };
        localStorage.setItem("projectpulse-session", JSON.stringify(payload));
      } catch {}
    },
    { tok: token, u: user },
  );
}

export type CaptureResult = { ok: boolean; outPath: string; error?: string };

export async function captureChapter(
  page: Page,
  outPath: string,
  options: { fullPage?: boolean } = {},
): Promise<CaptureResult> {
  try {
    await page.waitForLoadState("domcontentloaded");
    try { await page.waitForLoadState("networkidle", { timeout: 5000 }); } catch {}
    await hideEphemera(page);
    await freezeAnimations(page);
    await page.waitForTimeout(300);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    await page.screenshot({ path: outPath, fullPage: options.fullPage ?? false, omitBackground: false });
    return { ok: true, outPath };
  } catch (err: any) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    try {
      await page.screenshot({ path: outPath, fullPage: false });
    } catch {}
    return { ok: false, outPath, error: err?.message ?? String(err) };
  }
}

export function readPngAsDataUri(p: string): string {
  const bytes = fs.readFileSync(p);
  return `data:image/png;base64,${bytes.toString("base64")}`;
}
