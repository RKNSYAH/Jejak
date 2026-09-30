import Link from "next/link";
import { getAuthenticatedClaims } from "../engine/controller/userServerController";
import BrandLogo from "./BrandLogo";

export default async function Header({ activeHref = "/" }: { activeHref?: string }) {
  const claims = await getAuthenticatedClaims();
  const links = [
    { href: "/", label: "Fitur" },
    { href: "/how", label: "Cara Kerja" },
    { href: "/pricing", label: "Harga" },
    { href: "/about", label: "Tentang" },
  ];

  return (
    <header className="navbar sticky top-0 z-50 flex-wrap gap-x-4 border-b border-rule bg-base-100 px-4 font-body sm:gap-x-6 md:px-6">
      <BrandLogo border={false} />
      <nav aria-label="Navigasi utama" className="order-3 w-full min-w-0 overflow-x-auto overscroll-x-contain lg:order-0 lg:w-auto">
        <ul className="flex min-w-max items-center gap-5 text-sm sm:gap-6">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={activeHref === link.href ? "page" : undefined}
                className={`inline-flex min-h-11 items-center border-b-2 px-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${activeHref === link.href ? "border-primary font-semibold text-primary" : "border-transparent text-ink hover:text-primary"}`}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <Link href={claims ? "/map" : "/login"} className="btn btn-primary ml-auto min-h-11 rounded-lg">
        Mulai Jejakmu
      </Link>
    </header>
  );
}
