import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  // Headless WebKit uses software rendering on Linux CI.
  timeout: process.env.CI ? 90000 : 30000,
  use: { baseURL: "http://127.0.0.1:5173", headless: true },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: {
    command: "npm run dev -- --port 5173 --strictPort",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
  },
  reporter: "list",
});
