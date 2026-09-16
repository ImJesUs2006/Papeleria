import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

// El CDN de Playwright puede estar bloqueado; en Windows usamos el Edge del
// sistema (channel "msedge") para no requerir descarga de navegadores.
// En CI/Linux: PLAYWRIGHT_CHANNEL=chromium + `npx playwright install --with-deps chromium`.
const channel = process.env.PLAYWRIGHT_CHANNEL || (process.platform === "win32" ? "msedge" : undefined);

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    channel
      ? { name: "msedge", use: { ...devices["Desktop Edge"], channel: channel as "msedge" } }
      : { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
