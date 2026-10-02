import { expect } from "@playwright/test";
import { test } from "./fixtures/auth";
import { stubZones } from "./fixtures/map";

const fields = ["Tujuan", "Pekerjaan", "Kota tujuan", "Batas sewa", "Anggaran bulanan", "Waktu tempuh",
    "Moda transportasi", "Lokasi tujuan", "Prioritas"];

const reportedStory = "saya berencana pindah ke jakarta selatan untuk kerja sebagai software engineer punya budget 5jt per bulan 2jt untuk kos";
const commuteQuestion = "Berapa lama waktu perjalanan sekali jalan yang masih bisa Anda terima (dalam menit)?";

test("unknown-budget story discards guessed car and requires an unselected transport radio", async ({ page }) => {
    await stubZones(page);
    await page.goto("/map?onboarding=demo");
    await page.getByRole("textbox", { name: "Ceritakan rencana pindahmu" }).fill(
        "saya berencana pindah ke jakarta selatan untuk kerja sebagai software engineer budget belum tahu");
    const initialResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/lf05");
    await page.getByRole("button", { name: "Baca rencanaku" }).click();
    const initial = (await (await initialResponse).json()).profile;
    expect(initial.soft_preferences.transport_mode).toBeUndefined();
    expect(initial.hard_constraints.transport_mode).toBeUndefined();
    const stepTwo = page.locator('[data-hci-region="relocation-onboarding-step-2"]');
    const transportRow = stepTwo.locator('[data-hci-region="onboarding-profile-preview"]').locator(":scope > div")
        .filter({ hasText: "Moda transportasi" });
    await expect(transportRow).toContainText("Belum ada");
    for (const mode of ["Transport umum", "Motor", "Mobil"]) {
        await expect(stepTwo.getByRole("radio", { name: mode, exact: true })).not.toBeChecked();
    }
    // Reproduce a pre-fix cached proposal that silently accepted the guessed mode.
    await page.evaluate(() => {
        const key = "jejak:relocation-onboarding";
        const draft = JSON.parse(sessionStorage.getItem(key)!);
        draft.proposal.soft_preferences.transport_mode = "car";
        draft.proposal.inferred_fields.push("transport_mode");
        draft.proposal.clarification_questions = draft.proposal.clarification_questions.filter((question: string) => !question.startsWith("Moda transportasi"));
        sessionStorage.setItem(key, JSON.stringify(draft));
    });
    await page.reload();
    await expect(transportRow).toContainText("Belum ada");
    await expect(page.getByRole("radio", { name: "Mobil", exact: true })).not.toBeChecked();
    await page.getByRole("textbox", { name: "Berapa anggaran bulananmu?" }).fill("Rp6 juta");
    await page.getByRole("button", { name: "Belum tahu", exact: true }).click();
    await page.getByRole("button", { name: "Tinjau rencanamu" }).click();
    await expect(stepTwo.getByRole("alert")).toContainText("Moda transportasi");
    await page.getByRole("radio", { name: "Motor", exact: true }).check();
    await page.reload();
    await expect(page.getByRole("radio", { name: "Motor", exact: true })).toBeChecked();
    const followUpResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/lf05");
    await page.getByRole("button", { name: "Tinjau rencanamu" }).click();
    const processed = (await (await followUpResponse).json()).profile;
    expect(processed.soft_preferences.transport_mode).toBe("motorcycle");
    await expect(page.getByRole("heading", { name: "Apakah sudah sesuai?" })).toBeVisible();
    await expect(page.getByRole("dialog").locator("section").filter({ has: page.getByRole("heading", { name: "Moda transportasi", exact: true }) })).toContainText("Motor");
});

for (const [length, story] of [
    ["short", "Mau pindah."],
    ["long", "Saya pindah sebagai software engineer. Saya ingin tinggal dekat kantor dengan kos yang nyaman. " +
        "Akses perjalanan dan biaya hidup penting untuk rencana saya. ".repeat(6)],
] as const) {
    test(`${length} story keeps the same step-2 fields, sends every answer through LF-05 and saves to PostgreSQL`, async ({ page }) => {
        await stubZones(page);
        await page.goto("/map?onboarding=demo");
        await page.getByRole("textbox", { name: "Ceritakan rencana pindahmu" }).fill(story);
        await page.getByRole("button", { name: "Baca rencanaku" }).click();
        const preview = page.locator('[data-hci-region="onboarding-profile-preview"]');
        await expect(preview.locator("dt")).toHaveText(fields);
        await expect(preview).toContainText("Belum diisi");
        if (length === "short") {
            await page.getByRole("button", { name: "Tinjau rencanamu" }).click();
            await expect(page.locator('[data-hci-region="relocation-onboarding-step-2"]').getByRole("alert")).toContainText("Pilih tujuan");
            await expect(page.getByRole("heading", { name: "Ini yang kami tangkap" })).toBeVisible();
        }
        await page.getByRole("radio", { name: "Kerja dan kuliah", exact: true }).click();
        await page.getByRole("textbox", { name: "Berapa anggaran bulananmu?" }).fill("Rp6 juta");
        await page.getByLabel("Atau tulis lokasi tujuanmu", { exact: true }).fill("Kuningan");
        await page.getByRole("radio", { name: "Transport umum", exact: true }).check();
        const analysis = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/lf05");
        await page.getByRole("button", { name: "Tinjau rencanamu" }).click();
        const analysisResponse = await analysis;
        expect(analysisResponse.status()).toBe(200);
        const proposed = (await analysisResponse.json()).profile;
        const sent = proposed.decision_trace.received_message as string;
        expect(sent).toContain(story.trim());
        expect(sent).toContain("Berapa anggaran bulananmu?\nJawaban: Rp6 juta");
        expect(sent).toContain("Di mana lokasi kantormu?\nJawaban: Kuningan");
        expect(sent).toContain("Moda transportasi apa yang kamu pilih?\nJawaban: transit");
        expect(sent).toContain("Tujuan pindah\nJawaban: Kerja dan kuliah");
        expect(proposed.hard_constraints.goal).toBe("both");
        await expect(page.getByRole("heading", { name: "Apakah sudah sesuai?" })).toBeVisible();
        await expect(page.getByRole("dialog")).toContainText("Kerja dan kuliah");
        const saving = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/user/relocation-profile" && response.request().method() === "POST");
        await page.getByRole("button", { name: "Simpan dan selesaikan" }).click();
        const saveResponse = await saving;
        expect(saveResponse.status()).toBe(201);
        const saved = (await saveResponse.json()).profile;
        expect(saved.profile.hard_constraints.goal).toBe("both");
        expect(saved.profile.hard_constraints.monthly_budget.amount).toBe(6000000);
        expect(saved.profile.soft_preferences.transport_mode).toBe("transit");
        expect(saved.profile.soft_preferences.destination).toEqual({ name: "Kuningan", precision: "area" });
        expect(saved.profile.decision_trace).toBeUndefined();
        const backend = await page.request.get("/api/user/relocation-profile");
        expect((await backend.json()).profile).toEqual(saved);
        await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
        await page.reload();
        await expect(page.getByRole("searchbox", { name: "Cari kecamatan" })).toBeVisible();
        await expect(page.locator('[data-hci-region="profile-completion-banner"]')).toHaveCount(0);
    });
}

test("inferred story goal is highlighted and failed saving keeps the review for retry", async ({ page }) => {
    await stubZones(page);
    await page.goto("/map?onboarding=demo");
    await page.getByRole("textbox", { name: "Ceritakan rencana pindahmu" }).fill("Saya pindah untuk bekerja. Rp6 juta, kantor di Kuningan, naik transportasi umum.");
    await page.getByRole("button", { name: "Baca rencanaku" }).click();
    await page.getByRole("button", { name: "Tinjau rencanamu" }).click();
    const save = page.getByRole("button", { name: "Simpan dan selesaikan" });
    await expect(page.getByRole("dialog").locator("section").filter({ has: page.getByRole("heading", { name: "Tujuan", exact: true }) })).toContainText("disimpulkan");
    await expect(save).toBeEnabled();
    let attempts = 0;
    await page.route((url) => url.pathname === "/api/user/relocation-profile", (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        expect(route.request().postDataJSON().confirmed_fields).toContain("goal");
        attempts++;
        return attempts === 1 ? route.fulfill({ status: 503, json: { error: "Profil belum tersimpan. Coba lagi." } }) : route.fallback();
    });
    await save.click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Profil belum tersimpan");
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByRole("dialog")).toBeHidden();
    expect(attempts).toBe(2);
    const backend = (await (await page.request.get("/api/user/relocation-profile")).json()).profile;
    expect(backend.profile.hard_constraints.goal).toBe("work");
});

test("map-picked story answer survives refresh and saves exact chosen coordinates", async ({ page }) => {
    await stubZones(page);
    await page.goto("/map?onboarding=demo");
    await page.getByRole("textbox", { name: "Ceritakan rencana pindahmu" }).fill("Mau pindah.");
    await page.getByRole("button", { name: "Baca rencanaku" }).click();
    await page.getByRole("radio", { name: "Kerja dan kuliah", exact: true }).click();
    // Map clicks place a destination only after the user opts into picking.
    await page.getByRole("button", { name: "Pilih titik di peta", exact: true }).click();
    await page.locator(".maplibregl-canvas").click({ position: { x: 140, y: 180 } });
    const region = page.getByRole("region", { name: "Pertanyaan lanjutan" });
    await expect(region).toContainText("Titik dipilih:");
    const point = await page.evaluate(() => JSON.parse(sessionStorage.getItem("jejak:relocation-onboarding")!).mapPoint);
    expect(point.latitude).toEqual(expect.any(Number));
    await page.reload();
    await expect(region).toContainText("Titik dipilih:");
    await page.getByRole("textbox", { name: "Berapa anggaran bulananmu?" }).fill("Rp6 juta");
    await page.getByRole("radio", { name: "Transport umum", exact: true }).check();
    const analysis = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/lf05");
    await page.getByRole("button", { name: "Tinjau rencanamu" }).click();
    const proposed = (await (await analysis).json()).profile;
    expect(proposed.decision_trace.received_message).toContain("Lokasi kantor dipilih di peta:");
    expect(proposed.soft_preferences.destination).toEqual({ name: "Dipilih di peta", precision: "point", ...point });
    await page.getByRole("button", { name: "Simpan dan selesaikan" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    const backend = (await (await page.request.get("/api/user/relocation-profile")).json()).profile;
    expect(backend.profile.soft_preferences.destination).toEqual(proposed.soft_preferences.destination);
});

test("resubmitting the story from step 1 asks follow-up questions again instead of reusing old answers", async ({ page }) => {
    await stubZones(page);
    const requests: Record<string, unknown>[] = [];
    page.on("request", (request) => {
        if (new URL(request.url()).pathname === "/api/lf05") requests.push(request.postDataJSON());
    });
    await page.goto("/map?onboarding=demo");
    await page.getByRole("textbox", { name: "Ceritakan rencana pindahmu" }).fill(reportedStory);
    await page.getByRole("button", { name: "Baca rencanaku" }).click();
    await page.getByRole("textbox", { name: commuteQuestion }).fill("45");
    await page.getByRole("button", { name: "Belum tahu", exact: true }).click();
    await page.getByRole("radio", { name: "Transport umum", exact: true }).check();

    await page.getByRole("button", { name: "Kembali", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Ceritakan rencana pindahmu" })).toHaveValue(reportedStory);
    await page.getByRole("button", { name: "Baca rencanaku" }).click();

    await expect(page.getByRole("textbox", { name: commuteQuestion })).toHaveValue("");
    await expect(page.getByRole("radio", { name: "Transport umum", exact: true })).not.toBeChecked();
    await expect(page.getByRole("button", { name: "Belum tahu", exact: true })).toHaveAttribute("aria-pressed", "false");
    expect(requests).toHaveLength(2);
    expect(requests[1].clarification_answers).toEqual([]);
    expect(requests[1].details).toEqual({});
    expect(requests[1].goal).toBeUndefined();
});

test("reported story preserves 45 minutes, budgets, unknown city destination and five priority colors through save and reload", async ({ page }) => {
    await stubZones(page);
    const requests: Record<string, unknown>[] = [];
    page.on("request", (request) => {
        if (new URL(request.url()).pathname === "/api/lf05") requests.push(request.postDataJSON());
    });
    await page.goto("/map?onboarding=demo");
    await page.getByRole("textbox", { name: "Ceritakan rencana pindahmu" }).fill(reportedStory);
    await page.getByRole("button", { name: "Baca rencanaku" }).click();
    const preview = page.locator('[data-hci-region="onboarding-profile-preview"]');
    await expect(preview.locator("dt")).toHaveText(fields);
    await expect(page.getByRole("heading", { name: "Sudah tahu lokasi tujuan spesifik di Jakarta Selatan?" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Moda transportasi apa yang kamu pilih?", exact: true })).toBeVisible();
    const colors = await preview.locator("[data-priority-swatch]").evaluateAll((swatches) => swatches.map((swatch) => getComputedStyle(swatch).backgroundColor));
    expect(new Set(colors).size).toBe(5);
    expect(colors.slice(0, 4)).toEqual(["rgb(0, 106, 216)", "rgb(95, 132, 177)", "rgb(33, 41, 124)", "rgb(158, 217, 235)"]);
    expect(colors[4]).toMatch(/^(?:rgb|oklab)\(/);
    expect(await preview.locator('[data-priority-segment="education"]').evaluate((segment) => segment.getBoundingClientRect().width)).toBe(0);
    await page.getByRole("textbox", { name: commuteQuestion }).fill("45");
    await page.getByRole("button", { name: "Belum tahu", exact: true }).click();
    await page.getByRole("radio", { name: "Transport umum", exact: true }).check();
    await page.reload();
    await expect(page.getByRole("textbox", { name: commuteQuestion })).toHaveValue("45");
    await expect(page.getByRole("button", { name: "Belum tahu", exact: true })).toHaveAttribute("aria-pressed", "true");
    const analysis = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/lf05");
    await page.getByRole("button", { name: "Tinjau rencanamu" }).click();
    const proposed = (await (await analysis).json()).profile;
    expect(requests).toHaveLength(2);
    expect(requests[1].clarification_answers).toContainEqual({ question: commuteQuestion, answer: "45 menit", field: "commute_minutes" });
    expect(requests[1].details).toEqual({ commute_minutes: 45, transport_mode: "transit", destination: { name: "Jakarta Selatan", precision: "city" } });
    expect(proposed.decision_trace.received_message).toContain(`${commuteQuestion}\nJawaban: 45 menit`);
    expect(proposed.hard_constraints.commute_minutes).toBe(45);
    const review = page.getByRole("dialog");
    await expect(page.getByRole("heading", { name: "Apakah sudah sesuai?" })).toBeVisible();
    await expect(review).not.toContainText("Pertanyaan lanjutan");
    for (const [label, value] of [["Waktu tempuh", "45 menit"], ["Anggaran bulanan", "Rp5.000.000"], ["Batas sewa", "Rp2.000.000"], ["Lokasi tujuan", "Jakarta Selatan"], ["Moda transportasi", "Transport umum"]]) {
        await expect(review.locator("section").filter({ has: page.getByRole("heading", { name: label, exact: true }) })).toContainText(value);
    }
    expect(await review.locator("[data-priority-swatch]").evaluateAll((swatches) => swatches.map((swatch) => getComputedStyle(swatch).backgroundColor))).toEqual(colors);
    await review.locator("section").filter({ has: page.getByRole("heading", { name: "Prioritas", exact: true }) })
        .screenshot({ path: test.info().outputPath("priority-palette.png") });
    const save = page.getByRole("button", { name: "Simpan dan selesaikan" });
    await expect(review.getByRole("button", { name: "Benar", exact: true })).toHaveCount(0);
    await save.click();
    await expect(review).toBeHidden();
    const saved = (await (await page.request.get("/api/user/relocation-profile")).json()).profile;
    expect(saved.profile.hard_constraints).toMatchObject({ goal: "work", monthly_budget: { amount: 5000000 }, housing_budget: { amount: 2000000 }, commute_minutes: 45 });
    expect(saved.profile.soft_preferences.destination).toEqual({ name: "Jakarta Selatan", precision: "city" });
    expect(saved.profile.soft_preferences.transport_mode).toBe("transit");
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload();
    await expect(page.locator('[data-hci-region="profile-completion-banner"]')).toHaveCount(0);
    expect((await (await page.request.get("/api/user/relocation-profile")).json()).profile).toEqual(saved);
});

test("no follow-up questions opens review directly after an explicit goal choice", async ({ page }) => {
    await stubZones(page);
    let analyses = 0;
    page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/lf05") analyses++; });
    await page.goto("/map?onboarding=demo");
    await page.getByRole("textbox", { name: "Ceritakan rencana pindahmu" }).fill("Saya pindah. Rp6 juta, kantor di Kuningan, naik transportasi umum.");
    await page.getByRole("button", { name: "Baca rencanaku" }).click();
    await expect(page.getByRole("region", { name: "Pertanyaan lanjutan" })).toContainText("Tidak ada pertanyaan lanjutan");
    await page.getByRole("radio", { name: "Kerja dan kuliah", exact: true }).click();
    await page.getByRole("button", { name: "Tinjau rencanamu" }).click();
    await expect(page.getByRole("heading", { name: "Apakah sudah sesuai?" })).toBeVisible();
    expect(analyses).toBe(1);
    await expect(page.getByRole("dialog")).not.toContainText("Pertanyaan lanjutan");
    await page.getByRole("button", { name: "Simpan dan selesaikan" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    expect((await (await page.request.get("/api/user/relocation-profile")).json()).profile.profile.hard_constraints.goal).toBe("both");
});

test("failed follow-up processing keeps step two and retries LF-05 with unchanged answers", async ({ page }) => {
    await stubZones(page);
    let analyses = 0;
    await page.route((url) => url.pathname === "/api/lf05", (route) => {
        analyses++;
        if (analyses === 2) return route.fulfill({ status: 502, json: { error: "Rencana belum bisa dianalisis. Coba lagi." } });
        return route.fallback();
    });
    await page.goto("/map?onboarding=demo");
    await page.getByRole("textbox", { name: "Ceritakan rencana pindahmu" }).fill(reportedStory);
    await page.getByRole("button", { name: "Baca rencanaku" }).click();
    const stepTwo = page.locator('[data-hci-region="relocation-onboarding-step-2"]');
    await page.getByRole("button", { name: "Tinjau rencanamu" }).click();
    await expect(stepTwo.getByRole("alert")).toContainText("Jawab dulu");
    expect(analyses).toBe(1);
    await page.getByRole("textbox", { name: commuteQuestion }).fill("245");
    await page.getByRole("button", { name: "Tinjau rencanamu" }).click();
    await expect(stepTwo.getByRole("alert")).toContainText("0–240 menit");
    expect(analyses).toBe(1);
    await page.getByRole("textbox", { name: commuteQuestion }).fill("45");
    await page.getByRole("button", { name: "Belum tahu", exact: true }).click();
    await page.getByRole("radio", { name: "Motor", exact: true }).check();
    await page.getByRole("button", { name: "Tinjau rencanamu" }).click();
    await expect(stepTwo.getByRole("alert")).toContainText("Coba lagi");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByRole("textbox", { name: commuteQuestion })).toHaveValue("45");
    await page.getByRole("button", { name: "Tinjau rencanamu" }).click();
    await expect(page.getByRole("heading", { name: "Apakah sudah sesuai?" })).toBeVisible();
    expect(analyses).toBe(3);
});

test("new unanswered questions stay on step two before a fresh review", async ({ page }) => {
    await stubZones(page);
    let analyses = 0;
    const newQuestion = "Apa pola kerjamu?";
    await page.route((url) => url.pathname === "/api/lf05", async (route) => {
        analyses++;
        if (analyses !== 2) return route.fallback();
        const response = await route.fetch();
        const result = await response.json();
        result.profile.clarification_questions.push(newQuestion);
        await route.fulfill({ response, json: result });
    });
    await page.goto("/map?onboarding=demo");
    await page.getByRole("textbox", { name: "Ceritakan rencana pindahmu" }).fill(reportedStory);
    await page.getByRole("button", { name: "Baca rencanaku" }).click();
    await page.getByRole("textbox", { name: commuteQuestion }).fill("45");
    await page.getByRole("button", { name: "Belum tahu", exact: true }).click();
    await page.getByRole("radio", { name: "Transport umum", exact: true }).check();
    await page.getByRole("button", { name: "Tinjau rencanamu" }).click();
    const stepTwo = page.locator('[data-hci-region="relocation-onboarding-step-2"]');
    await expect(stepTwo.getByRole("alert")).toContainText("Ada pertanyaan baru");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(stepTwo.locator('[data-hci-region="onboarding-profile-preview"]')).toContainText("45 menit");
    await page.getByRole("textbox", { name: newQuestion }).fill("Hybrid");
    await page.getByRole("button", { name: "Tinjau rencanamu" }).click();
    await expect(page.getByRole("heading", { name: "Apakah sudah sesuai?" })).toBeVisible();
    expect(analyses).toBe(3);
});
