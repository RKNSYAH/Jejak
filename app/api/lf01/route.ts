import { LF01Input } from "@/app/engine/types";
import { getUserProfile } from "@/app/engine/controller/userController";
import { useUserProfileStore } from "@/app/stores/userStores";
import { randomUUID } from "crypto";
import { createClient } from "@/app/engine/lib/server";

export async function POST(req: Request) {
    const body = await req.json();
    const { zone_name, city_name, missing_evidence, target_sectors, query, profile_id } = body

    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
        return new Response(
            JSON.stringify({ error: "Unauthorized" }),
            { status: 401 }
        );
    }

    const profile = await getUserProfile(
        user.id,
        profile_id
    );
    
    if (!profile) {
        return new Response(
            JSON.stringify({ error: "Profile not found" }),
            { status: 404 }
        );
    }
    const userProfile = useUserProfileStore.getState()

    const run_id = randomUUID()

    const payload: LF01Input = {
        run_id,
        zone_name,
        city_name,
        missing_evidence,
        target_sectors: userProfile.target_sectors,
        needed_count: 7,
        query,
    }

    const res = await fetch(
        `placeholder/lf01`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                input_value: JSON.stringify(payload),
                input_type: "chat",
                output_type: "chat",
            }),
        }
    )

    const data = await res.json();

    return data
}