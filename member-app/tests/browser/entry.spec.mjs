import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const memberRoutes = [
  "/member",
  "/member/settings",
  "/member/circles",
  "/member/resources",
  "/member/learning",
  "/member/circles/recovery-healing",
  "/member/circles/choices-change",
  "/member/circles/mental-wellness",
  "/member/circles/veterans-connection",
  "/member/circles/family-relationships",
  "/member/circles/reentry-new-beginnings",
  "/member/circles/purpose-personal-growth",
];
async function login(page, name) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(`${name}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
test("anonymous private entry redirects to accessible sign-in without browser tokens", async ({
  page,
}) => {
  for (const route of memberRoutes) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login$/);
  }
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
  for (const route of memberRoutes) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login$/);
  }
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
  for (const route of memberRoutes) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/invitation$/);
  }
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
  for (const route of memberRoutes) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/invitation$/);
  }
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
  expect(response.headers()["referrer-policy"]).toBe("same-origin");
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

test("member dashboard and Circle preview are accessible at phone and desktop sizes without a composer", async ({
  page,
}, testInfo) => {
  await login(page, "active");
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const homeResponse = await page.goto("/member");
    expect(homeResponse.headers()["cache-control"]).toContain("no-store");
    await expect(page.locator(".member-circle")).toHaveCount(7);
    const crisis = page.getByRole("complementary", { name: "Crisis support" });
    await expect(crisis).toContainText("Emotional distress: call/text 988");
    await expect(crisis).toContainText(
      "Immediate danger or medical emergency: call 911",
    );
    await expect(crisis.locator('a[href="tel:988"]')).toBeVisible();
    await expect(crisis.locator('a[href="sms:988"]')).toBeVisible();
    await expect(crisis.locator('a[href="tel:911"]')).toBeVisible();
    await expect(
      crisis.getByRole("link", { name: "Support resources" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Your home" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(
      page.getByRole("link", { name: "Administrator tools" }),
    ).toHaveCount(0);
    // ↗ marks links that leave the member app; in-app links use →.
    const arrows = await page.locator("a").evaluateAll((links) =>
      links
        .filter((link) => /[↗→]/.test(link.textContent))
        .map((link) => ({
          internal: new URL(link.href).origin === location.origin,
          arrow: link.textContent.includes("↗") ? "↗" : "→",
        })),
    );
    expect(arrows.filter((link) => link.internal).length).toBeGreaterThan(2);
    for (const link of arrows)
      expect(link.arrow).toBe(link.internal ? "→" : "↗");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`member-home-${width}.png`),
      fullPage: true,
    });
    await page
      .getByRole("link", { name: "Explore the Circle previews" })
      .click();
    await expect(page).toHaveURL(/\/member\/circles$/);
    await page
      .getByRole("link", { name: "Explore preview of Recovery & Healing" })
      .click();
    await expect(page).toHaveURL(/\/member\/circles\/recovery-healing$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Recovery & Healing",
    );
    await expect(
      page.getByText("Conversations and posting aren’t open yet.", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expect(page.locator("form")).toHaveCount(1);
    await expect(page.locator("form")).toHaveAttribute(
      "action",
      "/auth/logout",
    );
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(result.violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`recovery-circle-${width}.png`),
      fullPage: true,
    });
    await page
      .getByRole("link", { name: "Back to all Circles", exact: false })
      .click();
    await expect(page).toHaveURL(/\/member\/circles$/);
    await page.getByRole("link", { name: "Your home" }).click();
    await expect(page).toHaveURL(/\/member$/);
  }
});

test("profile privacy settings persist across reload, default off, and reject forged writes", async ({
  page,
  request,
}, testInfo) => {
  await login(page, "active");
  await page
    .getByRole("link", { name: "Profile & privacy", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Profile & privacy" }),
  ).toBeVisible();
  await expect(page.getByRole("checkbox").nth(0)).not.toBeChecked();
  await expect(page.getByRole("checkbox").nth(1)).not.toBeChecked();
  await page
    .getByLabel("Your unique handle", { exact: true })
    .fill("gentle_river");
  await page.getByLabel("Display name", { exact: true }).fill("River");
  await page.getByRole("button", { name: "Save profile & privacy" }).click();
  await expect(page.getByRole("status")).toContainText("have been saved");
  await expect(
    page.getByLabel("Your unique handle", { exact: true }),
  ).toHaveAttribute("readonly", "");
  await expect(
    page.getByLabel("Display name", { exact: true }),
  ).toHaveAttribute("readonly", "");
  await page.getByRole("checkbox").nth(0).check();
  await page.getByRole("checkbox").nth(1).check();
  await page.getByRole("button", { name: "Save profile & privacy" }).click();
  await page.reload();
  await expect(page.getByRole("checkbox").nth(0)).toBeChecked();
  await expect(page.getByRole("checkbox").nth(1)).toBeChecked();
  await page.getByRole("checkbox").nth(0).uncheck();
  await page.getByRole("checkbox").nth(1).uncheck();
  await page.getByRole("button", { name: "Save profile & privacy" }).click();
  await page.reload();
  await expect(page.getByRole("checkbox").nth(0)).not.toBeChecked();
  await expect(page.getByRole("checkbox").nth(1)).not.toBeChecked();
  const forgery = await request.post("/member/settings/save", {
    headers: { origin: "https://attacker.example.test" },
    form: { handle: "gentle_river", displayName: "River" },
  });
  expect(forgery.status()).toBe(403);
  const injected = await page.request.post("/member/settings/save", {
    headers: { origin: "http://127.0.0.1:4180" },
    form: { handle: "gentle_river", displayName: "River", memberId: "other" },
  });
  expect(injected.status()).toBe(403);
  expect((await request.get("/member/settings/save")).status()).toBe(405);
  await page.goto("/member/settings?notice=__proto__");
  await expect(page.getByRole("status")).toContainText(
    "We couldn't save your settings",
  );
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`profile-settings-${width}.png`),
      fullPage: true,
    });
  }
});

test("all Circle previews, resource hub and Learning page work for active members", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await login(page, "active");
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/member/circles");
    const links = await page.locator(".member-circle a").evaluateAll((items) =>
      items.map((item) => ({
        href: item.getAttribute("href"),
        label: item.textContent,
      })),
    );
    expect(links).toHaveLength(7);
    for (const link of links) {
      const response = await page.goto(link.href);
      expect(response.headers()["cache-control"]).toContain("no-store");
      await expect(
        page.locator(".member-navigation a[aria-current=page]"),
      ).toHaveText("Circles →");
      await expect(page.locator("h1")).not.toBeEmpty();
      await expect(page.locator("blockquote")).not.toBeEmpty();
      await page
        .getByText("A few ways to explore this", { exact: true })
        .click();
      await expect(page.locator("details")).toHaveAttribute("open", "");
      await expect(page.locator("details li")).toHaveCount(3);
      await expect(page.locator("form")).toHaveCount(1);
      await expect(page.locator("form")).toHaveAttribute(
        "action",
        "/auth/logout",
      );
      await expect(page.getByRole("textbox")).toHaveCount(0);
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    for (const [path, heading] of [
      ["circles", "Find your Circle."],
      ["resources", "Support beyond the screen."],
      ["learning", "Learning, at your pace."],
    ]) {
      const response = await page.goto(`/member/${path}`);
      expect(response.headers()["cache-control"]).toContain("no-store");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`${path}-${width}.png`),
        fullPage: true,
      });
    }
    await page.goto("/member/resources");
    await expect(
      page.locator(
        '.member-resource-grid a[href="https://havenforward.com/support"]',
      ),
    ).toBeVisible();
    await page.goto("/member/circles/veterans-connection");
    await page.screenshot({
      path: testInfo.outputPath(`veterans-circle-${width}.png`),
      fullPage: true,
    });
    await page.goto("/member/learning");
    await expect(
      page.getByText("Library in preparation.", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Explore Circle reflections" })
      .click();
    await expect(page).toHaveURL(/\/member\/circles$/);
  }
  for (const slug of ["not-a-circle", "__proto__", "constructor"]) {
    await page.goto(`/member/circles/${slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "That Circle isn’t here.",
    );
    await expect(
      page.getByRole("link", { name: "Browse all Circles" }),
    ).toBeVisible();
  }
});
