import { uuid } from "./admin";
import { escapeHtml as e } from "./private-html";

export function setupMarkup(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const { id, totp } = data as { id?: unknown; totp?: unknown };
  if (
    typeof id !== "string" ||
    !uuid.test(id) ||
    !totp ||
    typeof totp !== "object"
  )
    return null;
  const { secret, qr_code } = totp as { secret?: unknown; qr_code?: unknown };
  if (typeof secret !== "string" || !secret.trim() || secret.length > 256)
    return null;
  // QR is presentation only. A valid provider setup key can be entered manually.
  // Keep the SVG passive in an image, never inject its markup into the document.
  let svg =
    typeof qr_code === "string" && qr_code.length <= 1_000_000 ? qr_code : "";
  const prefix = "data:image/svg+xml;utf-8,";
  if (svg.startsWith(prefix)) svg = svg.slice(prefix.length);
  const qrAvailable = /^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(svg);
  const image = qrAvailable
    ? `<p>Scan this QR code with your authenticator app, or enter the setup key manually.</p><img width="240" height="240" alt="Authenticator setup QR code" src="${e("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg))}">`
    : `<p role="status">The QR image is unavailable. Add an account in your authenticator app using the manual setup key below. Choose a time-based code.</p>`;
  return {
    qrAvailable,
    markup: `${image}<p>Keep the setup key private.</p><p>Manual setup key: <code>${e(secret)}</code></p><form method="post" action="/admin/mfa/verify"><input type="hidden" name="factorId" value="${e(id)}"><label for="code">Six-digit authenticator code</label><input id="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" required><button>Verify authenticator</button></form><p>Save the setup key in your authenticator before leaving this screen. Reloading this POST can restart setup.</p>`,
  };
}
