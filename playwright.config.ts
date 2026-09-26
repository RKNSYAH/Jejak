import { defineConfig, devices } from "@playwright/test";

const port = 3100;

// Latency budgets need a production build: dev-mode React is several times slower.
export default defineConfig({
    testDir: "e2e",
    testMatch: "*.e2e.ts",
    // One worker so parallel browsers do not compete for CPU and skew timings.
    workers: 1,
    reporter: [["list"], ["html", { open: "never" }]],
    use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure" },
    projects: [
        { name: "desktop", use: { ...devices["Desktop Chrome"] } },
        { name: "mobile", use: { ...devices["Pixel 7"] } },
    ],
    webServer: {
        command: `bun run build && bunx next start --port ${port}`,
        url: `http://localhost:${port}/map`,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
    },
});
