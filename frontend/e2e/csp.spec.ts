import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";

type Violation = { url: string; text: string };

// Public marketing + auth surfaces. Billing cancel is reachable via
// /en/billing (Stripe redirects with ?canceled=1 query); there's no
// standalone /en/billing/cancel route.
const publicPaths = [
  "/",
  "/en",
  "/es",
  "/en/login",
  "/en/signup",
  "/en/pricing",
  "/en/demo",
  "/en/billing/success",
];

function attachCspListener(page: Page, sink: Violation[]) {
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (text.includes("Content Security Policy") || text.includes("Refused to")) {
      sink.push({ url: page.url(), text });
    }
  });
  page.on("pageerror", (err) => {
    sink.push({ url: page.url(), text: `pageerror: ${err.message}` });
  });
}

// Pages that embed third-party iframes (Stripe Pricing Table) keep firing
// network requests, so `networkidle` never resolves. For those we use
// `domcontentloaded` and a longer post-load wait so CSP/JS violations
// still flush into the listener.
const NETWORK_BUSY_PATHS = new Set(["/en/pricing", "/en/billing/success"]);

for (const path of publicPaths) {
  test(`no CSP violations on ${path}`, async ({ page }) => {
    const violations: Violation[] = [];
    attachCspListener(page, violations);
    const busy = NETWORK_BUSY_PATHS.has(path);
    const res = await page.goto(path, { waitUntil: busy ? "domcontentloaded" : "networkidle" });
    expect(res, `navigation failed for ${path}`).not.toBeNull();
    expect(res!.status(), `non-2xx for ${path}`).toBeLessThan(400);
    await page.waitForTimeout(busy ? 1500 : 500);
    if (violations.length > 0) {
      const msg = violations.map((v) => `${v.url}: ${v.text}`).join("\n");
      throw new Error(`CSP/JS errors on ${path}:\n${msg}`);
    }
  });
}
