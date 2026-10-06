import { deleteAccount, getAuthenticatedUserId } from "@/app/engine/controller/userServerController";

export async function DELETE() {
    const userId = await getAuthenticatedUserId().catch(() => null);
    if (!userId) return Response.json({ error: "Masuk untuk menghapus akun." }, { status: 401 });

    try {
        await deleteAccount(userId);
        return new Response(null, { status: 204 });
    } catch (error) {
        console.error("Unable to delete account", error);
        return Response.json({ error: "Akun belum terhapus. Coba lagi." }, { status: 503 });
    }
}
