import test from "node:test";
import assert from "node:assert/strict";
import { setupMarkup } from "../lib/mfa-setup";
const id = "11111111-1111-4111-8111-111111111111";
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg"><rect width="240" height="240"/></svg>';
function result(qr_code: unknown) {
  return { id, totp: { secret: "FIXTURE-SECRET", qr_code } };
}
test("valid provider SVG over the former 100 KB limit remains a passive encoded image", () => {
  const large = svg.replace("</svg>", `<!--${"x".repeat(120000)}--></svg>`);
  const setup = setupMarkup(result("data:image/svg+xml;utf-8," + large));
  assert.equal(setup?.qrAvailable, true);
  assert.ok(setup?.markup.includes(encodeURIComponent(large)));
  assert.ok(!setup?.markup.includes("<svg"));
  assert.equal(setupMarkup(result(svg))?.qrAvailable, true);
});
test("missing, malformed or oversized QR falls back to escaped manual key without blocking MFA", () => {
  for (const qr of [
    undefined,
    "",
    7,
    "javascript:alert(1)",
    "<svg " + "x".repeat(1000001),
  ]) {
    const setup = setupMarkup(result(qr));
    assert.equal(setup?.qrAvailable, false);
    assert.ok(setup?.markup.includes("manual setup key"));
    assert.ok(setup?.markup.includes('action="/admin/mfa/verify"'));
    assert.ok(!setup?.markup.includes("<img"));
  }
  const setup = setupMarkup({
    id,
    totp: { secret: '<script>"secret"</script>' },
  });
  assert.ok(!setup?.markup.includes("<script>"));
});
test("missing or invalid enrollment identity and setup key fail closed", () => {
  for (const value of [
    null,
    {},
    { id: "bad", totp: { secret: "key" } },
    { id, totp: { secret: 123 } },
    { id, totp: { secret: "" } },
    { id, totp: { secret: "x".repeat(257) } },
  ])
    assert.equal(setupMarkup(value), null);
});
