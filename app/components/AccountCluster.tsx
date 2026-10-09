"use client";

import Link from "next/link";
import { Bookmark } from "lucide-react";
import type { CSSProperties } from "react";
import type { AccountSummary } from "../engine/controller/userServerController";
import { headerClusterClass } from "./HeaderCluster";

// MapControls reserves this width on its right edge.
export const ACCOUNT_CLUSTER_WIDTH = 240;

type Props = {
    account: AccountSummary | null;
    className?: string;
    active?: boolean;
    onAccountClick?: () => void;
};

export default function AccountCluster({ account, className = "", active = false, onAccountClick }: Props) {
    const name = account?.name ?? "Akun";
    const label = `Profil ${name}${account?.planName ? `, paket ${account.planName}` : ""}`;
    const accountClass = `btn h-9 min-h-9 shrink-0 gap-2.5 rounded-xl px-0.5 font-normal focus-visible:outline-primary md:h-12 md:min-h-12 md:min-w-0 md:flex-1 md:justify-start md:px-1.5 ${active ? "btn-primary shadow-none hover:bg-primary hover:shadow-none" : "btn-ghost"}`;
    const identity = <>
        <span aria-hidden="true" className={`flex size-8 shrink-0 items-center justify-center rounded-full font-sans text-sm font-bold ${active ? "bg-base-100 text-primary" : "bg-primary text-primary-content"}`}>{name.charAt(0).toUpperCase()}</span>
        <span className="hidden min-w-0 flex-col text-left leading-tight md:flex">
            <strong className="truncate text-sm font-semibold">{name}</strong>
            {account?.planName && <span className={`truncate text-xs ${active ? "text-base-300" : "text-ink-muted"}`}>{account.planName}</span>}
        </span>
    </>;

    return <nav aria-label="Akun" data-hci-region="account-cluster" className={`${headerClusterClass} gap-0.5 font-body text-ink md:w-(--account-cluster-width) md:px-1.5 ${className}`}
        style={{ "--account-cluster-width": `${ACCOUNT_CLUSTER_WIDTH}px` } as CSSProperties}>
        <button type="button" title="Area tersimpan — belum tersedia" aria-label="Area tersimpan" aria-disabled="true"
            className="btn btn-square btn-ghost size-9 shrink-0 rounded-xl text-ink-muted focus-visible:outline-primary md:size-11">
            <Bookmark aria-hidden="true" className="size-4 md:size-5" />
        </button>
        <span aria-hidden="true" className="mx-1 h-7 w-px shrink-0 bg-rule md:mx-1.5" />
        {onAccountClick
            ? <button type="button" title="Profil" aria-label={label} aria-pressed={active} onClick={onAccountClick} className={accountClass}>{identity}</button>
            : <Link href="/user" title="Profil" aria-label={label} className={accountClass}>{identity}</Link>}
    </nav>;
}
