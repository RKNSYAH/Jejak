import Link from "next/link";
import { getAuthenticatedClaims } from "../engine/controller/userServerController";
import BrandLogo from "./BrandLogo";
import MobileMenu from "./MobileMenu";

export default async function Header({ activeHref = "/", overlay = false }: { activeHref?: string; overlay?: boolean }) {
  const claims = await getAuthenticatedClaims();
  const startHref = claims ? "/map" : "/login";
  const links = [
    { href: "/", label: "Fitur" },
    { href: "/how", label: "Cara Kerja" },
    { href: "/pricing", label: "Harga" },
    { href: "/about", label: "Tentang" },
  ];

  return (
    <header className={`navbar top-0 z-50 gap-x-4 px-4 font-body sm:gap-x-6 md:px-6 ${overlay ? "absolute inset-x-0 mx-auto max-w-[1200px] text-on-ink sm:px-8 lg:px-6" : "sticky border-b border-rule bg-base-100"}`}>
      <BrandLogo border={false} inverse={overlay} />
      <nav aria-label="Navigasi utama" className="hidden min-w-0 md:block">
        <ul className="flex items-center gap-6 text-sm">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={activeHref === link.href ? "page" : undefined}
                className={`inline-flex min-h-11 items-center border-b-2 px-1 focus-visible:outline-2 focus-visible:outline-offset-2 ${overlay ? "focus-visible:outline-on-ink" : "focus-visible:outline-primary"} ${activeHref !== link.href ? "border-transparent " + (overlay ? "text-on-ink hover:border-on-ink-muted" : "text-ink hover:text-primary")
                  : overlay ? "border-on-ink font-semibold text-on-ink" : "border-primary font-semibold text-primary"}`}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <Link href={startHref} className="btn btn-primary ml-auto hidden min-h-11 rounded-lg md:inline-flex">
        Mulai Jejakmu
      </Link>
      <div className={`ml-auto flex items-center gap-1 md:hidden ${overlay ? "[&>.btn]:text-on-ink" : ""}`}>
        {!claims && (
          <Link href="/login" className={`inline-flex min-h-11 items-center px-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${overlay ? "text-on-ink" : "text-ink"}`}>
            Masuk
          </Link>
        )}
        <MobileMenu links={links} activeHref={activeHref} startHref={startHref} signedIn={!!claims} />
      </div>
    </header>
  );
}
