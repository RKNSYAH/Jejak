import type { Page } from "@playwright/test";

export async function stubZones(page: Page, zones: unknown[] = [], isSample = false) {
    await page.route((url) => url.pathname === "/api/zones", (route) => route.fulfill({ json: { is_sample: isSample, zones } }));
}

// Opens the map in demo onboarding and skips the story dialog.
export async function openDemoMap(page: Page) {
    await page.goto("/map?onboarding=demo");
    await page.getByRole("button", { name: /Lewati untuk sekarang/ }).click();
}
