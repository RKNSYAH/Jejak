import { createClient } from "@/app/engine/lib/server";
import { isRecord } from "@/app/engine/lib/zoneGeometry";
import type { HciClick, HciClickBatch } from "../types";

export const MAX_HCI_BATCH = 50;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const participant = /^[A-Za-z0-9_-]{1,32}$/;
const region = /^[a-z0-9-]{1,32}$/;

function inRange(value: unknown, min: number, max: number): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

// Mirrors the hci_click_events CHECK constraints so bad batches fail with 400, not a database error.
function parseClick(value: unknown): HciClick {
    if (!isRecord(value) || !Number.isInteger(value.elapsed_ms) || !inRange(value.elapsed_ms, 0, 2 ** 31 - 1) ||
        typeof value.region !== "string" || !region.test(value.region) ||
        typeof value.target !== "string" || value.target.length < 1 || value.target.length > 80 ||
        (value.x === null) !== (value.y === null) ||
        (value.x !== null && (!inRange(value.x, 0, 1) || !inRange(value.y, 0, 1))) ||
        !Number.isInteger(value.viewport_width) || !inRange(value.viewport_width, 1, 10000) ||
        !Number.isInteger(value.viewport_height) || !inRange(value.viewport_height, 1, 10000) ||
        !inRange(value.paint_ms, 0, 60000) || (value.response_ms !== null && !inRange(value.response_ms, 0, 60000))) {
        throw new Error("Invalid click");
    }
    return {
        elapsed_ms: value.elapsed_ms, region: value.region, target: value.target,
        x: value.x as number | null, y: value.y as number | null,
        viewport_width: value.viewport_width, viewport_height: value.viewport_height,
        paint_ms: value.paint_ms, response_ms: value.response_ms as number | null,
    };
}

export function parseClickBatch(body: unknown): HciClickBatch {
    if (!isRecord(body) || typeof body.session_id !== "string" || !uuid.test(body.session_id) ||
        (body.participant !== null && (typeof body.participant !== "string" || !participant.test(body.participant))) ||
        !Array.isArray(body.clicks) || body.clicks.length < 1 || body.clicks.length > MAX_HCI_BATCH) {
        throw new Error("Invalid click batch");
    }
    return { session_id: body.session_id, participant: body.participant, clicks: body.clicks.map(parseClick) };
}

export async function recordClicks({ session_id, participant, clicks }: HciClickBatch) {
    const supabase = await createClient();
    const { error } = await supabase.from("hci_click_events")
        .insert(clicks.map((click) => ({ ...click, session_id, participant })));
    if (error) throw error;
}
