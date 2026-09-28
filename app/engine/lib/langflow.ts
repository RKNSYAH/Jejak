import { isRecord } from "./zoneGeometry";

// Flow IDs from the Langflow project's manifest.json (Jejak Langflow v2).
export const LANGFLOW_FLOWS = {
    lf01: "e1106f6a-73b2-4e58-a229-fa543446e900",
    lf02: "66c12da0-bc5b-4538-949a-9847d08d7aa3",
    lf03: "d4b70d5c-0fd4-4b44-9bc0-79935a87718f",
    lf04: "2314c8f6-931d-46fd-b54d-e634ede6f3d5",
    lf05: "8feff2fc-81df-438d-8dae-c10563f1ab67",
} as const;

const WORKFLOWS_PATH = "/api/v2/workflows";

export type LangflowErrorCode =
    | "config" | "timeout" | "unreachable" | "upstream"
    | "invalid_response" | "incomplete" | "invalid_output";

export class LangflowError extends Error {
    code: LangflowErrorCode;

    constructor(code: LangflowErrorCode, message: string) {
        super(message);
        this.name = "LangflowError";
        this.code = code;
    }
}

// NEXT_LANGFLOW_URL may be the server's base URL or its /api/v2/workflows endpoint.
type Environment = Record<string, string | undefined>;

export function getLangflowConfig(env: Environment = process.env): { endpoint: URL; apiKey: string } {
    const url = env.NEXT_LANGFLOW_URL?.trim();
    const apiKey = env.NEXT_LANGFLOW_API_KEY?.trim();
    if (!url || !apiKey) throw new LangflowError("config", "Langflow is not configured");

    let endpoint: URL;
    try {
        endpoint = new URL(url);
    } catch {
        throw new LangflowError("config", "Langflow URL is invalid");
    }
    const path = endpoint.pathname.replace(/\/+$/, "");
    if (!["http:", "https:"].includes(endpoint.protocol) || (path !== "" && path !== WORKFLOWS_PATH)) {
        throw new LangflowError("config", "Langflow URL must be the server base URL or its workflows endpoint");
    }
    endpoint.pathname = WORKFLOWS_PATH;
    endpoint.search = "";
    endpoint.hash = "";
    return { endpoint, apiKey };
}

export function isLangflowConfigured(env: Environment = process.env): boolean {
    try {
        getLangflowConfig(env);
        return true;
    } catch {
        return false;
    }
}

function outputTexts(envelope: Record<string, unknown>): string[] {
    const texts: string[] = [];
    if (isRecord(envelope.output) && typeof envelope.output.text === "string") texts.push(envelope.output.text);
    // Flows with several Chat Output nodes (LF-01, LF-02, LF-04) may report each one separately.
    if (Array.isArray(envelope.outputs)) {
        for (const item of envelope.outputs) {
            if (typeof item === "string") texts.push(item);
            else if (isRecord(item) && typeof item.text === "string") texts.push(item.text);
            else if (isRecord(item) && isRecord(item.output) && typeof item.output.text === "string") texts.push(item.output.text);
        }
    }
    return texts;
}

// The final Chat Output text is the flow's JSON result; the REST body is only its envelope.
export function parseFlowEnvelope(envelope: unknown, contract?: string): unknown {
    if (!isRecord(envelope) || envelope.object !== "response" || envelope.status !== "completed" || envelope.has_errors !== false) {
        throw new LangflowError("incomplete", "Langflow did not complete the flow");
    }
    for (const text of outputTexts(envelope)) {
        let parsed: unknown;
        try {
            parsed = JSON.parse(text);
        } catch {
            continue;
        }
        if (!contract || (isRecord(parsed) && parsed.contract_version === contract)) return parsed;
    }
    throw new LangflowError("invalid_output", "Langflow returned no usable flow output");
}

export type RunFlowOptions = {
    timeoutMs: number;
    maxBytes?: number;
    contract?: string;
    sessionId?: string;
};

export async function runFlow(flowId: string, input: unknown, options: RunFlowOptions): Promise<unknown> {
    const { endpoint, apiKey } = getLangflowConfig();
    let upstream: Response;
    try {
        upstream = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": apiKey },
            body: JSON.stringify({
                flow_id: flowId,
                input_value: JSON.stringify(input),
                mode: "sync",
                session_id: options.sessionId ?? crypto.randomUUID(),
            }),
            cache: "no-store",
            signal: AbortSignal.timeout(options.timeoutMs),
        });
    } catch (error) {
        if (error instanceof Error && error.name === "TimeoutError") throw new LangflowError("timeout", "Langflow took too long to respond");
        throw new LangflowError("unreachable", "Could not reach Langflow");
    }
    if (!upstream.ok) throw new LangflowError("upstream", `Langflow returned HTTP ${upstream.status}`);

    let envelope: unknown;
    try {
        const text = await upstream.text();
        if (text.length > (options.maxBytes ?? 200_000)) throw new Error("RESPONSE_TOO_LARGE");
        envelope = JSON.parse(text);
    } catch (error) {
        if (error instanceof Error && error.name === "TimeoutError") throw new LangflowError("timeout", "Langflow took too long to respond");
        throw new LangflowError("invalid_response", "Langflow returned an unreadable response");
    }
    return parseFlowEnvelope(envelope, options.contract);
}
