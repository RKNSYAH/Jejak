import { createClient } from "../lib/server";

export async function getUserProfile(userId: string, profileId: string) {
    const res = await fetch(
        `/api/users/${userId}/profiles/${profileId}`,
        {
            headers: {
                "Authorization": `Bearer ${process.env.API_TOKEN}`,
            },
        }
    );
    if (!res.ok) {
        return null;
    }
    const data = await res.json();
    return data;
}

export async function getAuthenticatedUser() {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();

    return user;
}

export async function logoutUser() {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
        throw new Error(`Logout failed: ${error.message}`);
    }

    return true
}