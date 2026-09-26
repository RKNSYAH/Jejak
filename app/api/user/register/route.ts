import { registerUser } from "@/app/engine/controller/userController";

export async function POST(req: Request) {
    const body = await req.json();
    const { email, phone, password, name } = body;

    // Validate the input
    if ((!email && !phone) || !password || !name) {
        return new Response(
            JSON.stringify({ error: "Missing required fields" }),
            { status: 400 }
        );
    }

    if (phone && typeof phone !== "number") {
        return new Response(
            JSON.stringify({ error: "Phone number must be a valid number." }),
            { status: 400 }
        );
    }

    const {data, error} = await registerUser(email, password, name);

    if (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500 }
        );
    }

    return new Response(
        JSON.stringify({ message: "User registered successfully", userId: data.user?.id }),
        { status: 201 }
    );
}