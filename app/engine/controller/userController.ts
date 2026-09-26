import { createClient } from "../lib/server";

export async function registerUser(email: string, password: string, name: string) {
    const supabase = await createClient();

    const { data, error } = await supabase.auth.signUp({
        email,
        password: password,
        options: {
            data: {
                name
            }
        }
    });
    return { data, error };
}

export async function loginUser(email: string, password: string) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });
    return { data, error };
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