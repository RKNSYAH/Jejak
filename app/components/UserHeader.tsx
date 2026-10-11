"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { AccountSummary } from "../engine/controller/userServerController";
import AccountCluster from "./AccountCluster";
import BrandLogo from "./BrandLogo";
import HeaderCluster from "./HeaderCluster";

export default function UserHeader({ account = null, mapHref = "/map", onNavigate, onAccountClick, accountActive = false }: {
    account?: AccountSummary | null;
    mapHref?: string;
    onNavigate?: (event: { preventDefault: () => void }) => void;
    onAccountClick?: () => void;
    accountActive?: boolean;
}) {
    return (
        <header className="flex flex-wrap items-start justify-between gap-2 px-3 pt-3 md:px-4 md:pt-4" data-hci-region="user-header">
            <HeaderCluster region="user-brand-cluster" className="shrink-0">
                <BrandLogo border={false} compact onNavigate={onNavigate} />
                <span aria-hidden="true" className="h-7 w-px shrink-0 bg-rule" />
                <Link href={mapHref} onNavigate={onNavigate} aria-label="Kembali ke peta" className="btn btn-ghost min-h-11 gap-1 rounded-xl px-1.5 text-sm font-normal text-ink focus-visible:outline-primary md:px-3">
                    <ChevronLeft aria-hidden="true" className="size-4" />
                    <span>Kembali<span className="hidden sm:inline"> ke peta</span></span>
                </Link>
            </HeaderCluster>
            <AccountCluster account={account} onAccountClick={onAccountClick} active={accountActive} />
        </header>
    );
}
