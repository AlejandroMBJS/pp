import { test, expect, type Page } from "@playwright/test";

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const t = msg.text();
    if (t.includes("Content Security Policy") || t.includes("Refused to")) {
      errors.push(t);
    }
  });
  return errors;
}

test("landing renders without JS errors", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/en", { waitUntil: "networkidle" });
  await expect(page.locator("body")).toBeVisible();
  expect(errors, errors.join("\n")).toHaveLength(0);
});

test("login page renders and has email + password inputs", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/en/login", { waitUntil: "networkidle" });
  await expect(page.locator('input[type="email"]').first()).toBeVisible();
  await expect(page.locator('input[type="password"]').first()).toBeVisible();
  expect(errors, errors.join("\n")).toHaveLength(0);
});

test("signup page renders", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/en/signup", { waitUntil: "networkidle" });
  await expect(page.locator("body")).toBeVisible();
  expect(errors, errors.join("\n")).toHaveLength(0);
});

test("pricing page renders with plan tiers", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/en/pricing", { waitUntil: "networkidle" });
  await expect(page.locator("body")).toBeVisible();
  expect(errors, errors.join("\n")).toHaveLength(0);
});

test("demo page renders form and resend link", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/en/demo", { waitUntil: "networkidle" });
  await expect(page.locator('input[type="email"]').first()).toBeVisible();
  expect(errors, errors.join("\n")).toHaveLength(0);
});
