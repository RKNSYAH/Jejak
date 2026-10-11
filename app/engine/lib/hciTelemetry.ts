import type { HciClick } from "../types";

const SESSION_KEY = "jejak-hci-session";
const FLUSH_SIZE = 20;
const MAX_BATCH = 50;
const FLUSH_INTERVAL_MS = 15_000;
const RESPONSE_TIMEOUT_MS = 30_000;
// Pointer travel beyond this is a map pan or drag, not a click.
const DRAG_THRESHOLD_PX = 8;
const CONTROL = "button, a[href], input, select, textarea, summary, label, canvas, [role='button'], [role='link'], [role='tab'], [role='option'], [role='menuitem'], [role='switch'], [role='checkbox']";

type Session = { id: string; participant: string | null; startedAt: number };
type Interaction = { event: MouseEvent; responses: Promise<boolean>[] };
let activeInteraction: Interaction | null = null;

// Call synchronously from the click handler, then finish after its state updates.
// The captured promise belongs to that click even if another click starts later.
export function beginHciResponse(signal: AbortSignal): () => void {
    const interaction = activeInteraction;
    if (!interaction || interaction.event.eventPhase === Event.NONE) return () => {};
    let finish!: () => void;
    interaction.responses.push(new Promise<boolean>((resolve) => {
        finish = () => {
            signal.removeEventListener("abort", finish);
            resolve(!signal.aborted);
        };
        if (signal.aborted) finish();
        else signal.addEventListener("abort", finish, { once: true });
    }));
    return finish;
}

function loadSession(): Session {
    const param = new URLSearchParams(window.location.search).get("study");
    const participant = param && /^[A-Za-z0-9_-]{1,32}$/.test(param) ? param : null;
    try {
        const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null") as Session | null;
        // A reload keeps the tab's session; a new ?study= participant starts a fresh one.
        if (stored && (param === null || stored.participant === participant)) return stored;
    } catch { }
    const session = { id: crypto.randomUUID(), participant, startedAt: Date.now() };
    try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch { }
    return session;
}

// Labels come from the clicked control's accessible name, never from input values.
function describeTarget(element: Element) {
    const control = element.closest(CONTROL);
    if (!control) return element.tagName.toLowerCase();
    const label = control.getAttribute("aria-label") ?? control.getAttribute("title") ?? control.getAttribute("placeholder") ??
        (control instanceof HTMLElement && !(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) ? control.innerText : "");
    return label.replace(/\s+/g, " ").trim().slice(0, 80) || control.tagName.toLowerCase();
}

// Response waits only for work explicitly registered during this click's dispatch.
function measure(start: number, responses: Promise<boolean>[], done: (paint: number, response: number | null) => void) {
    requestAnimationFrame(() => setTimeout(() => {
        const paint = performance.now() - start;
        if (!responses.length) return done(paint, paint);
        let finished = false;
        const finish = (response: number | null) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            done(paint, response);
        };
        const timer = setTimeout(() => finish(null), Math.max(0, RESPONSE_TIMEOUT_MS - paint));
        void Promise.all(responses).then((completed) => {
            if (finished) return;
            if (completed.some((success) => !success)) return finish(null);
            // Include the frame displaying the result (or error), after state updates.
            requestAnimationFrame(() => setTimeout(() => finish(performance.now() - start)));
        });
    }));
}

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

export function startHciTelemetry() {
    const session = loadSession();
    const queue: HciClick[] = [];
    let pointerStart: { x: number; y: number } | null = null;

    function flush() {
        while (queue.length) {
            const body = JSON.stringify({ session_id: session.id, participant: session.participant, clicks: queue.splice(0, MAX_BATCH) });
            navigator.sendBeacon("/api/hci", new Blob([body], { type: "application/json" }));
        }
    }

    window.addEventListener("pointerdown", (event) => {
        pointerStart = { x: event.clientX, y: event.clientY };
    }, { capture: true, passive: true });

    window.addEventListener("click", (event) => {
        activeInteraction = null;
        if (!(event.target instanceof Element)) return;
        // Keyboard activation dispatches a click with detail 0 and no meaningful coordinates.
        const pointer = event.detail > 0;
        if (pointer && pointerStart && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > DRAG_THRESHOLD_PX) return;
        const interaction: Interaction = { event, responses: [] };
        activeInteraction = interaction;
        setTimeout(() => {
            if (activeInteraction === interaction) activeInteraction = null;
        });
        const click = {
            elapsed_ms: Math.max(0, Date.now() - session.startedAt),
            region: event.target.closest("[data-hci-region]")?.getAttribute("data-hci-region") ?? "other",
            target: describeTarget(event.target),
            x: pointer ? round(Math.min(1, Math.max(0, event.clientX / window.innerWidth)), 4) : null,
            y: pointer ? round(Math.min(1, Math.max(0, event.clientY / window.innerHeight)), 4) : null,
            viewport_width: window.innerWidth,
            viewport_height: window.innerHeight,
        };
        measure(event.timeStamp, interaction.responses, (paint, response) => {
            queue.push({ ...click, paint_ms: round(paint, 1), response_ms: response === null ? null : round(response, 1) });
            if (queue.length >= FLUSH_SIZE) flush();
        });
    }, { capture: true, passive: true });

    setInterval(flush, FLUSH_INTERVAL_MS);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") flush();
    });
    window.addEventListener("pagehide", flush);
}
