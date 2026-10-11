import "server-only";
import { isRecord } from "../lib/zoneGeometry";

export class RoutingFailure extends Error {
    constructor(public readonly reason: "no_route" | "unavailable") { super(reason); }
}

// Coordinate-bound cache stays private, bounded and memory-only. Graph hashes invalidate it.
const cache = new Map<string, { expires: number; value: unknown }>();
export async function routerJson(url: string, body: unknown, version: string, signal: AbortSignal): Promise<unknown> {
    signal.throwIfAborted();
    const key = `${version}:${url}:${JSON.stringify(body)}`;
    const entry = cache.get(key);
    if (entry && entry.expires > Date.now()) return entry.value;
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body), cache: "no-store", signal });
    // Stream with a hard size cap even if an upstream omits Content-Length.
    if (!response.body) throw new RoutingFailure("unavailable");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 2_000_000) throw new RoutingFailure("unavailable");
            chunks.push(value);
        }
    } finally { await reader.cancel(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let value: unknown;
    try { value = JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw new RoutingFailure("unavailable"); }
    if (isRecord(value) && value.error_code === 442) throw new RoutingFailure("no_route");
    if (!response.ok || (isRecord(value) && (value.error_code !== undefined ||
        (Array.isArray(value.errors) && value.errors.length > 0)))) throw new RoutingFailure("unavailable");
    signal.throwIfAborted();
    if (cache.size >= 128) cache.delete(cache.keys().next().value!);
    cache.set(key, { value, expires: Date.now() + 300_000 });
    return value;
}
