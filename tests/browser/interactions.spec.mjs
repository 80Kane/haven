import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  stagingDocument,
  stagingHeaders,
} from "../../backend/staging-page.mjs";

// UI contract tests intentionally fake API and Turnstile. Live provider tests are separate.
const challengeFixture = `window.turnstile = {
  render(element, options) {
    window.__challenges ??= {};
    window.__challenges[options.action] = options;
    element.textContent = 'Verification fixture';
    options.callback(options.action + '-fixture');
    return options.action;
  },
  reset(id) { window.__challenges[id].callback(id + '-fresh-fixture'); },
  remove(id) { delete window.__challenges[id]; }
};`;
async function setup(page, handler) {
  await page.route("**/staging-interactions", (route) =>
    route.fulfill({
      status: 200,
      headers: stagingHeaders,
      body: stagingDocument(),
    }),
  );
  await page.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: challengeFixture,
    }),
  );
  await page.route("**/api/public/*", async (route) => {
    const request = route.request();
    const action = new URL(request.url()).pathname.split("/").pop();
    const result = await handler(action, request);
    await route.fulfill({
      status: result.status || 200,
      contentType: result.contentType || "application/json",
      body: JSON.stringify(result.body),
    });
  });
  await page.goto("/staging-interactions");
}
async function prepare(page, action) {
  await page.locator(`[data-action="${action}"]`).click();
  await expect(page.locator(`#${action}-status`)).toHaveText(
    "Verification complete.",
  );
}
test("Hug reads persisted aggregate, loads no CAPTCHA before choice, and updates after save", async ({
  page,
}) => {
  let total = 3;
  let challengeRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("challenges.cloudflare.com"))
      challengeRequests++;
  });
  await setup(page, (action, request) => {
    expect(action).toBe("hugs");
    if (request.method() === "GET") return { body: { total } };
    expect(request.postDataJSON()).toEqual({ turnstileToken: "hugs-fixture" });
    return { body: { total: ++total, accepted: true } };
  });
  await expect(page.locator("#hug-count")).toHaveText("3");
  expect(challengeRequests).toBe(0);
  await expect(page.locator("#hugs-submit")).toBeDisabled();
  await prepare(page, "hugs");
  await page.locator("#hugs-submit").click();
  await expect(page.locator("#hugs-status")).toContainText(
    "Your Hug was saved",
  );
  await expect(page.locator("#hug-count")).toHaveText("4");
  await expect(page.locator("#hugs-submit")).toBeDisabled();
  await page.reload();
  await expect(page.locator("#hug-count")).toHaveText("4");
});
test("duplicate Hug explains shared network limit and does not invent a new count", async ({
  page,
}) => {
  await setup(page, (_, request) => ({
    body: {
      total: 1,
      ...(request.method() === "POST" ? { accepted: false } : {}),
    },
  }));
  await prepare(page, "hugs");
  await page.locator("#hugs-submit").click();
  await expect(page.locator("#hugs-status")).toContainText(
    "already been shared from this network",
  );
  await expect(page.locator("#hug-count")).toHaveText("1");
});
test("email needs valid address, explicit consent and its own CAPTCHA; success is neutral", async ({
  page,
}) => {
  let submissions = 0;
  await setup(page, (action, request) => {
    if (action === "hugs") return { body: { total: 0 } };
    submissions++;
    expect(request.postDataJSON()).toEqual({
      email: "tester@example.test",
      consent: true,
      consentVersion: "interest-v1",
      turnstileToken: "interest-fixture",
    });
    return { status: 202, body: { message: "neutral" } };
  });
  await prepare(page, "hugs");
  await page.locator("#interest-email").fill("tester@example.test");
  await page.locator("#interest-consent").check();
  await expect(page.locator("#interest-submit")).toBeDisabled();
  await prepare(page, "interest");
  await page.locator("#interest-email").fill("not-an-email");
  await expect(page.locator("#interest-submit")).toBeDisabled();
  await page.locator("#interest-email").fill("tester@example.test");
  await page.locator("#interest-consent").uncheck();
  await expect(page.locator("#interest-submit")).toBeDisabled();
  await page.locator("#interest-consent").check();
  expect(submissions).toBe(0);
  await page.locator("#interest-submit").click();
  await expect(page.locator("#interest-status")).toContainText(
    "we will attempt to send",
  );
  expect(submissions).toBe(1);
  await expect(page.locator("#interest-email")).toHaveValue("");
  await expect(page.locator("#interest-consent")).not.toBeChecked();
  expect(
    await page.evaluate(() => [localStorage.length, sessionStorage.length]),
  ).toEqual([0, 0]);
});
test("expired and failed verification disables submission and supports retry", async ({
  page,
}) => {
  await setup(page, () => ({ body: { total: 0 } }));
  await prepare(page, "hugs");
  await page.evaluate(() => window.__challenges.hugs["expired-callback"]());
  await expect(page.locator("#hugs-submit")).toBeDisabled();
  await expect(page.locator("#hugs-status")).toContainText("expired");
  await prepare(page, "hugs");
  await page.evaluate(() => window.__challenges.hugs["error-callback"]());
  await expect(page.locator("#hugs-submit")).toBeDisabled();
  await expect(page.locator("#hugs-status")).toContainText(
    "Verification failed",
  );
  await prepare(page, "hugs");
  await expect(page.locator("#hugs-submit")).toBeEnabled();
});
test("provider errors show actionable failure and permit a fresh CAPTCHA", async ({
  page,
}) => {
  await setup(page, (_, request) =>
    request.method() === "GET"
      ? { body: { total: 0 } }
      : { status: 429, body: { error: "private server diagnostic" } },
  );
  await prepare(page, "hugs");
  await page.locator("#hugs-submit").click();
  await expect(page.locator("#hugs-status")).toContainText(
    "try again in an hour",
  );
  await expect(page.locator("#hugs-status")).not.toContainText(
    "private server diagnostic",
  );
  await expect(page.locator("#hugs-submit")).toBeDisabled();
  await prepare(page, "hugs");
  await expect(page.locator("#hugs-submit")).toBeEnabled();
});
test("parallel submit events create only one request", async ({ page }) => {
  let submissions = 0;
  await setup(page, async (_, request) => {
    if (request.method() === "GET") return { body: { total: 0 } };
    submissions++;
    await new Promise((resolve) => setTimeout(resolve, 150));
    return { body: { total: 1, accepted: true } };
  });
  await prepare(page, "hugs");
  await page.locator("#hugs-form").evaluate((form) => {
    for (let i = 0; i < 10; i++)
      form.dispatchEvent(new Event("submit", { cancelable: true }));
  });
  await expect(page.locator("#hugs-status")).toContainText(
    "Your Hug was saved",
  );
  expect(submissions).toBe(1);
});
test("unavailable or malformed API leaves both forms closed", async ({
  page,
}) => {
  await setup(page, () => ({ body: { total: "not-a-count" } }));
  await expect(page.locator("#service-status")).toContainText(
    "Interactions are unavailable",
  );
  await expect(page.locator("#hugs-submit")).toBeDisabled();
  await expect(page.locator("#interest-submit")).toBeDisabled();
  await expect(page.locator("#interest-email")).toBeDisabled();
  await expect(page.locator("#interest-consent")).toBeDisabled();
  for (const button of await page.locator(".verification-button").all())
    await expect(button).toBeDisabled();
});
test("failed CAPTCHA script load leaves submission disabled and can be retried", async ({
  page,
}) => {
  await setup(page, () => ({ body: { total: 0 } }));
  await page.route("https://challenges.cloudflare.com/**", (route) =>
    route.abort(),
  );
  await page.locator('[data-action="hugs"]').click();
  await expect(page.locator("#hugs-status")).toContainText(
    "Verification could not load",
  );
  await expect(page.locator("#hugs-submit")).toBeDisabled();
  await page.unroute("https://challenges.cloudflare.com/**");
  await page.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: challengeFixture,
    }),
  );
  await prepare(page, "hugs");
  await expect(page.locator("#hugs-submit")).toBeEnabled();
});
test("without JavaScript no forms can submit and support links remain available", async ({
  browser,
}, testInfo) => {
  const { baseURL, proxy, userAgent } = testInfo.project.use;
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL,
    proxy,
    userAgent,
  });
  const page = await context.newPage();
  await page.route("**/staging-interactions", (route) =>
    route.fulfill({
      status: 200,
      headers: stagingHeaders,
      body: stagingDocument(),
    }),
  );
  await page.goto("/staging-interactions");
  await expect(
    page.getByText("JavaScript is needed for verification and submission."),
  ).toBeVisible();
  await expect(page.locator("#hugs-submit")).toBeDisabled();
  await expect(page.locator("#interest-email")).toBeDisabled();
  await expect(
    page.getByRole("link", { name: "browse support resources" }),
  ).toHaveAttribute("href", "/resources.html");
  await context.close();
});
test("staging forms have labels, keyboard access, automated AA checks and mobile layout", async ({
  page,
}) => {
  await setup(page, () => ({ body: { total: 0 } }));
  await expect(page.locator("#service-status")).toHaveText(
    "Development service connected.",
  );
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("503 displays only fixed support codes and hides arbitrary provider text", async ({
  page,
}) => {
  let code = "database_haven_send_hug_http_403";
  await setup(page, (_, request) =>
    request.method() === "GET"
      ? { body: { total: 0 } }
      : { status: 503, body: { error: "private provider body", code } },
  );
  for (const value of [
    "database_haven_send_hug_http_403",
    "verification_request",
    "secret@example.test private-key",
  ]) {
    code = value;
    await prepare(page, "hugs");
    await page.locator("#hugs-submit").click();
    await expect(page.locator("#hugs-status")).toContainText(
      `Support code: ${value.includes("private-key") ? "HTTP 503" : value}.`,
    );
    await expect(page.locator("#hugs-status")).not.toContainText(
      "private provider body",
    );
    await expect(page.locator("#hugs-status")).not.toContainText(
      "secret@example.test",
    );
  }
});
