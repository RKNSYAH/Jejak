import { isRecord } from "./zoneGeometry";

export const EXPECTED_USER_HEADER = "X-Jejak-User-Id";
export const ACCOUNT_CHANGED_MESSAGE = "Akun berubah. Muat ulang sebelum melanjutkan.";

export type AccountScope = { userId: string; readonly signal: AbortSignal; invalidate: (navigate?: boolean) => void };

export function accountChangedResponse(request: Request, authenticatedUserId: string): Response | null {
    // A consistency check only: authorization always uses the verified session ID.
    if (request.headers.get(EXPECTED_USER_HEADER) === authenticatedUserId) return null;
    return Response.json({ code: "ACCOUNT_CHANGED", error: ACCOUNT_CHANGED_MESSAGE }, {
        status: 409, headers: { "Cache-Control": "private, no-store" },
    });
}

export async function accountFetch(account: AccountScope, url: string, init: RequestInit = {}): Promise<{ response: Response; result: unknown }> {
    const headers = new Headers(init.headers);
    headers.set(EXPECTED_USER_HEADER, account.userId);
    const signal = init.signal ? AbortSignal.any([account.signal, init.signal]) : account.signal;
    if (account.signal.aborted) throw new Error(ACCOUNT_CHANGED_MESSAGE);
    let response: Response;
    try {
        response = await fetch(url, { ...init, headers, signal });
    } catch (error) {
        throw account.signal.aborted ? new Error(ACCOUNT_CHANGED_MESSAGE) : error;
    }
    const result: unknown = await response.json().catch(() => null);
    if (account.signal.aborted) throw new Error(ACCOUNT_CHANGED_MESSAGE);
    if (response.status === 409 && isRecord(result) && result.code === "ACCOUNT_CHANGED") {
        account.invalidate();
        throw new Error(ACCOUNT_CHANGED_MESSAGE);
    }
    return { response, result };
}
