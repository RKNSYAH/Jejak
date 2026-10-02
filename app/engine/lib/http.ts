// Parses a JSON request body, or returns the 415/400 response to send instead.
export async function readJsonBody(request: Request): Promise<unknown> {
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
        return Response.json({ error: "Content-Type must be application/json" }, { status: 415 });
    }
    try {
        return await request.json();
    } catch {
        return Response.json({ error: "Invalid JSON request" }, { status: 400 });
    }
}
