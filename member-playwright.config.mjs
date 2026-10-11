import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./member-app/tests/browser",
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4180",
    browserName: "chromium",
    trace: "off",
  },
  webServer: {
    command:
      "node --import ./tests/provider-preload.mjs ./node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 4180",
    cwd: "member-app",
    url: "http://127.0.0.1:4180/login",
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      NEXT_TELEMETRY_DISABLED: "1",
      MEMBER_UI_ENABLED: "true",
      MEMBER_ADMIN_UI_ENABLED: "true",
      MEMBER_APP_ENVIRONMENT: "staging",
      MEMBER_UI_ORIGIN: "http://127.0.0.1:4180",
      SUPABASE_URL: "https://fixture.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
    },
  },
});
