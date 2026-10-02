import type { ReactNode } from "react";

export const headerClusterClass = "flex h-11 min-w-0 items-center rounded-2xl border border-rule bg-base-100 px-1 shadow-overlay md:h-15";

export default function HeaderCluster({ children, className = "", region }: { children: ReactNode; className?: string; region: string }) {
    return <div data-hci-region={region} className={`${headerClusterClass} gap-1 md:px-2 ${className}`}>{children}</div>;
}
