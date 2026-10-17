import Image from "next/image";
import Link from "next/link";
import { getAuthenticatedIdentity } from "../../engine/controller/userServerController";
import Footer from "../Footer";
import Header from "../Header";
import ArrowRightIcon from "./ArrowRightIcon";

const contentWidth = "mx-auto w-full max-w-[1440px] px-4 sm:px-8 lg:px-6";
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary";

export default async function LandingPage() {
    const identity = await getAuthenticatedIdentity();
    const startHref = identity ? "/map" : "/login";

    return (
        <div className="relative flex min-h-dvh flex-col bg-base-100 text-ink">
            <Header overlay />
            <main className="flex-1 font-body">
                <section aria-labelledby="landing-title" className="relative isolate bg-ink text-on-ink" data-hci-region="landing-hero">
                    <div aria-hidden="true" data-hci-region="landing-image" className="absolute inset-0 -z-10 overflow-hidden">
                        <Image src="/hero.jpg" alt="" fill sizes="100vw" className="object-cover" preload />
                        <div className="absolute inset-0 bg-linear-to-r from-ink/95 via-ink/80 to-ink/35" />
                    </div>
                    <div className={`${contentWidth} pb-16 pt-28 sm:pb-20 md:pb-24 md:pt-36 lg:pb-28`}>
                        <h1 id="landing-title" className="max-w-[18ch] font-sans text-[clamp(2.5rem,1.5rem+3vw,4rem)] font-bold leading-[1.08] tracking-tight">
                            Cari tempat tinggal yang cocok dengan <span className="text-accent">tujuanmu.</span>
                        </h1>
                        <p className="mt-6 max-w-[47ch] text-lg leading-relaxed text-on-ink">
                            Mulai dari kampus atau tempat kerja yang kamu tuju. Lihat perkiraan biaya tinggal dan perjalanan dari area di sekitarnya.
                        </p>
                        <div className="mt-8 flex flex-col items-start gap-3 md:mt-10 md:flex-row md:items-center md:gap-6" data-hci-region="landing-actions">
                            <Link
                                href={startHref}
                                data-hci-region="landing-hero-start"
                                className="btn min-h-12 w-full rounded-xl border-0 bg-base-100 px-6 text-base text-ink shadow-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-on-ink sm:w-auto"
                            >
                                Mulai Jejakmu
                                <ArrowRightIcon aria-hidden="true" className="size-5" />
                            </Link>
                            {!identity && (
                                <p className="flex flex-wrap items-center gap-x-1 text-sm">
                                    Sudah punya akun?
                                    <Link href="/login" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-on-ink">Masuk</Link>
                                </p>
                            )}
                        </div>
                    </div>
                </section>

                <div className={contentWidth}>
                    <section aria-labelledby="walkthrough-title" data-hci-region="landing-walkthrough" className="pt-14 md:pt-20">
                        <div className="max-w-3xl">
                            <h2 id="walkthrough-title" className="font-sans text-[clamp(1.75rem,1.25rem+1.5vw,2.5rem)] font-bold leading-tight tracking-tight">Sudah tahu akan kerja di mana?</h2>
                            <p className="mt-4 max-w-[65ch] text-lg leading-relaxed text-ink-muted">Cari area tinggal di sekitar tujuanmu, lalu lihat apakah perkiraan sewanya masih sesuai anggaran.</p>
                        </div>
                        <figure className="mt-8 min-w-0 md:mt-10">
                            <div className="overflow-hidden rounded-xl border border-rule bg-base-200">
                                <picture>
                                    <source media="(max-width: 767px)" srcSet="/landing/map-mobile.jpg" />
                                    <Image
                                        src="/landing/map-workspace.png"
                                        alt="Tampilan peta Jejak dengan kecamatan Setiabudi dipilih dan panel Hunian terbuka."
                                        width={1917}
                                        height={947}
                                        sizes="(max-width: 767px) 100vw, (max-width: 1440px) calc(100vw - 48px), 1392px"
                                        className="aspect-[3/5] h-auto w-full object-cover md:aspect-auto"
                                        loading="lazy"
                                        unoptimized
                                    />
                                </picture>
                            </div>
                        </figure>
                    </section>

                    <section aria-labelledby="tradeoff-title" data-hci-region="landing-tradeoff" className="mt-16 grid gap-8 border-t border-rule pt-8 md:mt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)] lg:items-start lg:gap-12 lg:pt-10">
                        <div>
                            <h2 id="tradeoff-title" className="max-w-[20ch] font-sans text-[clamp(1.75rem,1.25rem+1.5vw,2.5rem)] font-bold leading-tight tracking-tight">Lebih dekat kantor atau lebih ringan sewanya?</h2>
                            <p className="mt-4 max-w-prose text-lg leading-relaxed text-ink-muted">Bandingkan perkiraan pengeluaran dan perjalanan sebelum menentukan pilihan.</p>
                            <p className="mt-5 max-w-prose leading-relaxed text-ink-muted">Untuk tujuan kerja di kawasan Kuningan, kamu bisa mulai meninjau Setiabudi dan Tebet. Buka rincian tiap area untuk melihat informasi yang tersedia.</p>
                        </div>
                        <div className="grid min-w-0 gap-7 sm:grid-cols-2 sm:gap-5">
                            <figure className="min-w-0">
                                <div className="overflow-hidden rounded-xl border border-rule">
                                    <Image src="/landing/setiabudi-detail.png" alt="Panel Hunian Setiabudi di Jejak, menampilkan rata-rata sewa bulanan Rp3.250.000." width={390} height={330} sizes="(max-width: 639px) calc(100vw - 32px), (max-width: 1023px) 45vw, 400px" className="h-auto w-full" loading="lazy" unoptimized />
                                </div>
                                <figcaption className="mt-3 text-sm text-ink-muted">Setiabudi · Informasi hunian</figcaption>
                            </figure>
                            <figure className="min-w-0">
                                <div className="overflow-hidden rounded-xl border border-rule">
                                    <Image src="/landing/tebet-detail.png" alt="Panel Hunian Tebet di Jejak, menampilkan rata-rata sewa bulanan Rp1.500.000." width={390} height={330} sizes="(max-width: 639px) calc(100vw - 32px), (max-width: 1023px) 45vw, 400px" className="h-auto w-full" loading="lazy" unoptimized />
                                </div>
                                <figcaption className="mt-3 text-sm text-ink-muted">Tebet · Informasi hunian</figcaption>
                            </figure>
                        </div>
                    </section>

                    <section aria-labelledby="sources-title" data-hci-region="landing-sourcing" className="mt-16 grid gap-4 border-t border-rule py-8 md:mt-20 md:py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)] lg:gap-12">
                        <h2 id="sources-title" className="max-w-sm font-sans text-2xl font-bold leading-tight md:text-3xl">Informasi dari sumber yang jelas</h2>
                        <p className="max-w-[65ch] text-lg leading-relaxed text-ink-muted">Kami menggabungkan statistik resmi dengan informasi hunian dan mobilitas dari sumber yang dapat ditelusuri untuk membantu kamu menilai pilihan tempat tinggal.</p>
                    </section>

                    <section aria-labelledby="landing-start-title" data-hci-region="landing-start" className="flex flex-col items-start gap-6 border-t border-rule py-10 sm:flex-row sm:items-center sm:justify-between md:pb-16">
                        <div>
                            <h2 id="landing-start-title" className="font-sans text-2xl font-bold leading-tight md:text-3xl">Mulai dengan tujuan pindahmu.</h2>
                            <p className="mt-3 max-w-prose leading-relaxed text-ink-muted">Buat profil gratis untuk mencari area sesuai kebutuhanmu.</p>
                        </div>
                        <div className="flex w-full shrink-0 flex-col items-start gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-6">
                            <Link href={startHref} data-hci-region="landing-bottom-start" className={`btn btn-primary min-h-12 w-full rounded-xl px-6 sm:w-auto ${focusRing}`}>Mulai Jejakmu</Link>
                            <Link href="/pricing" data-hci-region="landing-pricing" className={`inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4 ${focusRing}`}>Lihat paket</Link>
                        </div>
                    </section>
                </div>
            </main>
            <Footer />
        </div>
    );
}
