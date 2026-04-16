import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";

type Violation = { url: string; text: string };

const publicPaths = [
  "/",
  "/en",
  "/es",
  "/en/login",
  "/en/signup",
  "/en/pricing",
  "/en/demo",
  "/en/billing/success",
  "/en/billing/cancel",
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

for (const path of publicPaths) {
  test(`no CSP violations on ${path}`, async ({ page }) => {
    const violations: Violation[] = [];
    attachCspListener(page, violations);
    const res = await page.goto(path, { waitUntil: "networkidle" });
    expect(res, `navigation failed for ${path}`).not.toBeNull();
    expect(res!.status(), `non-2xx for ${path}`).toBeLessThan(400);
    await page.waitForTimeout(500);
    if (violations.length > 0) {
      const msg = violations.map((v) => `${v.url}: ${v.text}`).join("\n");
      throw new Error(`CSP/JS errors on ${path}:\n${msg}`);
    }
  });
}
