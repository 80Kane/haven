import test from "node:test";
import assert from "node:assert/strict";
import {
  createAuthClient,
  clearAuthCookies,
  cookieOptions,
  type Cookie,
  type CookiePort,
} from "../lib/provider";
import { entry } from "../lib/flow";
const config = {
  origin: "https://members-staging.example.test",
  url: "https://fixture.supabase.co",
  key: "sb_publishable_fixture",
  secure: true,
};
const id = "00000000-0000-4000-8000-000000000001";
const user = {
  id,
  aud: "authenticated",
  role: "authenticated",
  email: "person@example.test",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
  app_metadata: {},
  user_metadata: {},
  identities: [],
  is_anonymous: false,
};
const member = {
  id,
  role: "member",
  status: "active",
  consentVersion: "member-v1",
};
function jwt(exp: number) {
  return [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(
      JSON.stringify({
        sub: id,
        exp,
        aud: "authenticated",
        role: "authenticated",
      }),
    ).toString("base64url"),
    "fixture-signature",
  ].join(".");
}
function jar(initial: Cookie[] = []) {
  const values = new Map(initial.map((cookie) => [cookie.name, cookie]));
  const writes: Cookie[] = [];
  const port: CookiePort = {
    getAll: () =>
      [...values.values()].map(({ name, value }) => ({ name, value })),
    setAll: (cookies) => {
      for (const cookie of cookies) {
        writes.push(cookie);
        if (cookie.options.maxAge === 0) values.delete(cookie.name);
        else values.set(cookie.name, cookie);
      }
    },
  };
  return { port, values, writes };
}
function fixture() {
  const requests: {
    url: string;
    body: unknown;
    auth: string | null;
    cache?: RequestCache;
  }[] = [];
  let revision = 0;
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({
      url,
      body,
      auth: headers.get("authorization"),
      cache: init?.cache,
    });
    if (url.includes("/auth/v1/token")) {
      revision++;
      const exp = Math.floor(Date.now() / 1000) + 3600;
      return Response.json({
        access_token: jwt(exp),
        refresh_token: "fixture-refresh-" + revision,
        expires_in: 3600,
        expires_at: exp,
        token_type: "bearer",
        user,
      });
    }
    if (url.endsWith("/auth/v1/user")) return Response.json(user);
    if (url.includes("/auth/v1/logout"))
      return new Response(null, { status: 204 });
    if (url.endsWith("/rest/v1/rpc/haven_member_self"))
      return Response.json(member);
    return Response.json({ message: "fixture route missing" }, { status: 500 });
  };
  return { requests, fetcher };
}
test("real SSR adapter uses HttpOnly host cookies and caller credentials with uncached provider requests", async () => {
  const store = jar();
  const api = fixture();
  const client = createAuthClient(config, store.port, api.fetcher);
  assert.equal(
    (
      await client.auth.signInWithPassword({
        email: user.email,
        password: "fixture password",
      })
    ).error,
    null,
  );
  assert.ok(store.writes.length > 0);
  for (const cookie of store.writes) {
    assert.ok(cookie.name.startsWith("__Host-haven-auth"));
    assert.equal(cookie.options.httpOnly, true);
    assert.equal(cookie.options.secure, true);
    assert.equal(cookie.options.sameSite, "lax");
    assert.equal(cookie.options.path, "/");
    assert.equal(cookie.options.domain, undefined);
  }
  assert.deepEqual(await entry(client), { state: "member", member });
  assert.match(
    api.requests.find((x) => x.url.endsWith("/rpc/haven_member_self"))!.auth!,
    /^Bearer ey/,
  );
  assert.ok(api.requests.every((x) => x.cache === "no-store"));
  assert.equal(cookieOptions(config).maxAge, 28800);
});
test("expired session rotates refresh cookies and the next request can use the new session", async () => {
  const api = fixture();
  const expired = {
    access_token: jwt(1),
    refresh_token: "fixture-expired-refresh",
    expires_in: 3600,
    expires_at: 1,
    token_type: "bearer",
    user,
  };
  const store = jar([
    {
      name: "__Host-haven-auth",
      value:
        "base64-" + Buffer.from(JSON.stringify(expired)).toString("base64url"),
      options: cookieOptions(config),
    },
  ]);
  assert.deepEqual(
    await entry(createAuthClient(config, store.port, api.fetcher)),
    { state: "member", member },
  );
  assert.ok(
    api.requests.some((x) => x.url.includes("grant_type=refresh_token")),
  );
  assert.ok(store.writes.some((x) => x.options.maxAge !== 0));
  assert.deepEqual(
    await entry(createAuthClient(config, store.port, api.fetcher)),
    { state: "member", member },
  );
  assert.equal(
    api.requests.filter((x) => x.url.includes("grant_type=refresh_token"))
      .length,
    1,
  );
});
test("local logout revokes the current refresh session and clears auth cookies without deleting unrelated cookies", async () => {
  const api = fixture();
  const store = jar();
  const client = createAuthClient(config, store.port, api.fetcher);
  await client.auth.signInWithPassword({
    email: user.email,
    password: "fixture password",
  });
  store.values.set("unrelated", {
    name: "unrelated",
    value: "keep",
    options: {},
  });
  assert.equal((await client.auth.signOut({ scope: "local" })).error, null);
  clearAuthCookies(config, store.port);
  assert.ok(api.requests.some((x) => x.url.includes("/logout?scope=local")));
  assert.deepEqual([...store.values.keys()], ["unrelated"]);
  assert.deepEqual(
    await entry(createAuthClient(config, store.port, api.fetcher)),
    { state: "signed-out" },
  );
});
test("request-scoped clients never reuse another browser's session", async () => {
  const api = fixture();
  const a = jar();
  const b = jar();
  await createAuthClient(config, a.port, api.fetcher).auth.signInWithPassword({
    email: user.email,
    password: "fixture password",
  });
  assert.deepEqual(await entry(createAuthClient(config, b.port, api.fetcher)), {
    state: "signed-out",
  });
  assert.equal(b.writes.length, 0);
});
