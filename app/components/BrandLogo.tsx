import Image from "next/image";
import Link from "next/link";

export default function BrandLogo({ large = false, border = true }: { large?: boolean; border?: boolean }) {
  return (
    <Link
      href="/"
      data-hci-region="brand-logo"
      className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-2xl bg-base-100 font-sans font-bold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${border ? "border border-rule shadow-overlay" : "border-0 shadow-none"} ${large ? "px-4 py-2 text-xl tracking-[0.12em] md:text-2xl" : "px-3 py-1 text-lg tracking-[0.1em]"}`}
    >
      <Image
        src="/Jejak-logo.png"
        width={large ? 48 : 36}
        height={large ? 48 : 36}
        alt=""
        className={large ? "size-10 md:size-12" : "size-9"}
      />
      <span>JEJAK</span>
    </Link>
  );
}
