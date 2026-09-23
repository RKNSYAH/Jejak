import { createClient } from "@/app/engine/lib/client";

export async function POST(req: Request) {
    const body = await req.json();

    const { email, password } = body;

    const supabase = await createClient();

    const {data, error} = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500 }
        );
    }

    return new Response(
        JSON.stringify({ message: "User logged in successfully", userId: data.user?.id }),
        { status: 200 }
    );
}