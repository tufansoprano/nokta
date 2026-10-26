import { defineConfig, devices } from "@playwright/test";
import { qaEnv } from "./e2e/qaEnv";

const port = Number(process.env.E2E_PORT ?? 5180);

/** E2E tests run the app against the QA Supabase project, never prod. Phones first. */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `npx vite --mode qa --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
    // Variables set here beat every .env file, so the app talks to QA whatever .env.local holds.
    env: {
      PORT: String(port),
      VITE_SUPABASE_URL: qaEnv.supabaseUrl,
      VITE_SUPABASE_ANON_KEY: qaEnv.publishableKey,
      VITE_SUPABASE_PUBLISHABLE_KEY: qaEnv.publishableKey,
      VITE_ANALYTICS_ENV: "development",
      VITE_POSTHOG_PROJECT_TOKEN: "",
    },
  },
});
