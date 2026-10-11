// Returns parsed JSON or an error Response.
export async function readJsonBody(request: Request, maxBytes?: number): Promise<unknown> {
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
        return Response.json({ error: "Content-Type must be application/json" }, { status: 415 });
    }
    try {
        if (maxBytes !== undefined) {
            if (Number(request.headers.get("content-length")) > maxBytes) return Response.json({ error: "Request too large" }, { status: 413 });
            const reader = request.body?.getReader();
            if (!reader) return Response.json({ error: "Invalid JSON request" }, { status: 400 });
            const chunks: Uint8Array[] = [];
            let size = 0;
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    size += value.byteLength;
                    if (size > maxBytes) return Response.json({ error: "Request too large" }, { status: 413 });
                    chunks.push(value);
                }
            } finally { await reader.cancel(); }
            const bytes = new Uint8Array(size);
            let offset = 0;
            for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
            return JSON.parse(new TextDecoder().decode(bytes));
        }
        return await request.json();
    } catch {
        return Response.json({ error: "Invalid JSON request" }, { status: 400 });
    }
}
