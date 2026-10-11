// Test-process only: this file is never imported by application code.
// Use reserved synthetic identities. It does not verify real provider JWTs.
const originalFetch = globalThis.fetch;
const enrolled = new Set(["00000000-0000-4000-8000-000000000001"]);
const users = new Map(
  [
    "active",
    "pending",
    "suspended",
    "admin",
    "admin-new",
    "admin-denied",
    "admin-manual",
  ].map((name, i) => {
    const id = `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;
    return [
      id,
      {
        id,
        aud: "authenticated",
        role: "authenticated",
        email: `${name}@example.test`,
        email_confirmed_at: "2026-01-01T00:00:00Z",
        created_at: "2026-01-01T00:00:00Z",
        app_metadata: {},
        user_metadata: {},
        identities: [],
        is_anonymous: false,
      },
    ];
  }),
);
const factorId = "11111111-1111-4111-8111-111111111111";
const factors = new Map();
for (const user of users.values())
  if (
    user.email === "admin@example.test" ||
    user.email === "admin-denied@example.test"
  ) {
    enrolled.add(user.id);
    factors.set(user.id, [
      {
        id: factorId,
        factor_type: "totp",
        status: "verified",
        friendly_name: "Fixture authenticator",
      },
    ]);
  }
for (const user of users.values())
  if (
    ["admin-new@example.test", "admin-manual@example.test"].includes(user.email)
  )
    enrolled.add(user.id);
function jwt(id, aal = "aal1") {
  return [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(
      JSON.stringify({
        sub: id,
        aal,
        exp: Math.floor(Date.now() / 1000) + 3600,
        aud: "authenticated",
        role: "authenticated",
      }),
    ).toString("base64url"),
    Buffer.from("test-process-only").toString("base64url"),
  ].join(".");
}
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );
  if (url.origin !== "https://fixture.supabase.co")
    return originalFetch(input, init);
  const headers = new Headers(init.headers);
  const body = init.body ? JSON.parse(String(init.body)) : {};
  let id, aal;
  try {
    const claims = JSON.parse(
      Buffer.from(
        (headers.get("authorization") || "")
          .replace(/^Bearer /, "")
          .split(".")[1],
        "base64url",
      ).toString(),
    );
    id = claims.sub;
    aal = claims.aal;
  } catch {}
  if (url.pathname === "/auth/v1/token") {
    const user =
      url.searchParams.get("grant_type") === "refresh_token"
        ? users.get(String(body.refresh_token).replace("fixture-refresh-", ""))
        : [...users.values()].find(
            (user) =>
              user.email === body.email && body.password === "fixture-password",
          );
    if (!user)
      return Response.json(
        { code: "invalid_credentials", message: "Invalid credentials" },
        { status: 400 },
      );
    return Response.json({
      access_token: jwt(user.id),
      refresh_token: "fixture-refresh-" + user.id,
      expires_in: 3600,
      token_type: "bearer",
      user,
    });
  }
  if (url.pathname === "/auth/v1/user")
    return users.has(id)
      ? Response.json({ ...users.get(id), factors: factors.get(id) || [] })
      : Response.json({ message: "Invalid token" }, { status: 401 });
  if (url.pathname === "/auth/v1/logout")
    return new Response(null, { status: 204 });
  if (url.pathname === "/rest/v1/rpc/haven_member_self")
    return enrolled.has(id)
      ? Response.json({
          id,
          role: users.get(id)?.email.startsWith("admin") ? "admin" : "member",
          status: "active",
          consentVersion: "member-v1",
        })
      : Response.json(
          { code: "42501", message: "Access denied" },
          { status: 403 },
        );
  if (url.pathname === "/auth/v1/factors" && init.method === "POST") {
    factors.set(id, [
      {
        id: factorId,
        factor_type: "totp",
        status: "unverified",
        friendly_name: "Fixture authenticator",
      },
    ]);
    return Response.json({
      id: factorId,
      type: "totp",
      totp: {
        secret: "FIXTURE-SECRET",
        qr_code:
          users.get(id)?.email === "admin-manual@example.test"
            ? ""
            : '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="black"/></svg>',
        uri: "otpauth://fixture",
      },
    });
  }
  if (
    url.pathname === `/auth/v1/factors/${factorId}` &&
    init.method === "DELETE"
  ) {
    factors.set(id, []);
    return Response.json({ id: factorId });
  }
  if (url.pathname === `/auth/v1/factors/${factorId}/challenge`)
    return Response.json({
      id: "fixture-challenge",
      type: "totp",
      expires_at: Math.floor(Date.now() / 1000) + 300,
    });
  if (url.pathname === `/auth/v1/factors/${factorId}/verify`) {
    if (body.code !== "123456")
      return Response.json(
        { message: "Invalid code", code: "mfa_verification_failed" },
        { status: 422 },
      );
    factors.set(
      id,
      (factors.get(id) || []).map((f) => ({ ...f, status: "verified" })),
    );
    return Response.json({
      access_token: jwt(id, "aal2"),
      refresh_token: "fixture-refresh-" + id,
      expires_in: 3600,
      token_type: "bearer",
      user: { ...users.get(id), factors: factors.get(id) },
    });
  }
  if (
    [
      "/rest/v1/rpc/haven_issue_member_invitation",
      "/rest/v1/rpc/haven_revoke_member_invitation",
    ].includes(url.pathname)
  ) {
    if (
      aal !== "aal2" ||
      !users.get(id)?.email.startsWith("admin") ||
      users.get(id)?.email === "admin-denied@example.test"
    )
      return Response.json(
        { code: "42501", message: "Access denied" },
        { status: 403 },
      );
    return Response.json(
      url.pathname.endsWith("issue_member_invitation")
        ? {
            id: "22222222-2222-4222-8222-222222222222",
            expiresAt: "2026-12-01T00:00:00Z",
          }
        : { revoked: true },
    );
  }
  if (url.pathname === "/rest/v1/rpc/haven_redeem_member_invitation") {
    // Hash of the one fixture invitation; pending identity only, once.
    const { createHash } = await import("node:crypto");
    const accepted =
      id === "00000000-0000-4000-8000-000000000002" &&
      !enrolled.has(id) &&
      body.p_token_hash ===
        createHash("sha256").update("a".repeat(64)).digest("hex") &&
      body.p_consent_version === "member-v1";
    if (accepted) enrolled.add(id);
    return Response.json({ accepted });
  }
  return Response.json({ message: "Fixture route missing" }, { status: 500 });
};
