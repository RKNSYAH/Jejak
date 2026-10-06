import { createServer } from "node:http";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { applyMigrations, createDatabase } from "../../supabase/tests/bootstrap.mjs";

// Local-only Auth/Data API fixture. Production code still verifies every session.
const secret = randomBytes(32);
const refreshTokens = new Set();
const user = {
    id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated",
    email: "map-user@example.test", email_confirmed_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    app_metadata: { provider: "email", providers: ["email"] }, user_metadata: { name: "Map test user" },
};

// Profile tests use the real migration/RPC and RLS, not a response echo.
const database = await createDatabase();
await applyMigrations(database);
await database.query("insert into auth.users (id) values ($1)", [user.id]);
const serviceKey = "e2e-local-service-role";

async function readBody(request) {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    return JSON.parse(raw);
}

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
    // Deterministic model boundary. Next's LF-05 route/controller still run in full.
    if (url.pathname === "/api/v2/workflows" && request.method === "POST") {
        if (request.headers["x-api-key"] !== "e2e-langflow-key") return send(401, { message: "Invalid workflow key" });
        const body = await readBody(request);
        if (body.flow_id !== "8feff2fc-81df-438d-8dae-c10563f1ab67") return send(400, { message: "Only LF-05 is available" });
        const input = JSON.parse(body.input_value);
        if (input.mode === "refinement") {
            // Mirror deployed LF-05's native input boundary rather than accepting an oversized story wrapper.
            const fields = new Set(["goal", "target_fields", "target_occupations", "destination_cities", "monthly_budget", "housing_budget", "commute_minutes", "work_arrangement", "education_level", "language_preferences", "priorities", "deal_breakers", "transport_mode"]);
            const weights = new Set(["career", "housing", "commute", "education", "cost_of_living"]);
            const current = input.current_profile;
            if (!current || !input.message.trim() || input.message.length > 4000 ||
                [current.hard_constraints, current.soft_preferences, input.answers].some((group) => !group || Object.keys(group).some((key) => !fields.has(key))) ||
                Object.entries(input.answers).some(([key, value]) => value !== null && typeof value === "object" && !Array.isArray(value) && !["monthly_budget", "housing_budget"].includes(key)) ||
                Object.keys(current.priority_weights).some((key) => !weights.has(key))) {
                return send(400, { message: "Invalid native refinement contract" });
            }
            // Model intentionally contradicts the explicit rent edit. The LF-05 server
            // must reconcile this output against the submitted, user-edited draft.
            const hard = {
                ...current.hard_constraints,
                housing_budget: { amount: 9_000_000, currency: "IDR", period: "month" },
            };
            const profile = {
                hard_constraints: hard, soft_preferences: current.soft_preferences,
                priority_weights: current.priority_weights, inferred_fields: [], clarification_questions: [],
                requires_confirmation: true, confirmed: false, writes_performed: false,
                taxonomy_version: "2026-09", contract_version: "lf05-v2",
                decision_trace: { received_message: input.message }, runtime_usage: null,
            };
            return send(200, { object: "response", status: "completed", has_errors: false, output: { text: JSON.stringify(profile) } });
        }
        const hasBudget = /Rp6 juta/.test(input.message);
        const reportedStory = /punya budget 5jt per bulan 2jt untuk kos/.test(input.message);
        const unknownBudgetStory = /software engineer budget belum tahu/.test(input.message);
        const goal = /\b(?:bekerja|kerja)\b|Jawaban: Kerja/.test(input.message) ? "work" : null;
        const hasDestination = /kantor di Kuningan/.test(input.message);
        const hasTransport = /transportasi umum/.test(input.message);
        const profile = {
            hard_constraints: reportedStory ? {
                monthly_budget: { amount: 5000000, currency: "IDR", period: "month" },
                housing_budget: { amount: 2000000, currency: "IDR", period: "month" }, destination_cities: ["Jakarta Selatan"],
            } : hasBudget ? { monthly_budget: { amount: 6000000, currency: "IDR", period: "month" } } : {},
            soft_preferences: { goal, ...(reportedStory ? { target_occupations: ["software_engineer"], target_fields: ["software_and_it_services"] } : {}),
                ...(hasDestination ? { destination: { name: "Kuningan", precision: "area" } } : {}),
                // Unsupported model guess must never become a user's transport choice.
                ...(hasTransport ? { transport_mode: "transit" } : unknownBudgetStory ? { transport_mode: "car" } : {}) },
            priority_weights: reportedStory ? { career: 0.31, housing: 0.30, commute: 0.24, education: 0, cost_of_living: 0.15 } : {},
            inferred_fields: reportedStory ? ["goal", "priorities"] : goal ? ["goal"] : [],
            // Deliberately omit commute even after receiving 45. The application must preserve explicit answers.
            clarification_questions: reportedStory ? ["Berapa lama waktu perjalanan sekali jalan yang masih bisa Anda terima (dalam menit)?"]
                : hasBudget ? [] : ["Berapa anggaran bulananmu?", "Di mana lokasi kantormu?", "Moda transportasi apa yang kamu pilih?"],
            requires_confirmation: true, confirmed: false, writes_performed: false,
            taxonomy_version: "2026-09", contract_version: "lf05-v2",
            decision_trace: { received_message: input.message }, runtime_usage: null,
        };
        return send(200, { object: "response", status: "completed", has_errors: false, output: { text: JSON.stringify(profile) } });
    }
    if (url.pathname === "/auth/v1/token" && request.method === "POST") {
        let body;
        try {
            body = await readBody(request);
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
    const isService = request.headers.authorization === `Bearer ${serviceKey}`;
    if (!isService && !authenticated(request)) return send(401, { code: "bad_jwt", message: "Invalid JWT" });
    if (url.pathname === "/auth/v1/user") return send(200, user);
    if (url.pathname === "/auth/v1/logout") return send(204);
    if (url.pathname === "/rest/v1/rpc/save_confirmed_relocation_profile" && request.method === "POST") {
        if (!isService) return send(403, { message: "Service role required" });
        try {
            const body = await readBody(request);
            const rows = await database.transaction(async (tx) => {
                await tx.exec("set local role service_role");
                return (await tx.query("select * from public.save_confirmed_relocation_profile($1, $2, $3::jsonb)",
                    [body.p_user_id, body.p_profile_name, JSON.stringify(body.p_profile)])).rows;
            });
            return send(200, rows);
        } catch (error) { return send(400, { message: error.message }); }
    }
    if (url.pathname === `/auth/v1/admin/users/${user.id}` && request.method === "DELETE") {
        if (!isService) return send(403, { message: "Service role required" });
        await database.query("delete from auth.users where id = $1", [user.id]);
        // Single shared fixture user: recreate it so later tests can still save profiles.
        await database.query("insert into auth.users (id) values ($1)", [user.id]);
        return send(200, user);
    }
    const filter = (key) => url.searchParams.get(key)?.replace(/^eq\./, "") ?? null;
    if (url.pathname === "/rest/v1/relocation_profiles" && request.method === "DELETE") {
        if (!isService) return send(403, { message: "Service role required" });
        try {
            await database.transaction(async (tx) => {
                await tx.exec("set local role service_role");
                await tx.query("delete from public.relocation_profiles where user_id = $1::uuid and profile_name = $2",
                    [filter("user_id"), filter("profile_name")]);
            });
            return send(204);
        } catch (error) { return send(400, { message: error.message }); }
    }
    if (url.pathname === "/rest/v1/relocation_profiles" && request.method === "GET") {
        try {
            const rows = await database.transaction(async (tx) => {
                await tx.exec(isService ? "set local role service_role" : "set local role authenticated");
                await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [user.id]);
                return (await tx.query(`select id, profile_name, revision, profile, confirmed_at, updated_at
                    from public.relocation_profiles where confirmed
                    and ($1::uuid is null or user_id = $1::uuid)
                    and ($2::bigint is null or id = $2::bigint)
                    and ($3::text is null or profile_name = $3::text)
                    order by revision desc limit 1`, [filter("user_id"), filter("id"), filter("profile_name")])).rows;
            });
            const single = request.headers.accept?.includes("application/vnd.pgrst.object+json");
            if (single && rows.length !== 1) return send(406, { code: "PGRST116", message: "Expected one row" });
            return send(200, single ? rows[0] : rows);
        } catch (error) { return send(400, { message: error.message }); }
    }
    if (url.pathname.startsWith("/rest/v1/")) return send(200, []);
    return send(404, { message: "Unknown fixture endpoint" });
}).listen(3101, "127.0.0.1");
