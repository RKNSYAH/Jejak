// Boundary lookups can take longer than ordinary fact/catalogue requests.
// Leave room for auth, database reads and response delivery after BIG returns.
export const BOUNDARY_PROVIDER_TIMEOUT_MS = 45_000;
export const ZONE_BOUNDARY_REQUEST_TIMEOUT_MS = 60_000;
export const ZONE_REQUEST_TIMEOUT_MS = 20_000;
