import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client for backend-only RPCs (enrichment claims, evidence writes,
// snapshot publication). Never import this from client code.
export function isAdminConfigured(): boolean {
    return !!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && !!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
}

export function createAdminClient() {
    if (!isAdminConfigured()) throw new Error("Supabase service role is not configured");
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
}
