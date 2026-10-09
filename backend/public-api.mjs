const encoder = new TextEncoder();
const tokenPattern = /^[a-f0-9]{64}$/;
const allowedPaths = new Set(["hugs", "interest", "confirm", "unsubscribe"]);
const commonNames = ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "APP_ORIGIN"];
const safeHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy":
    "default-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};
function json(status, body, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...safeHeaders,
      "Content-Type": "application/json; charset=utf-8",
      ...extra,
    },
  });
}
export async function hash(value) {
  const bytes = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(bytes)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
function token() {
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
async function actorHash(secret, ip, scope, day) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${scope}:${day}:${ip}`),
  );
  return [...new Uint8Array(bytes)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
function escapeHtml(text) {
  return text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
async function payload(request) {
  if (Number(request.headers.get("Content-Length") || 0) > 4096)
    throw new Error("invalid");
  const reader = request.body?.getReader();
  const chunks = [];
  let size = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4096) {
          await reader.cancel();
          throw new Error("invalid");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const bytes = new Uint8Array(size);
  let position = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, position);
    position += chunk.byteLength;
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const type = request.headers.get("Content-Type") || "";
  if (type.startsWith("application/json")) {
    const value = JSON.parse(text);
    if (!value || Array.isArray(value) || typeof value !== "object")
      throw new Error("invalid");
    return value;
  }
  if (type.startsWith("application/x-www-form-urlencoded"))
    return Object.fromEntries(new URLSearchParams(text));
  throw new Error("invalid");
}
function confirmationPage(action, value) {
  // GET never consumes tokens: scanners and link previews cannot enroll/delete users.
  const title =
    action === "confirm"
      ? "Confirm email updates"
      : "Unsubscribe from email updates";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | HavenForward</title></head><body><main><h1>${title}</h1><p>This concerns email updates only, not membership in the private community.</p><form method="post" action="/api/public/${action}"><input type="hidden" name="token" value="${escapeHtml(value)}"><button type="submit">${title}</button></form></main></body></html>`;
  return new Response(html, {
    headers: { ...safeHeaders, "Content-Type": "text/html; charset=utf-8" },
  });
}
export async function handlePublicApi(request, env, dependencies = {}) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/public\//, "");
  if (!allowedPaths.has(path)) return json(404, { error: "Not found" });
  const managingConsent = path === "confirm" || path === "unsubscribe";
  const requiredNames = [...commonNames];
  if (!managingConsent) {
    if (env.PUBLIC_INTERACTIONS_ENABLED !== "true")
      return json(503, { error: "Public interactions are not available yet." });
    if (request.method === "POST")
      requiredNames.push("ACTOR_HASH_SECRET", "TURNSTILE_SECRET_KEY");
    if (path === "interest") requiredNames.push("RESEND_API_KEY", "EMAIL_FROM");
  }
  if (requiredNames.some((n) => !env[n]))
    return json(503, { error: "Public interactions are not available yet." });
  if (
    !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(env.SUPABASE_URL) ||
    (!managingConsent &&
      request.method === "POST" &&
      env.ACTOR_HASH_SECRET.length < 32)
  )
    return json(503, { error: "Service configuration is incomplete." });
  if (url.origin !== env.APP_ORIGIN)
    return json(403, { error: "Origin not allowed" });
  const fetcher = dependencies.fetch || fetch;
  // Codes describe fixed operations only: never log provider bodies, exceptions,
  // request parameters, addresses, IPs, keys or challenge answers.
  let failureCode = "request_processing";
  function failure(code, message = "Service temporarily unavailable.") {
    try {
      dependencies.reportFailure?.(code);
    } catch {
      // Diagnostic sinks must not change the response or trigger a retry.
    }
    return json(503, { error: message, code });
  }
  async function rpc(name, parameters = {}) {
    failureCode = `database_${name}_request`;
    const response = await fetcher(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SECRET_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(parameters),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      failureCode = `database_${name}_http_${response.status}`;
      throw new Error("backend unavailable");
    }
    failureCode = `database_${name}_response`;
    return response.json();
  }
  try {
    if (request.method === "GET") {
      if (path === "hugs") {
        const result = await rpc("haven_hug_count");
        return json(200, { total: result.total });
      }
      if (path === "confirm" || path === "unsubscribe") {
        const value = url.searchParams.get("token") || "";
        if (!tokenPattern.test(value))
          return json(400, { error: "This link is invalid." });
        return confirmationPage(path, value);
      }
      return json(405, { error: "Method not allowed" }, { Allow: "POST" });
    }
    if (request.method !== "POST")
      return json(405, { error: "Method not allowed" }, { Allow: "GET, POST" });
    if (request.headers.get("Origin") !== env.APP_ORIGIN)
      return json(403, { error: "Origin not allowed" });
    let body;
    try {
      body = await payload(request);
    } catch {
      return json(400, { error: "Invalid request" });
    }
    if (path === "confirm" || path === "unsubscribe") {
      if (typeof body.token !== "string" || !tokenPattern.test(body.token))
        return json(400, { error: "This link is invalid." });
      const result = await rpc(
        path === "confirm"
          ? "haven_confirm_interest"
          : "haven_unsubscribe_interest",
        { p_token_hash: await hash(body.token) },
      );
      if (path === "confirm" && !result.confirmed)
        return json(400, {
          error: "This link is invalid, expired, or already used.",
        });
      return json(200, {
        message:
          path === "confirm"
            ? "Your email updates are confirmed. This does not grant community membership."
            : "This email-update subscription has been removed.",
      });
    }
    // Cloudflare sets this header; cf metadata proves the production adapter is at the edge.
    const ip = dependencies.trustedIp
      ? dependencies.trustedIp(request)
      : request.cf
        ? request.headers.get("CF-Connecting-IP")
        : null;
    if (!ip)
      return failure(
        "trusted_network_missing",
        "Abuse protection is unavailable.",
      );
    if (
      typeof body.turnstileToken !== "string" ||
      body.turnstileToken.length === 0 ||
      body.turnstileToken.length > 2048
    )
      return json(400, { error: "Complete the verification challenge." });
    failureCode = "verification_request";
    const verify = await fetcher(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret: env.TURNSTILE_SECRET_KEY,
          response: body.turnstileToken,
          remoteip: ip,
        }),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!verify.ok) {
      const knownErrors = new Set([
        "missing-input-secret",
        "invalid-input-secret",
        "missing-input-response",
        "invalid-input-response",
        "bad-request",
        "timeout-or-duplicate",
        "internal-error",
      ]);
      let reason;
      try {
        const rejected = await verify.json();
        reason = Array.isArray(rejected["error-codes"])
          ? rejected["error-codes"].find((code) => knownErrors.has(code))
          : undefined;
      } catch {
        // HTML or unknown provider text must never enter diagnostics.
      }
      const code = `verification_http_${verify.status}${reason ? "_" + reason.replaceAll("-", "_") : ""}`;
      return failure(code, "Verification is unavailable.");
    }
    failureCode = "verification_response";
    const verdict = await verify.json();
    if (
      verdict.success !== true ||
      verdict.hostname !== url.hostname ||
      verdict.action !== path
    )
      return json(400, { error: "Verification failed." });
    failureCode = "network_hash";
    const actor = await actorHash(
      env.ACTOR_HASH_SECRET,
      ip,
      path,
      new Date().toISOString().slice(0, 10),
    );
    if (path === "hugs") {
      const result = await rpc("haven_send_hug", { p_actor_hash: actor });
      return json(200, { total: result.total, accepted: result.accepted });
    }
    if (body.consent !== true || body.consentVersion !== "interest-v1")
      return json(400, { error: "Consent to email updates is required." });
    if (typeof body.email !== "string")
      return json(400, { error: "Enter a valid email address." });
    const email = body.email.trim().toLowerCase();
    if (
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      /[\r\n<>]/.test(email)
    )
      return json(400, { error: "Enter a valid email address." });
    failureCode = "confirmation_tokens";
    const confirmation = token();
    const unsubscribe = token();
    const confirmationHash = await hash(confirmation);
    const result = await rpc("haven_request_interest", {
      p_actor_hash: actor,
      p_email: email,
      p_confirmation_hash: confirmationHash,
      p_unsubscribe_hash: await hash(unsubscribe),
      p_consent_version: "interest-v1",
    });
    if (result.rate_limited)
      return json(
        429,
        { error: "Please try again later." },
        { "Retry-After": "3600" },
      );
    if (result.send_confirmation) {
      const confirmLink = `${env.APP_ORIGIN}/api/public/confirm?token=${confirmation}`;
      const unsubscribeLink = `${env.APP_ORIGIN}/api/public/unsubscribe?token=${unsubscribe}`;
      let sent = false;
      try {
        const mail = await fetcher("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
            "Idempotency-Key": confirmationHash,
          },
          body: JSON.stringify({
            from: env.EMAIL_FROM,
            to: [email],
            subject: "Confirm your HavenForward email updates",
            text: `You requested HavenForward email updates. This is not a community invitation. Confirm within 24 hours: ${confirmLink}\n\nCancel or unsubscribe: ${unsubscribeLink}\n\nIf you did not request these updates, you can ignore this email.`,
          }),
          signal: AbortSignal.timeout(10000),
        });
        sent = mail.ok;
      } catch {
        sent = false;
      }
      if (!sent) {
        try {
          await rpc("haven_cancel_pending_interest", {
            p_token_hash: confirmationHash,
          });
        } catch {
          // Do not turn delivery errors into an email-existence signal.
          dependencies.reportFailure?.("pending_cleanup");
        }
        dependencies.reportFailure?.("email_delivery");
      }
    }
    return json(202, {
      message:
        "If eligible, we will attempt to send a confirmation email. If none arrives, try again later. This does not grant community membership.",
    });
  } catch {
    return failure(failureCode);
  }
}
