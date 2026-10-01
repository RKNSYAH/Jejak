import { RELOCATION_PROFILE_NAME, RELOCATION_PROFILE_SCHEMA_VERSION, type StoredRelocationProfile } from "./relocationProfile";
import { isRecord } from "./zoneGeometry";

const CACHE_PREFIX = "jejak:relocation-profile:v1:";
type CacheStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage(): CacheStorage | undefined {
    try { return typeof window === "undefined" ? undefined : window.localStorage; }
    catch { return undefined; }
}

export function isStoredRelocationProfile(value: unknown): value is StoredRelocationProfile {
    if (!isRecord(value) || !isRecord(value.profile)) return false;
    const profile = value.profile;
    return typeof value.id === "string" && value.profile_name === RELOCATION_PROFILE_NAME &&
        Number.isInteger(value.revision) && Number(value.revision) > 0 &&
        typeof value.confirmed_at === "string" && typeof value.updated_at === "string" &&
        profile.schema_version === RELOCATION_PROFILE_SCHEMA_VERSION &&
        isRecord(profile.hard_constraints) && isRecord(profile.soft_preferences) &&
        isRecord(profile.priority_weights) && Object.values(profile.priority_weights).every((weight) => typeof weight === "number" && Number.isFinite(weight)) &&
        typeof profile.taxonomy_version === "string" && profile.contract_version === "lf05-v2";
}

// undefined means unknown/cache miss; null means the server confirmed no profile.
export function readRelocationProfileCache(userId: string, storage = browserStorage()): StoredRelocationProfile | null | undefined {
    try {
        const raw = storage?.getItem(`${CACHE_PREFIX}${userId}`);
        if (!raw) return undefined;
        const value: unknown = JSON.parse(raw);
        if (!isRecord(value) || value.version !== 1 || value.userId !== userId) return undefined;
        return value.profile === null || isStoredRelocationProfile(value.profile) ? value.profile : undefined;
    } catch { return undefined; }
}

export function writeRelocationProfileCache(userId: string, profile: StoredRelocationProfile | null, storage = browserStorage()) {
    try { storage?.setItem(`${CACHE_PREFIX}${userId}`, JSON.stringify({ version: 1, userId, profile })); }
    catch { /* Browser storage is optional; the in-memory profile still works. */ }
}

export function clearRelocationProfileCache(userId: string, storage = browserStorage()) {
    try { storage?.removeItem(`${CACHE_PREFIX}${userId}`); }
    catch { /* Signing out must still work when storage is unavailable. */ }
}
