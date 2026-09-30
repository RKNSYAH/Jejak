import { createServer } from "node:http";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Local-only Auth/Data API fixture. Production code still verifies every session.
const secret = randomBytes(32);
const refreshTokens = new Set();
const user = {
    id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated",
    email: "map-user@example.test", email_confirmed_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    app_metadata: { provider: "email", providers: ["email"] }, user_metadata: { name: "Map test user" },
};

function session(expired = false) {
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = expired ? now - 60 : now + 3600;
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
        iss: "http://127.0.0.1:3101/auth/v1", sub: user.id, aud: user.aud, role: user.role,
        email: user.email, iat: now - (expired ? 3600 : 0), exp: expiresAt, is_anonymous: false,
    })).toString("base64url");
    const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
    const refreshToken = randomBytes(24).toString("hex");
    refreshTokens.add(refreshToken);
    return {
        access_token: `${header}.${payload}.${signature}`, refresh_token: refreshToken,
        token_type: "bearer", expires_in: expiresAt - now, expires_at: expiresAt, user,
    };
}

function authenticated(request) {
    try {
        const [header, payload, signature] = (request.headers.authorization ?? "").replace(/^Bearer /, "").split(".");
        const expected = createHmac("sha256", secret).update(`${header}.${payload}`).digest();
        const supplied = Buffer.from(signature, "base64url");
        const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
        return supplied.length === expected.length && timingSafeEqual(supplied, expected) &&
            claims.sub === user.id && claims.exp > Date.now() / 1000;
    } catch {
        return false;
    }
}

createServer(async (request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "http://localhost:3100");
    response.setHeader("Access-Control-Allow-Headers", "authorization, apikey, content-type, x-client-info, x-supabase-api-version");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    const send = (status, body) => {
        response.writeHead(status, { "Content-Type": "application/json" });
        response.end(body === undefined ? undefined : JSON.stringify(body));
    };
    if (request.method === "OPTIONS") return send(204);
    const url = new URL(request.url, "http://127.0.0.1:3101");
    if (url.pathname === "/health") return send(200, { status: "ok" });
    if (url.pathname === "/auth/v1/token" && request.method === "POST") {
        let body;
        try {
            let raw = "";
            for await (const chunk of request) raw += chunk;
            body = JSON.parse(raw);
        } catch {
            return send(400, { code: "bad_json", message: "Invalid JSON" });
        }
        if (url.searchParams.get("grant_type") === "refresh_token") {
            if (!refreshTokens.delete(body.refresh_token)) {
                return send(400, { code: "refresh_token_not_found", message: "Invalid refresh token" });
            }
            return send(200, session());
        }
        if ([user.email, "expired@example.test"].includes(body.email) && body.password === "map-test-password") {
            return send(200, session(body.email === "expired@example.test"));
        }
        return send(400, { code: "invalid_credentials", message: "Invalid login credentials" });
    }
    if (!authenticated(request)) return send(401, { code: "bad_jwt", message: "Invalid JWT" });
    if (url.pathname === "/auth/v1/user") return send(200, user);
    if (url.pathname === "/auth/v1/logout") return send(204);
    if (url.pathname.startsWith("/rest/v1/")) return send(200, []);
    return send(404, { message: "Unknown fixture endpoint" });
}).listen(3101, "127.0.0.1");
