import { defineConfig, devices } from "@playwright/test";

const port = 3000;
const host = "localhost";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: `http://${host}:${port}`,
    trace: "on-first-retry",
    launchOptions: {
      slowMo: Number(process.env.PLAYWRIGHT_SLOW_MO ?? 0),
    },
  },
  webServer: {
    command: "npm run dev",
    url: `http://${host}:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      E2E_TEST_MODE: "true",
      NEXT_PUBLIC_SUPABASE_URL: "https://supabase.test",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "playwright-anon-key",
      HOSTNAME: host,
      PORT: String(port),
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
