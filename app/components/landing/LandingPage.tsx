import Image from "next/image";
import Link from "next/link";
import { getAuthenticatedClaims } from "../../engine/controller/userServerController";
import Footer from "../Footer";
import Header from "../Header";
import ArrowRightIcon from "./ArrowRightIcon";

const highlights = [
    {
        title: "Bandingkan kota",
        label: "Pilihan tempat tinggal",
        description: "Temukan kota yang sesuai dengan rencanamu.",
    },
    {
        title: "Lihat faktor penting",
        label: "Kebutuhan sehari-hari",
        description: "Pekerjaan, kampus, hunian, transportasi, dan biaya hidup.",
    },
    {
        title: "1 peta untuk rencanamu",
        label: "Keputusan relokasi",
        description: "Dari gambaran kota hingga detail kecamatan.",
    },
];

export default async function LandingPage() {
    const claims = await getAuthenticatedClaims();
    const startHref = claims ? "/map" : "/login";

    return (
        <div className="relative flex min-h-[100dvh] flex-col bg-base-100 text-ink">
            <Header overlay />
            <main className="flex-1">
                <section aria-labelledby="landing-title" className="relative isolate bg-ink text-on-ink" data-hci-region="landing-hero">
                    <div aria-hidden="true" data-hci-region="landing-image" className="absolute inset-0 -z-10 overflow-hidden">
                        <Image src="/hero.jpg" alt="" fill sizes="100vw" className="object-cover" priority />
                        <div className="absolute inset-0 bg-linear-to-r from-ink/90 via-ink/75 to-ink/35" />
                    </div>
                    <div className="mx-auto w-full max-w-[1200px] px-4 pb-24 pt-28 sm:px-8 md:pb-28 md:pt-36 lg:px-6">
                        <h1 id="landing-title" className="max-w-[15ch] text-[clamp(2.25rem,5vw,3.5rem)] font-bold leading-[1.12] tracking-tight">
                            Temukan tempat yang paling sesuai <span className="text-accent">untuk hidup, belajar, dan bekerja.</span>
                        </h1>

                        <div className="mt-8 flex flex-col gap-3 md:mt-10 md:flex-row md:items-center md:gap-6" data-hci-region="landing-actions">
                            <Link
                                href={startHref}
                                className="btn min-h-12 w-full rounded-xl border-0 bg-base-100 px-6 text-base text-ink shadow-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-on-ink md:w-auto"
                            >
                                Mulai Jejakmu
                                <ArrowRightIcon aria-hidden="true" className="size-5" />
                            </Link>
                            {!claims && (
                                <p className="flex flex-wrap items-center justify-center gap-x-1 font-body text-sm text-on-ink md:justify-start">
                                    Sudah punya akun?
                                    <Link
                                        href="/login"
                                        className="inline-flex min-h-11 items-center font-semibold text-on-ink underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-on-ink"
                                    >
                                        Masuk
                                    </Link>
                                </p>
                            )}
                        </div>
                        <p className="mt-10 text-right font-body text-xs text-on-ink-muted">Jl. Jenderal Sudirman, Jakarta</p>
                    </div>
                </section>

                <section aria-label="Yang bisa kamu jelajahi" className="relative mx-auto -mt-12 mb-12 w-full max-w-[1200px] px-4 sm:px-8 md:mb-16 lg:px-6" data-hci-region="landing-highlights">
                    <ul className="grid grid-cols-1 gap-5 rounded-2xl border border-rule bg-base-100 p-6 shadow-overlay md:grid-cols-3 md:gap-0 md:p-8">
                        {highlights.map((highlight, index) => (
                            <li
                                key={highlight.title}
                                className={`min-w-0 ${index > 0 ? "border-t border-rule pt-5 md:border-t-0 md:border-l md:pt-0 md:pl-8" : ""} ${index < highlights.length - 1 ? "md:pr-8" : ""}`}
                            >
                                <h2 className="text-lg font-bold md:text-2xl leading-tight tracking-tight">{highlight.title}</h2>
                                <p className="mt-2 font-body text-sm font-semibold text-ink-muted">{highlight.label}</p>
                                <p className="mt-1 max-w-[36ch] font-body text-sm leading-relaxed text-ink-muted">{highlight.description}</p>
                            </li>
                        ))}
                    </ul>
                </section>
            </main>
            <Footer />
        </div>
    );
}
