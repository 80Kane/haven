import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const factorId = "11111111-1111-4111-8111-111111111111";
async function login(page, name) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(`${name}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
async function verify(page) {
  await page.getByLabel("Six-digit authenticator code").fill("123456");
  await page.getByRole("button", { name: "Verify authenticator" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}
test("anonymous, ordinary and password-only admin sessions cannot write invitations", async ({
  page,
  request,
}) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login$/);
  await login(page, "active");
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Administrator access is required." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "admin");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/mfa$/);
  const response = await page.request.post("/admin/invitations/issue", {
    headers: { origin: "http://127.0.0.1:4180" },
    form: { email: "pending@example.test", hours: "24" },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
  expect(response.headers().location).toContain("notice=failed");
  for (const path of [
    "/admin/mfa/enroll",
    "/admin/mfa/verify",
    "/admin/invitations/issue",
    "/admin/invitations/revoke",
  ]) {
    expect((await request.get(path)).status()).toBe(405);
    expect(
      (
        await request.post(path, {
          headers: { origin: "https://attacker.example.test" },
          form: {},
        })
      ).status(),
    ).toBe(403);
  }
});
test("MFA errors stay neutral; verified admin can issue and revoke without browser token storage", async ({
  page,
  context,
}) => {
  await login(page, "admin");
  await page.goto("/admin");
  await page.getByLabel("Six-digit authenticator code").fill("000000");
  await page.getByRole("button", { name: "Verify authenticator" }).click();
  await expect(page.getByRole("status")).toContainText("We couldn't verify");
  await verify(page);
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(axe.violations).toEqual([]);
  await page.getByLabel("Recipient test email").fill("pending@example.test");
  await page.getByRole("button", { name: "Create invitation" }).click();
  await expect(page).toHaveURL(/\/admin\/invitations\/issue$/);
  await expect(
    page.getByRole("heading", { name: "Invitation created" }),
  ).toBeVisible();
  const codes = await page.locator("code").allTextContents();
  expect(codes[0]).toMatch(/^[a-f0-9]{64}$/);
  expect(page.url()).not.toContain(codes[0]);
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
      cookies: document.cookie,
    })),
  ).toEqual({ local: 0, session: 0, cookies: "" });
  expect(
    (await context.cookies())
      .filter((c) => c.name.startsWith("haven-auth"))
      .every((c) => c.httpOnly),
  ).toBe(true);
  const resultAxe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(resultAxe.violations).toEqual([]);
  await page
    .getByRole("link", { name: "Return to administrator tools" })
    .click();
  await page.getByLabel("Invitation ID").fill(codes[1]);
  await page
    .getByRole("button", { name: "Revoke invitation", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Revocation request completed",
  );
});
test("first TOTP enrollment is POST only, private, and upgrades cookies before admin entry", async ({
  page,
}) => {
  await login(page, "admin-new");
  await page.goto("/admin");
  await page.getByRole("button", { name: "Set up authenticator" }).click();
  await expect(
    page.getByRole("heading", { name: "Set up your authenticator" }),
  ).toBeVisible();
  await expect(page.getByText("FIXTURE-SECRET", { exact: true })).toBeVisible();
  const src = await page
    .getByAltText("Authenticator setup QR code")
    .getAttribute("src");
  expect(src).toMatch(/^data:image\/svg\+xml/);
  expect(
    await page
      .getByAltText("Authenticator setup QR code")
      .evaluate((img) => img.complete && img.naturalWidth > 0),
  ).toBe(true);
  expect(page.url()).not.toContain("FIXTURE");
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(axe.violations).toEqual([]);
  await verify(page);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Manage invitations." }),
  ).toBeVisible();
});
test("foreign factor cannot be verified and SQL can deny a previously authorized admin write", async ({
  page,
}) => {
  await login(page, "admin-denied");
  await page.goto("/admin");
  const response = await page.request.post("/admin/mfa/verify", {
    headers: { origin: "http://127.0.0.1:4180" },
    form: { factorId: "99999999-9999-4999-8999-999999999999", code: "123456" },
    maxRedirects: 0,
  });
  expect(response.headers().location).toContain("notice=invalid");
  await verify(page);
  await page.getByLabel("Recipient test email").fill("pending@example.test");
  await page.getByRole("button", { name: "Create invitation" }).click();
  await expect(page).toHaveURL(/notice=failed/);
  await expect(page.locator("code")).toHaveCount(0);
});
