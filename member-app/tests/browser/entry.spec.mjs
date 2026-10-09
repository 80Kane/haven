import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function login(page, name) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(`${name}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
test("anonymous private entry redirects to accessible sign-in without browser tokens", async ({
  page,
}) => {
  await page.goto("/member");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Your next step starts here.",
  );
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
      cookies: document.cookie,
    })),
  ).toEqual({ local: 0, session: 0, cookies: "" });
});
test("active member enters private page, refresh persists, and logout blocks entry", async ({
  page,
  context,
}) => {
  await login(page, "active");
  await expect(page).toHaveURL(/\/member$/);
  await expect(
    page.getByRole("heading", { name: "Welcome to HavenForward." }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("You have active access to the member pilot."),
  ).toBeVisible();
  const cookies = await context.cookies();
  expect(
    cookies.filter((cookie) => cookie.name.startsWith("haven-auth")).length,
  ).toBeGreaterThan(0);
  expect(
    cookies
      .filter((cookie) => cookie.name.startsWith("haven-auth"))
      .every((cookie) => cookie.httpOnly && cookie.sameSite === "Lax"),
  ).toBe(true);
  expect(await page.evaluate(() => document.cookie)).toBe("");
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/notice=signed-out/);
  await page.goto("/member");
  await expect(page).toHaveURL(/\/login$/);
});
test("invalid credentials stay neutral and cross-origin POSTs and scanner GETs cannot mutate", async ({
  page,
  request,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("unknown@example.test");
  await page.getByLabel("Password", { exact: true }).fill("incorrect");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "We couldn't sign you in",
  );
  const rejected = await request.post("/auth/login", {
    headers: { origin: "https://attacker.example.test" },
    form: { email: "active@example.test", password: "fixture-password" },
    maxRedirects: 0,
  });
  expect(rejected.status()).toBe(403);
  for (const path of ["/auth/login", "/auth/redeem", "/auth/logout"])
    expect((await request.get(path)).status()).toBe(405);
});
test("suspended identity cannot enter private screen or reactivate using an invitation", async ({
  page,
}) => {
  await login(page, "suspended");
  await expect(page).toHaveURL(/\/invitation$/);
  await page.getByLabel("Invitation code").fill("a".repeat(64));
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(page.getByRole("status")).toContainText(
    "We couldn't accept this invitation",
  );
  await page.goto("/member");
  await expect(page).toHaveURL(/\/invitation$/);
});
test("pending account requires consent and a matching invitation before private entry", async ({
  page,
}) => {
  await login(page, "pending");
  await expect(page).toHaveURL(/\/invitation$/);
  await page.getByLabel("Invitation code").fill("b".repeat(64));
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(page.getByRole("status")).toContainText(
    "We couldn't accept this invitation",
  );
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  await page.getByLabel("Invitation code").fill("a".repeat(64));
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(page).toHaveURL(/\/member$/);
  await expect(
    page.getByRole("heading", { name: "Welcome to HavenForward." }),
  ).toBeVisible();
});
test("small screen has no horizontal overflow and auth responses are private and uncached", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  const response = await page.goto("/login");
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["referrer-policy"]).toBe("no-referrer");
  expect(response.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
});
