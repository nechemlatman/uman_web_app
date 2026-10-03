import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/hmr",
  outputDir: ".local/hmr-results",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:5180", trace: "retain-on-failure" },
  webServer: {
    command: "node tests/hmr-server.mjs",
    url: "http://127.0.0.1:5180",
    reuseExistingServer: false,
  },
  reporter: "list",
});
