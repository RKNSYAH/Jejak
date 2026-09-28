import { loginUser } from "@/app/engine/controller/userServerController";

export async function POST(request: Request) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return Response.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return Response.json({ error: "Please provide both email and password." }, { status: 400 });
    }

    const { email, password } = body as Record<string, unknown>;

    if (typeof email !== "string" || !email.trim() || typeof password !== "string" || !password) {
        return Response.json({ error: "Please provide both email and password." }, { status: 400 });
    }

    const { data, error } = await loginUser(email.trim(), password);

    if (error) {
        const status = error.status === 400
            ? 401
            : error.status && error.status >= 400 && error.status <= 599
                ? error.status
                : 500;
        return Response.json({ error: error.message }, { status });
    }

    return Response.json({ message: "User logged in successfully", userId: data.user?.id });
}
