"use client";

import { useEffect, useState } from "react";
import { getEvidenceClusters } from "@/app/engine/lib/evidenceApi";
import type { EvidenceCluster } from "@/app/engine/types";

// The selected district's located evidence (counts and centre point), read from its
// city's clusters once per city. Null until loaded, on failure, or when there is none;
// the district's facts already carry the counts, so this only places the map point.
export function useLocatedEvidence(cityId: string | null, zoneId: string | null): EvidenceCluster | null {
    const [result, setResult] = useState<{ cityId: string; clusters: EvidenceCluster[] } | null>(null);

    useEffect(() => {
        if (!cityId) return;
        const controller = new AbortController();
        getEvidenceClusters(cityId, "career", controller.signal).then(({ clusters }) => {
            if (!controller.signal.aborted) setResult({ cityId, clusters });
        }).catch(() => {
            if (!controller.signal.aborted) setResult({ cityId, clusters: [] });
        });
        return () => controller.abort();
    }, [cityId]);

    if (!cityId || !zoneId || result?.cityId !== cityId) return null;
    return result.clusters.find((cluster) => cluster.zone_id === zoneId) ?? null;
}
