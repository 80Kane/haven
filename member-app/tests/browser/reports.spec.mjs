import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function login(page, name) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(`${name}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
test("report intake, private status and MFA administrator review work without leaking report text", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(90_000);
  for (const route of [
    "/member/report",
    "/admin/reports",
    "/admin/reports/11111111-1111-4111-8111-111111111111",
  ]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login$/);
  }
  for (const name of ["suspended"]) {
    await login(page, name);
    await page.goto("/member/report");
    await expect(page).toHaveURL(/\/invitation$/);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
  }
  await login(page, "active");
  await page.goto("/member/report?circle=choices-change");
  await expect(page.getByLabel("Related Circle (optional)")).toHaveValue(
    "choices-change",
  );
  const key = await page.locator('input[name="submissionKey"]').inputValue();
  const details =
    "Synthetic privacy concern. <script>window.__reportExecuted=true</script>";
  await page.getByLabel("What kind of concern?").selectOption("privacy");
  await page
    .getByLabel("What would you like an administrator to know?")
    .fill(details);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Send report", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("has been received");
  await expect(page.locator(".report-history li")).toHaveCount(1);
  await expect(page.locator(".report-history strong")).toHaveText("Received");
  await expect(page.locator(".report-history")).not.toContainText(details);
  const id = (await page.locator(".report-reference").textContent())
    .replace("Reference: ", "")
    .trim();
  const duplicate = await page.request.post("/member/report/submit", {
    headers: { origin: "http://127.0.0.1:4180" },
    form: {
      submissionKey: key,
      circle: "choices-change",
      category: "privacy",
      details,
      acknowledge: "yes",
    },
    maxRedirects: 0,
  });
  expect(duplicate.status()).toBe(303);
  await page.reload();
  await expect(page.locator(".report-history li")).toHaveCount(1);
  const forgery = await page.request.post("/member/report/submit", {
    headers: { origin: "http://127.0.0.1:4180" },
    form: {
      submissionKey: key,
      circle: "",
      category: "privacy",
      details,
      acknowledge: "yes",
      reporterId: "other",
    },
  });
  expect(forgery.status()).toBe(403);
  for (const path of ["/member/report/submit", "/admin/reports/update"]) {
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
  await page.goto(`/admin/reports/${id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Administrator access is required.",
  );
  await expect(page.locator("body")).not.toContainText(details);
  const denied = await page.request.post("/admin/reports/update", {
    headers: { origin: "http://127.0.0.1:4180" },
    form: { reportId: id, version: "1", status: "in_review" },
    maxRedirects: 0,
  });
  expect(denied.headers().location).toContain("notice=denied");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "admin");
  await page.goto("/member/report");
  await expect(page.locator(".report-history")).toContainText(
    "haven’t submitted",
  );
  await page.goto("/admin/reports");
  await expect(page).toHaveURL(/\/admin\/mfa$/);
  const beforeMfa = await page.request.post("/admin/reports/update", {
    headers: { origin: "http://127.0.0.1:4180" },
    form: { reportId: id, version: "1", status: "in_review" },
    maxRedirects: 0,
  });
  expect(beforeMfa.headers().location).toContain("/admin/mfa");
  await page.getByLabel("Six-digit authenticator code").fill("123456");
  await page.getByRole("button", { name: "Verify authenticator" }).click();
  await page.getByRole("link", { name: "Review member reports" }).click();
  await expect(page.locator("body")).not.toContainText(details);
  await page
    .getByRole("link", { name: "Privacy concern", exact: true })
    .click();
  await expect(page.locator(".report-details")).toHaveText(details);
  expect(await page.evaluate(() => window.__reportExecuted)).toBeUndefined();
  await expect(page.locator("body")).not.toContainText("active@example.test");
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
      path: testInfo.outputPath(`report-review-${width}.png`),
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Start review", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("updated");
  const stale = await page.request.post("/admin/reports/update", {
    headers: { origin: "http://127.0.0.1:4180" },
    form: { reportId: id, version: "1", status: "in_review" },
    maxRedirects: 0,
  });
  expect(stale.headers().location).toContain("notice=stale");
  await page
    .getByLabel("Review outcome (visible to the submitting member)")
    .selectOption("review_complete");
  await page.getByRole("button", { name: "Close report", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Close report", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".report-list li")).toHaveCount(3);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page, "active");
  await page.goto("/member/report");
  await expect(page.locator(".report-history strong")).toHaveText("Closed");
  await expect(page.locator(".report-history")).toContainText(
    "Review completed",
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
      path: testInfo.outputPath(`member-report-${width}.png`),
      fullPage: true,
    });
  }
});
