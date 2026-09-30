const DEFAULT_DESTINATION = "/map";

export function authDestination(value: string | null | undefined): string {
    if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\x00-\x1f]/.test(value)) {
        return DEFAULT_DESTINATION;
    }

    try {
        const url = new URL(value, "https://jejak.local");
        if (url.origin !== "https://jejak.local" || !["/map", "/user"].includes(url.pathname)) {
            return DEFAULT_DESTINATION;
        }
        return `${url.pathname}${url.search}${url.hash}`;
    } catch {
        return DEFAULT_DESTINATION;
    }
}

export function signupDestination(value: string | null | undefined): string {
    const destination = authDestination(value);
    if (!destination.startsWith("/map")) return destination;
    const url = new URL(destination, "https://jejak.local");
    url.searchParams.set("welcome", "1");
    return `${url.pathname}${url.search}${url.hash}`;
}

export function loginPath(next: string | null | undefined): string {
    return `/login?${new URLSearchParams({ next: authDestination(next) })}`;
}
