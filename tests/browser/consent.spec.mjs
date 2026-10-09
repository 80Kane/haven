import { test, expect } from "@playwright/test";
import { handlePublicApi, hash } from "../../backend/public-api.mjs";

for (const action of ["confirm", "unsubscribe"]) {
  test(`${action} native form preserves Origin and keeps token out of Referer`, async ({
    page,
    baseURL,
  }) => {
    const token = "b".repeat(64);
    const origin = new URL(baseURL).origin;
    const env = {
      APP_ORIGIN: origin,
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SECRET_KEY: "fixture-only",
    };
    const posts = [];
    let mutations = 0;
    await page.route("**/api/public/**", async (route) => {
      const incoming = route.request();
      const headers = await incoming.allHeaders();
      if (incoming.method() === "POST") posts.push(headers);
      const request = new Request(incoming.url(), {
        method: incoming.method(),
        headers,
        ...(incoming.method() === "POST" ? { body: incoming.postData() } : {}),
      });
      const response = await handlePublicApi(request, env, {
        fetch: async (url, options) => {
          mutations++;
          expect(url).toBe(
            `${env.SUPABASE_URL}/rest/v1/rpc/haven_${action}_interest`,
          );
          expect(JSON.parse(options.body)).toEqual({
            p_token_hash: await hash(token),
          });
          return Response.json({ confirmed: true });
        },
      });
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: await response.text(),
      });
    });
    await page.goto(`/api/public/${action}?token=${token}`);
    expect(mutations).toBe(0);
    await Promise.all([
      page.waitForURL(`**/api/public/${action}`),
      page.getByRole("button").click(),
    ]);
    expect(posts).toHaveLength(1);
    expect(posts[0].origin).toBe(origin);
    expect(posts[0].referer).toBe(`${origin}/`);
    expect(mutations).toBe(1);
    await expect(page.locator("body")).toContainText(
      action === "confirm" ? "confirmed" : "removed",
    );
  });
}
