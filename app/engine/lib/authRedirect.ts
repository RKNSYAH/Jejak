import { loginPath } from "./authDestination";

export function handleAuthFailure(response: Response): boolean {
    if (response.status !== 401 && response.status !== 403) return false;

    if (typeof window !== "undefined" && window.location.pathname === "/map") {
        const { pathname, search, hash } = window.location;
        window.location.replace(loginPath(`${pathname}${search}${hash}`));
    }
    return true;
}
