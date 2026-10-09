"use strict";

const root = document.querySelector("[data-site-key]");
if (root) {
  document.querySelector("#javascript-note").hidden = true;
  const serviceStatus = document.querySelector("#service-status");
  const count = document.querySelector("#hug-count");
  const forms = new Map();
  let challengeScript;
  let available = false;
  const email = document.querySelector("#interest-email");
  const consent = document.querySelector("#interest-consent");

  function showCount(total) {
    if (!Number.isSafeInteger(total) || total < 0)
      throw new Error("Invalid service response");
    count.textContent = total.toLocaleString();
  }
  async function api(action, body) {
    const response = await fetch(`/api/public/${action}`, {
      method: body ? "POST" : "GET",
      mode: "same-origin",
      credentials: "same-origin",
      cache: "no-store",
      headers: body ? { "Content-Type": "application/json" } : {},
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) {
      if (response.status === 429)
        throw new Error("Too many attempts. Please try again in an hour.");
      if (response.status === 400)
        throw new Error("Check your details and complete a new verification.");
      throw new Error("The service is unavailable. Please try again later.");
    }
    if (!response.headers.get("Content-Type")?.includes("application/json"))
      throw new Error("Your preview session may have expired. Sign in again.");
    return response.json();
  }
  function update(state) {
    state.submit.disabled =
      !available ||
      state.busy ||
      !state.token ||
      (state.action === "interest" &&
        (!email.validity.valid || !consent.checked));
    state.prepare.disabled = !available || state.busy;
  }
  function loadChallenge() {
    if (window.turnstile) return Promise.resolve();
    if (!challengeScript) {
      challengeScript = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src =
          "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        const timer = setTimeout(() => {
          script.remove();
          reject(new Error("Verification timed out"));
        }, 15000);
        script.onload = () => {
          clearTimeout(timer);
          if (window.turnstile) resolve();
          else reject(new Error("Verification unavailable"));
        };
        script.onerror = () => {
          clearTimeout(timer);
          script.remove();
          reject(new Error("Verification unavailable"));
        };
        document.head.append(script);
      }).catch((error) => {
        challengeScript = null;
        throw error;
      });
    }
    return challengeScript;
  }
  function reset(state) {
    state.token = "";
    if (state.widget !== undefined) {
      try {
        window.turnstile.remove(state.widget);
      } catch {
        // A failed cleanup must never keep a consumed challenge answer usable.
      }
      state.widget = undefined;
      state.challenge.replaceChildren();
    }
    update(state);
  }
  for (const action of ["hugs", "interest"]) {
    const form = document.querySelector(`#${action}-form`);
    const state = {
      action,
      token: "",
      busy: false,
      form,
      submit: document.querySelector(`#${action}-submit`),
      prepare: form.querySelector(".verification-button"),
      challenge: document.querySelector(`#${action}-challenge`),
      status: document.querySelector(`#${action}-status`),
    };
    forms.set(action, state);
    state.prepare.addEventListener("click", async () => {
      if (!available || state.busy) return;
      state.busy = true;
      state.token = "";
      update(state);
      state.status.textContent = "Preparing verification…";
      try {
        await loadChallenge();
        if (state.widget !== undefined) window.turnstile.reset(state.widget);
        else
          state.widget = window.turnstile.render(state.challenge, {
            sitekey: root.dataset.siteKey,
            action,
            size: "flexible",
            theme: "light",
            callback: (value) => {
              state.token = value;
              state.status.textContent = "Verification complete.";
              update(state);
            },
            "expired-callback": () => {
              state.token = "";
              state.status.textContent =
                "Verification expired. Choose Prepare verification again.";
              update(state);
            },
            "error-callback": () => {
              state.token = "";
              state.status.textContent =
                "Verification failed. Choose Prepare verification to retry, or try again later.";
              update(state);
              return true;
            },
          });
      } catch {
        state.status.textContent =
          "Verification could not load. Choose Prepare verification to retry, or try again later.";
      } finally {
        state.busy = false;
        update(state);
      }
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (state.submit.disabled || !form.reportValidity()) return;
      state.busy = true;
      const answer = state.token;
      state.token = "";
      update(state);
      state.status.textContent = "Submitting…";
      try {
        const result = await api(action, {
          turnstileToken: answer,
          ...(action === "interest"
            ? {
                email: email.value.trim(),
                consent: consent.checked,
                consentVersion: "interest-v1",
              }
            : {}),
        });
        if (action === "hugs") {
          showCount(result.total);
          if (typeof result.accepted !== "boolean")
            throw new Error("Invalid service response");
          state.status.textContent = result.accepted
            ? "Your Hug was saved. Thank you for sharing support."
            : "A Hug has already been shared from this network today.";
        } else {
          if (typeof result.message !== "string")
            throw new Error("Invalid service response");
          // Use fixed neutral copy, never render server-provided HTML or user data.
          state.status.textContent =
            "If eligible, we will attempt to send a confirmation email. If none arrives, try again later. This does not grant community membership.";
          email.value = "";
          consent.checked = false;
        }
      } catch (error) {
        state.status.textContent =
          error.name === "TimeoutError" || error.name === "TypeError"
            ? "We could not confirm the result. Check your inbox or the Hug count before trying again."
            : [
                  "Too many attempts. Please try again in an hour.",
                  "Check your details and complete a new verification.",
                  "The service is unavailable. Please try again later.",
                  "Your preview session may have expired. Sign in again.",
                ].includes(error.message)
              ? error.message
              : "The service returned an unexpected result. Please try again later.";
      } finally {
        state.busy = false;
        reset(state);
      }
    });
  }
  email.addEventListener("input", () => update(forms.get("interest")));
  consent.addEventListener("change", () => update(forms.get("interest")));
  api("hugs")
    .then((result) => {
      showCount(result.total);
      available = true;
      serviceStatus.textContent = "Development service connected.";
      for (const state of forms.values()) {
        state.form.querySelector("fieldset").disabled = false;
        update(state);
      }
    })
    .catch(() => {
      serviceStatus.textContent =
        "Interactions are unavailable. Sign in to the preview or try again later. No submission has been made.";
    });
}
