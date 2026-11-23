import { defineConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const allowedHosts = ["localhost", "127.0.0.1", "[::1]"];

if (!allowedHosts.includes(new URL(baseURL).hostname)) {
  throw new Error("Execute os testes contra uma instância local com um banco de teste.");
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL,
    browserName: "chromium",
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
    trace: "retain-on-failure",
  },
});
