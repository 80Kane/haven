// Test-process only: this file is never imported by application code.
// Use reserved synthetic identities. It does not verify real provider JWTs.
const originalFetch = globalThis.fetch;
const enrolled = new Set(["00000000-0000-4000-8000-000000000001"]);
const users = new Map(
  ["active", "pending", "suspended"].map((name, i) => {
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
function jwt(id) {
  return [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(
      JSON.stringify({
        sub: id,
        exp: Math.floor(Date.now() / 1000) + 3600,
        aud: "authenticated",
        role: "authenticated",
      }),
    ).toString("base64url"),
    "test-process-only",
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
  let id;
  try {
    id = JSON.parse(
      Buffer.from(
        (headers.get("authorization") || "")
          .replace(/^Bearer /, "")
          .split(".")[1],
        "base64url",
      ).toString(),
    ).sub;
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
      ? Response.json(users.get(id))
      : Response.json({ message: "Invalid token" }, { status: 401 });
  if (url.pathname === "/auth/v1/logout")
    return new Response(null, { status: 204 });
  if (url.pathname === "/rest/v1/rpc/haven_member_self")
    return enrolled.has(id)
      ? Response.json({
          id,
          role: "member",
          status: "active",
          consentVersion: "member-v1",
        })
      : Response.json(
          { code: "42501", message: "Access denied" },
          { status: 403 },
        );
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
