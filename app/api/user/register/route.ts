import { registerUser } from "@/app/engine/controller/userServerController";

export async function POST(request: Request) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return Response.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return Response.json({ error: "Email, password, and name are required." }, { status: 400 });
    }

    const { email, password, name } = body as Record<string, unknown>;
    if (
        typeof email !== "string" || !email.trim() ||
        typeof password !== "string" || !password ||
        typeof name !== "string" || !name.trim()
    ) {
        return Response.json({ error: "Email, password, and name are required." }, { status: 400 });
    }

    const { data, error } = await registerUser(email.trim(), password, name.trim());

    if (error) {
        return Response.json({ error: error.message }, { status: 400 });
    }

    return Response.json({ message: "User registered successfully", userId: data.user?.id }, { status: 201 });
}
