import { hash } from "./public-api.mjs";

// First delivery is restricted to the existing protected development preview.
export const memberStagingOrigin =
  "https://feat-public-interactions-bac.haven-77v.pages.dev";
const paths = new Map([
  ["self", "GET"],
  ["invitations", "POST"],
  ["invitations/revoke", "POST"],
  ["invitations/redeem", "POST"],
  ["access", "POST"],
]);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const tokenPattern = /^[a-f0-9]{64}$/;
const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy":
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};
function json(status, body, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json; charset=utf-8",
      ...extra,
    },
  });
}
function opaqueToken() {
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
async function readBody(request) {
  if (
    Number(request.headers.get("Content-Length") || 0) > 2048 ||
    !/^application\/json(?:\s*;|$)/i.test(
      request.headers.get("Content-Type") || "",
    )
  )
    throw Error();
  const reader = request.body?.getReader();
  if (!reader) throw Error();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) {
        await reader.cancel();
        throw Error();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  const body = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  );
  if (!body || Array.isArray(body) || typeof body !== "object") throw Error();
  return body;
}
function keys(body, allowed) {
  return Object.keys(body).every((key) => allowed.includes(key));
}

export async function handleMemberApi(request, env, dependencies = {}) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/member\//, "");
  if (!paths.has(path) || url.search) return json(404, { error: "Not found" });
  if (
    url.origin !== memberStagingOrigin ||
    env.MEMBER_APP_ORIGIN !== memberStagingOrigin
  )
    return json(404, { error: "Not found" });
  if (
    env.MEMBER_FOUNDATION_ENABLED !== "true" ||
    !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(env.SUPABASE_URL || "") ||
    !env.SUPABASE_PUBLISHABLE_KEY
  )
    return json(503, { error: "Member access is not available yet." });
  if (request.method !== paths.get(path))
    return json(
      405,
      { error: "Method not allowed" },
      { Allow: paths.get(path) },
    );
  if (
    request.method === "POST" &&
    request.headers.get("Origin") !== env.MEMBER_APP_ORIGIN
  )
    return json(403, { error: "Access denied" });
  // Authorization only: no browser storage, password, cookie or session lifecycle.
  const authorization = request.headers.get("Authorization") || "";
  if (!/^Bearer [A-Za-z0-9._~-]{16,8192}$/.test(authorization))
    return json(401, { error: "Sign-in required" });
  const fetcher = dependencies.fetch || fetch;
  let failureCode = "identity_request";
  function unavailable() {
    try {
      dependencies.reportFailure?.(failureCode);
    } catch {
      /* diagnostic sinks never change outcomes */
    }
    return json(503, { error: "Member service temporarily unavailable." });
  }
  try {
    const auth = await fetcher(`${env.SUPABASE_URL}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        Authorization: authorization,
      },
      signal: AbortSignal.timeout(10000),
    });
    if ([401, 403].includes(auth.status))
      return json(401, { error: "Sign-in required" });
    if (!auth.ok) return unavailable();
    failureCode = "identity_response";
    const user = await auth.json();
    // Read current user status from Auth, never from client metadata or decoded JWT.
    if (
      !uuid.test(user.id || "") ||
      !user.email_confirmed_at ||
      !user.email ||
      user.is_anonymous === true ||
      user.deleted_at ||
      (user.banned_until && Date.parse(user.banned_until) > Date.now())
    )
      return json(403, { error: "Access denied" });
    let name;
    let parameters = {};
    let rawToken;
    if (path === "self") name = "haven_member_self";
    else {
      let body;
      try {
        body = await readBody(request);
      } catch {
        return json(400, { error: "Invalid request" });
      }
      if (path === "invitations") {
        if (
          !keys(body, ["email", "expiresHours"]) ||
          typeof body.email !== "string" ||
          body.email.length > 254 ||
          !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(body.email.trim()) ||
          !Number.isInteger(body.expiresHours) ||
          body.expiresHours < 1 ||
          body.expiresHours > 168
        )
          return json(400, { error: "Invalid request" });
        rawToken = opaqueToken();
        name = "haven_issue_member_invitation";
        parameters = {
          p_email: body.email.trim().toLowerCase(),
          p_token_hash: await hash(rawToken),
          p_expires_hours: body.expiresHours,
        };
      } else if (path === "invitations/revoke") {
        if (
          !keys(body, ["invitationId"]) ||
          !uuid.test(body.invitationId || "")
        )
          return json(400, { error: "Invalid request" });
        name = "haven_revoke_member_invitation";
        parameters = { p_invitation_id: body.invitationId };
      } else if (path === "invitations/redeem") {
        if (
          !keys(body, ["token", "consent", "consentVersion"]) ||
          !tokenPattern.test(body.token || "") ||
          body.consent !== true ||
          body.consentVersion !== "member-v1"
        )
          return json(400, { error: "Invitation cannot be accepted" });
        name = "haven_redeem_member_invitation";
        parameters = {
          p_token_hash: await hash(body.token),
          p_consent_version: body.consentVersion,
        };
      } else {
        if (
          !keys(body, ["memberId", "status", "role"]) ||
          !uuid.test(body.memberId || "") ||
          !["active", "suspended", "removed"].includes(body.status) ||
          !["member", "moderator", "admin"].includes(body.role)
        )
          return json(400, { error: "Invalid request" });
        name = "haven_set_member_access";
        parameters = {
          p_member_id: body.memberId,
          p_status: body.status,
          p_role: body.role,
        };
      }
    }
    // Caller-scoped RPC: SQL independently checks identity, membership and MFA.
    // No service secret or client-provided actor ID reaches privileged functions.
    failureCode = "member_database_request";
    const result = await fetcher(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(parameters),
      signal: AbortSignal.timeout(10000),
    });
    if ([401, 403].includes(result.status))
      return json(403, { error: "Access denied" });
    if (result.status === 400)
      return json(400, {
        error:
          path === "invitations/redeem"
            ? "Invitation cannot be accepted"
            : "Request cannot be completed",
      });
    if (!result.ok) return unavailable();
    failureCode = "member_database_response";
    const data = await result.json();
    if (path === "invitations/redeem") {
      if (data?.accepted !== true)
        return json(400, { error: "Invitation cannot be accepted" });
      return json(200, { accepted: true });
    }
    if (path === "invitations") {
      if (
        !uuid.test(data?.id || "") ||
        typeof data.expiresAt !== "string" ||
        !Number.isFinite(Date.parse(data.expiresAt))
      )
        throw Error();
      return json(201, {
        id: data.id,
        expiresAt: data.expiresAt,
        token: rawToken,
      });
    }
    if (path === "self") {
      if (
        data?.id !== user.id ||
        data.status !== "active" ||
        !["member", "moderator", "admin"].includes(data.role) ||
        data.consentVersion !== "member-v1"
      )
        throw Error();
      return json(200, {
        id: data.id,
        role: data.role,
        status: "active",
        consentVersion: data.consentVersion,
      });
    }
    if (path === "access" && data?.updated === true)
      return json(200, { updated: true });
    if (path === "invitations/revoke" && data?.revoked === true)
      return json(200, { revoked: true });
    throw Error();
  } catch {
    return unavailable();
  }
}
