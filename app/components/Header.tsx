import Link from "next/link";

export default function Header({ activeHref = "/" }: { activeHref?: string }) {
  const links = [
    { href: "/", label: "Fitur" },
    { href: "/how", label: "Cara Kerja" },
    { href: "/pricing", label: "Harga" },
    { href: "/about", label: "Tentang" },
  ];

  return (
    <header className="navbar sticky top-0 z-50 flex-wrap gap-x-8 border-b border-rule bg-base-100 px-2 font-body sm:flex-nowrap md:px-4 lg:px-6">
      <Link href="/" className="font-sans text-xl font-bold text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
        jejak<span className="text-primary"> |</span>
      </Link>
      <nav aria-label="Navigasi utama" className="order-3 w-full overflow-x-auto sm:order-0 sm:w-auto">
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
      <Link href="/map" className="btn btn-primary ml-auto min-h-11 rounded-lg">
        Mulai Jejakmu
      </Link>
    </header>
  );
}
