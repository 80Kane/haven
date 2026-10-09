import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

// Execute the actual browser script with a bounded DOM/network harness.
// This tests rejected event handlers, not real browser/CAPTCHA provider behavior.
test("failed CAPTCHA load resolves safely, keeps submission closed, and retries", async () => {
  const elements = new Map();
  function element(selector) {
    if (!elements.has(selector)) {
      const listeners = new Map();
      elements.set(selector, {
        disabled: true,
        textContent: "",
        dataset: { siteKey: "public-test-fixture" },
        validity: { valid: true },
        checked: false,
        addEventListener: (name, handler) => listeners.set(name, handler),
        querySelector: (name) => element(`${selector} ${name}`),
        replaceChildren() {},
        listeners,
      });
    }
    return elements.get(selector);
  }
  const window = {};
  let attempts = 0;
  let apiRequests = 0;
  const context = vm.createContext({
    window,
    AbortSignal,
    setTimeout,
    clearTimeout,
    fetch: async () => {
      apiRequests++;
      return Response.json({ total: 0 });
    },
    document: {
      querySelector: element,
      createElement: () => ({ remove() {} }),
      head: {
        append(script) {
          attempts++;
          queueMicrotask(() => {
            if (attempts === 1) return script.onerror();
            window.turnstile = {
              render(_, options) {
                options.callback("fresh-fixture-answer");
                return "fixture-widget";
              },
            };
            script.onload();
          });
        },
      },
    },
  });
  vm.runInContext(await readFile("assets/interactions.js", "utf8"), context);
  await new Promise((resolve) => setImmediate(resolve));
  const prepare = element("#hugs-form .verification-button");
  assert.equal(prepare.disabled, false);
  const handler = prepare.listeners.get("click");
  // The prior catch block rejected here with ReferenceError: error is not defined.
  await assert.doesNotReject(handler());
  assert.match(element("#hugs-status").textContent, /could not load/);
  assert.equal(element("#hugs-submit").disabled, true);
  assert.equal(prepare.disabled, false);
  await assert.doesNotReject(handler());
  assert.equal(element("#hugs-status").textContent, "Verification complete.");
  assert.equal(element("#hugs-submit").disabled, false);
  assert.equal(attempts, 2);
  assert.equal(
    apiRequests,
    1,
    "preparing/retrying must not mutate the backend",
  );
});
