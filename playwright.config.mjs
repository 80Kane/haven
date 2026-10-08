import { defineConfig } from "@playwright/test";
// Opt in only for remote checks in environments with a managed HTTPS proxy.
// Keep injected proxy credentials in memory; never log or save their values.
const proxyUrl =
  process.env.TEST_USE_ENV_PROXY === "1"
    ? process.env.HTTPS_PROXY || process.env.https_proxy
    : undefined;
const parsedProxy = proxyUrl ? new URL(proxyUrl) : undefined;
const proxy = parsedProxy
  ? {
      server: `${parsedProxy.protocol}//${parsedProxy.host}`,
      ...(parsedProxy.username
        ? { username: decodeURIComponent(parsedProxy.username) }
        : {}),
      ...(parsedProxy.password
        ? { password: decodeURIComponent(parsedProxy.password) }
        : {}),
    }
  : undefined;
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  reporter: [["list"]],
  use: {
    baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:4173",
    browserName: "chromium",
    ...(proxy
      ? {
          proxy,
          userAgent:
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        }
      : {}),
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
    trace: "retain-on-failure",
  },
  webServer: process.env.TEST_BASE_URL
    ? undefined
    : {
        command: "npm start",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: false,
      },
});
