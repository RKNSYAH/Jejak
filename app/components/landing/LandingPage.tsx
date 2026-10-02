import Link from "next/link";
import { getAuthenticatedClaims } from "../../engine/controller/userServerController";
import Footer from "../Footer";
import Header from "../Header";
import ArrowRightIcon from "./ArrowRightIcon";
import HeroImageSlot from "./HeroImageSlot";

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
        <div className="flex min-h-[100dvh] flex-col bg-base-100 text-ink">
            <Header />
            <main className="mx-auto w-full max-w-[1200px] flex-1 px-3 py-10 sm:px-8 md:py-14 lg:px-6 lg:py-16">
                <section aria-labelledby="landing-title" className="hero" data-hci-region="landing-hero">
                    <div className="hero-content grid w-full max-w-none grid-cols-1 gap-6 p-0 text-left md:grid-cols-[9fr_11fr] md:gap-8 lg:gap-12">
                        <div className="min-w-0">
                            <h1 id="landing-title" className="text-[clamp(2rem,4vw,2.75rem)] font-bold leading-[1.12] tracking-tight">
                                <span className="block">Temukan tempat</span>
                                <span className="block pb-2">yang paling sesuai</span>
                                <span className="block text-primary">untuk hidup, belajar,</span>
                                <span className="block text-primary">dan bekerja.</span>
                            </h1>

                            <div className="mt-8" data-hci-region="landing-actions">
                                <Link
                                    href={startHref}
                                    className="btn btn-primary min-h-12 rounded-xl px-6 text-base shadow-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                                >
                                    Mulai Jejakmu
                                    <ArrowRightIcon aria-hidden="true" className="size-5" />
                                </Link>
                                {!claims && (
                                    <p className="mt-3 flex flex-wrap items-center gap-x-1 font-body text-sm text-ink-muted">
                                        Sudah punya akun?
                                        <Link
                                            href="/login"
                                            className="inline-flex min-h-11 items-center font-semibold text-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                                        >
                                            Masuk
                                        </Link>
                                    </p>
                                )}
                            </div>
                        </div>
                        <HeroImageSlot />
                    </div>
                </section>

                <section aria-label="Yang bisa kamu jelajahi" className="mt-10 md:mt-14" data-hci-region="landing-highlights">
                    <ul className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-0">
                        {highlights.map((highlight, index) => (
                            <li
                                key={highlight.title}
                                className={`min-w-0 ${index > 0 ? "border-t border-rule pt-6 md:border-t-0 md:border-l md:pt-0 md:pl-8" : ""} ${index < highlights.length - 1 ? "md:pr-8" : ""}`}
                            >
                                <h2 className="text-2xl font-bold leading-tight tracking-tight">{highlight.title}</h2>
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
