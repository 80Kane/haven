import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("landing page navigation, honest feature status, and no JavaScript errors", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page).toHaveTitle("You Are Not Alone | HavenForward");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "You Are Not Alone.",
  );
  await page.getByRole("link", { name: "Circles", exact: true }).click();
  await expect(page).toHaveURL(/#circles$/);
  await page.getByRole("link", { name: "HavenForward home" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(
    page.getByText("Member enrollment is not open yet.", { exact: false }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

for (const path of [
  "/",
  "/resources.html",
  "/privacy.html",
  "/guidelines.html",
  "/404.html",
]) {
  test(`WCAG automated checks: ${path}`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}

for (const width of [320, 390, 768, 1440]) {
  test(`layout and navigation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [
      "/",
      "/resources.html",
      "/privacy.html",
      "/guidelines.html",
    ]) {
      await page.goto(path);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.goto("/");
    if (width <= 850) {
      const menu = page.getByRole("button", { name: "Menu", exact: true });
      await menu.click();
      await expect(menu).toHaveAttribute("aria-expanded", "true");
      await expect(
        page.getByRole("link", { name: "Circles", exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(menu).toBeFocused();
      await expect(menu).toHaveAttribute("aria-expanded", "false");
      await menu.click();
    }
    await page.getByRole("link", { name: "Circles", exact: true }).click();
    await expect(page).toHaveURL(/#circles$/);
  });
}

test("resource search/category filtering and empty state stay local", async ({
  page,
}) => {
  const requests = [];
  await page.goto("/resources.html");
  page.on("request", (request) => requests.push(request.url()));
  await page.getByLabel("Search resources").fill("housing");
  await expect(page.locator(".resource-card:visible")).toHaveCount(2);
  await page
    .getByLabel("Category", { exact: true })
    .selectOption({ label: "Housing" });
  await expect(page.locator(".resource-card:visible")).toHaveCount(1);
  await page.getByLabel("Search resources").fill("<script>audit</script>");
  await expect(page.locator("#resource-empty")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("0 resources shown");
  expect(requests).toEqual([]);
});

test("keyboard skip link and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
  await expect(page.locator("#main")).toBeFocused();
  expect(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollBehavior,
    ),
  ).toBe("auto");
});

test("no-JavaScript resources and mobile navigation remain usable", async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 320, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(
    `${process.env.TEST_BASE_URL || "http://127.0.0.1:4173"}/resources.html`,
  );
  await expect(page.locator(".resource-card")).toHaveCount(7);
  await expect(
    page.getByRole("link", { name: "Circles", exact: true }),
  ).toBeVisible();
  await context.close();
});

test("private and backend paths return no service or member data", async ({
  request,
}) => {
  for (const path of [
    "/members",
    "/community",
    "/register",
    "/api/hugs",
    "/api/signup",
    "/.env",
  ]) {
    const response = await request.get(path);
    expect(response.status()).toBe(404);
    if (
      path.startsWith("/api/") &&
      response.headers()["content-type"]?.includes("application/json")
    ) {
      expect(await response.json()).toEqual({ error: "Not found" });
    } else {
      expect(await response.text()).toContain(
        "invitation-only community is not open",
      );
    }
  }
});
