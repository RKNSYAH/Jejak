import "server-only";
import { getAuthenticatedUserId } from "../controller/userServerController";

export async function mapAccessDenied(): Promise<Response | null> {
    const userId = await getAuthenticatedUserId().catch(() => null);
    if (userId) return null;

    return Response.json({ error: "Sign in to access the map", code: "SIGN_IN_REQUIRED" }, {
        status: 403,
        headers: { "Cache-Control": "no-store" },
    });
}
