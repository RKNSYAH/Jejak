import { createClient } from "@/app/engine/lib/client";

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

    const supabase = createClient();

    // Create the new user
    const { data, error } = await supabase.auth.signUp({
        email,
        phone,
        password: password,
        options: {
            data: {
                name
            }
        }
    });

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