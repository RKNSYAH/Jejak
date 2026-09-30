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
    webServer: [{
        command: "node e2e/fixtures/supabase.mjs",
        url: "http://127.0.0.1:3101/health",
        reuseExistingServer: false,
    }, {
        command: `bun run build && bunx next start --port ${port}`,
        url: `http://localhost:${port}/login`,
        env: {
            NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:3101",
            NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-publishable-key",
            SUPABASE_SERVICE_ROLE_KEY: "",
        },
        reuseExistingServer: false,
        timeout: 300_000,
    }],
});
