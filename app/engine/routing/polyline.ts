import type { RoutingPoint } from "./types";

export function decodePolyline(encoded: string, precision: 5 | 6): RoutingPoint[] {
    if (encoded.length > 1_000_000) throw new Error("ROUTE_GEOMETRY_TOO_LARGE");
    let offset = 0, latitude = 0, longitude = 0;
    const points: RoutingPoint[] = [];
    function next(): number {
        let result = 0, shift = 0, byte: number;
        do {
            if (offset >= encoded.length || shift > 30) throw new Error("INVALID_ROUTE_GEOMETRY");
            byte = encoded.charCodeAt(offset++) - 63;
            if (byte < 0 || byte > 63) throw new Error("INVALID_ROUTE_GEOMETRY");
            result |= (byte & 31) << shift;
            shift += 5;
        } while (byte >= 32);
        return (result & 1) ? ~(result >>> 1) : result >>> 1;
    }
    while (offset < encoded.length) {
        latitude += next(); longitude += next();
        const point: RoutingPoint = [longitude / 10 ** precision, latitude / 10 ** precision];
        if (Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) throw new Error("INVALID_ROUTE_GEOMETRY");
        points.push(point);
    }
    if (points.length < 2) throw new Error("INVALID_ROUTE_GEOMETRY");
    return points;
}
