"use client";

import { ArrowRight, ChevronRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type NavLink = { href: string; label: string };

export default function MobileMenu({ links, activeHref, startHref, signedIn }: { links: NavLink[]; activeHref: string; startHref: string; signedIn: boolean }) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <button
                type="button"
                popoverTarget="mobile-menu"
                aria-label={open ? "Tutup menu" : "Buka menu"}
                aria-expanded={open}
                className={`btn btn-square btn-ghost size-11 min-h-11 min-w-11 rounded-lg p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${open ? "bg-primary/10" : ""}`}
            >
                {open ? <X aria-hidden="true" className="size-5" /> : <Menu aria-hidden="true" className="size-5" />}
            </button>
            <nav
                id="mobile-menu"
                popover="auto"
                aria-label="Menu"
                data-hci-region="landing-mobile-menu"
                onToggle={(event) => setOpen(event.newState === "open")}
                onClick={(event) => {
                    if ((event.target as HTMLElement).closest("a")) event.currentTarget.hidePopover();
                }}
                className="fixed inset-x-3 top-[4.5rem] bottom-auto m-0 h-auto w-auto overflow-visible rounded-2xl border border-rule bg-base-100 p-4 text-ink shadow-overlay backdrop:top-16 backdrop:bg-ink/30"
            >
                <ul>
                    {links.map((link) => (
                        <li key={link.href} className="border-b border-rule">
                            <Link
                                href={link.href}
                                aria-current={activeHref === link.href ? "page" : undefined}
                                className={`flex min-h-12 items-center justify-between font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${activeHref === link.href ? "text-primary" : "text-ink"}`}
                            >
                                {link.label}
                                <ChevronRight aria-hidden="true" className="size-4 text-ink-muted" />
                            </Link>
                        </li>
                    ))}
                </ul>
                <div className="mt-4 flex flex-col gap-3">
                    <Link href={startHref} className="btn btn-primary min-h-12 rounded-xl shadow-none">
                        Mulai Jejakmu
                        <ArrowRight aria-hidden="true" className="size-4" />
                    </Link>
                    {!signedIn && (
                        <Link href="/login" className="btn btn-outline btn-neutral min-h-12 rounded-xl">
                            Masuk
                        </Link>
                    )}
                </div>
            </nav>
        </>
    );
}
