import { loginUser } from "@/app/engine/controller/userController";

export async function POST(req: Request) {
    const body = await req.json();

    const { email, password } = body;

    // Validate the input
    if (!email || !password) {
        return new Response(
            JSON.stringify({ error: "Please provide both email and password." }),
            { status: 400 }
        );
    }

    const {data, error} = await loginUser(email, password);

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