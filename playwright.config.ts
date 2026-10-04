import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  workers: 2,
  use: { baseURL: "http://127.0.0.1:5190", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- --port 5190 --strictPort",
    url: "http://127.0.0.1:5190",
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: "https://fixture.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
    },
  },
  reporter: "list",
});
