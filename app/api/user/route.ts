import { deleteAccount, getAuthenticatedUserId } from "@/app/engine/controller/userServerController";
import { accountChangedResponse } from "@/app/engine/lib/accountIdentity";

export async function DELETE(request: Request) {
    const userId = await getAuthenticatedUserId().catch(() => null);
    if (!userId) return Response.json({ error: "Masuk untuk menghapus akun." }, { status: 401 });
    const changed = accountChangedResponse(request, userId);
    if (changed) return changed;

    try {
        await deleteAccount(userId);
        return new Response(null, { status: 204 });
    } catch (error) {
        console.error("Unable to delete account", error);
        return Response.json({ error: "Akun belum terhapus. Coba lagi." }, { status: 503 });
    }
}
