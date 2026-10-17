import type { Metadata } from "next";
import Link from "next/link";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { getAuthenticatedIdentity } from "../engine/controller/userServerController";
import { comparisonGroups, faqItems, plans, premiumDetails } from "./pricingContent";

export const metadata: Metadata = {
  title: "Harga | Jejak",
  description: "Mulai gratis, pilih Jejak Pass Rp29.900 per bulan, atau Jejak Lifetime Rp99.000 sekali bayar. Bandingkan fitur, rencana relokasi, dan kredit AI.",
};

const freeActionClass = "btn btn-outline min-h-12 rounded-xl border-ink text-ink hover:bg-ink hover:text-base-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary";

interface PremiumDetail {
  title: string;
  description: string;
}

export default async function PricingPage() {
  const identity = await getAuthenticatedIdentity();
  const freeHref = identity ? "/map" : "/login?mode=signup&next=%2Fmap";

  return (
    <div className="flex min-h-dvh flex-col bg-base-100 text-base-content">
      <Header activeHref="/pricing" />
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 pb-20 pt-10 font-body md:px-6 md:pt-14 lg:pb-28">
        <section aria-labelledby="pricing-heading" data-hci-region="pricing-plans">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-end lg:gap-12">
            <h1 id="pricing-heading" className="max-w-3xl font-sans text-[clamp(2.25rem,1.25rem+3vw,3.5rem)] font-bold leading-[1.08] tracking-tight text-ink">Pilih akses sesuai caramu merencanakan pindah.</h1>
            <p className="max-w-lg text-lg leading-relaxed text-ink-muted">Mulai dari mengenal area, lalu pilih akses yang kamu butuhkan untuk menimbang biaya, tujuan, dan rencana tinggalmu.</p>
          </div>

            <div className="mt-10 grid gap-5 md:grid-cols-3 lg:mt-12 lg:gap-6">
              {plans.map((plan) => (
                <article key={plan.id} aria-labelledby={`title-${plan.id}`} data-hci-region={`pricing-${plan.id}`} className={`card card-border min-w-0 rounded-2xl bg-base-100 ${plan.id === "jejak-pass" ? "border-primary ring-1 ring-primary" : "border-rule"}`}>
                  <div className="card-body min-w-0 gap-0 p-5 lg:p-7 [&_p]:grow-0">
                    <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm md:min-h-20 lg:min-h-12">
                      <p className={plan.id === "jejak-pass" ? "font-semibold text-primary" : "text-ink-muted"}>{plan.id === "gratis" ? "Mulai kenali pilihanmu" : plan.id === "jejak-pass" ? "Untuk rencana pindah terdekat" : "Untuk rencana jangka panjang"}</p>
                      {plan.id !== "gratis" && <span className="text-ink-muted">Segera hadir</span>}
                    </div>
                    <h2 id={`title-${plan.id}`} className="card-title mt-4 font-sans text-2xl font-bold text-ink">{plan.name}</h2>
                    <p className="mt-2 text-base leading-relaxed text-ink-muted md:min-h-28 lg:min-h-20">{plan.description}</p>
                    <div className="mt-7">
                      <div className="min-h-6 text-sm text-ink-muted">{plan.originalPrice && <p><span className="sr-only">Harga normal: </span><del>{plan.originalPrice}{plan.period}</del></p>}</div>
                      <p className="flex flex-wrap items-baseline gap-x-1 font-sans font-bold text-ink">
                        <span className="sr-only">{plan.originalPrice ? "Harga penawaran: " : "Harga: "}</span>
                        <span className="text-[clamp(2rem,1.25rem+1.6vw,2.75rem)] leading-tight tabular-nums">{plan.price}</span>
                        {plan.period && <span className="font-body text-base font-normal text-ink-muted">{plan.period}</span>}
                      </p>
                      <p className="mt-2 min-h-12 text-sm leading-relaxed text-ink-muted md:min-h-16 lg:min-h-12">{plan.billing}</p>
                    </div>
                    <div className="mt-5 border-t border-rule pt-5">
                      <h3 className="text-sm font-semibold">{plan.id === "gratis" ? "Termasuk dalam Free" : "Semua fitur premium"}</h3>
                      <ul className="mt-4 space-y-3 text-sm leading-relaxed">{plan.benefits.map((benefit) => <li key={benefit} className="flex gap-2.5"><span aria-hidden="true" className="font-semibold text-ink">✓</span><span>{benefit}</span></li>)}</ul>
                    </div>
                    <div className="mt-auto pt-7">{plan.id === "gratis" ? <Link href={freeHref} data-hci-region="pricing-start-free" className={`${freeActionClass} w-full`}>Mulai gratis</Link> : <button type="button" disabled data-hci-region={`pricing-${plan.id}-unavailable`} className="btn min-h-12 w-full rounded-xl disabled:border-rule disabled:bg-base-200 disabled:text-ink-muted disabled:opacity-100">Segera hadir</button>}</div>
                  </div>
                </article>
              ))}
            </div>
        </section>

        <section aria-labelledby="premium-heading" data-hci-region="pricing-premium-benefits" className="mt-20 grid gap-8 border-t-2 border-ink pt-7 lg:mt-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16">
          <div><h2 id="premium-heading" className="font-sans text-3xl font-bold leading-tight">Lebih banyak konteks sebelum kamu memilih area.</h2><p className="mt-4 leading-relaxed text-ink-muted">Jejak Pass dan Lifetime menawarkan fitur premium yang sama. Pilih masa akses dan jumlah kredit yang sesuai dengan kebutuhanmu.</p></div>
          <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2">{premiumDetails.map((detail: PremiumDetail) => <div key={detail.title}><dt className="font-sans text-xl font-bold leading-tight">{detail.title}</dt><dd className="mt-3 leading-relaxed text-ink-muted">{detail.description}</dd></div>)}</dl>
        </section>

        <section aria-labelledby="comparison-heading" data-hci-region="pricing-comparison" className="mt-20 lg:mt-24">
          <h2 id="comparison-heading" className="font-sans text-3xl font-bold">Bandingkan yang kamu dapatkan</h2>
          <p className="mt-3 max-w-2xl leading-relaxed text-ink-muted">Profil awal dan kecocokan dasar tersedia di semua paket. Akses premium menambah kedalaman analisis dan ruang untuk menyusun beberapa rencana.</p>
          <p className="mt-4 text-sm text-ink-muted md:hidden">Geser tabel untuk melihat semua paket.</p>
          <div role="region" aria-label="Perbandingan paket; geser untuk melihat kolom lainnya" tabIndex={0} className="mt-6 overflow-x-auto overscroll-x-contain border-t-2 border-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
            <table className="table min-w-[760px] table-fixed rounded-none text-sm">
              <caption className="sr-only">Perbandingan akses, fitur, rencana relokasi, dan kredit AI Jejak</caption>
              <thead><tr className="border-rule text-base text-ink"><th scope="col" className="w-[31%] py-5">Fitur</th>{plans.map((plan) => <th key={plan.id} scope="col" className={`py-5 font-sans text-lg ${plan.id === "jejak-pass" ? "bg-primary/5" : ""}`}>{plan.name}</th>)}</tr></thead>
              {comparisonGroups.map((group) => <tbody key={group.title}>
                <tr><th colSpan={4} scope="rowgroup" className="border-b border-rule pb-3 pt-7 font-semibold text-ink">{group.title}</th></tr>
                {group.rows.map((row) => <tr key={row.feature} className="border-rule"><th scope="row" className="py-4 font-normal leading-relaxed">{row.feature}</th>{plans.map((plan) => <td key={plan.id} className={`py-4 align-top leading-relaxed ${plan.id === "jejak-pass" ? "bg-primary/5" : ""}`}>{row.values[plan.id]}</td>)}</tr>)}
              </tbody>)}
            </table>
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-ink-muted">Periksa data ketika membandingkan kecamatan.</p>
        </section>

        <section aria-labelledby="daily-life-heading" data-hci-region="pricing-daily-life" className="mt-20 rounded-2xl bg-ink px-5 py-8 text-on-ink md:p-8 lg:mt-24 lg:p-10">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-center lg:gap-16">
            <h2 id="daily-life-heading" className="font-sans text-3xl font-bold leading-tight">Pertimbangkan keseharianmu di sana</h2>
            <p className="max-w-prose text-lg leading-relaxed text-on-ink-muted">
              Kos yang lebih murah bisa berarti perjalanan yang lebih panjang. Bandingkan biaya tinggal dan akses ke tujuanmu sebelum menentukan area yang kamu pilih.
            </p>
          </div>
        </section>

        <section aria-labelledby="faq-heading" data-hci-region="pricing-faq" className="mt-20 grid gap-8 lg:mt-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16">
          <h2 id="faq-heading" className="font-sans text-3xl font-bold leading-tight">Sebelum kamu<br className="hidden lg:block" /> memilih paket</h2>
          <div className="min-w-0 border-t-2 border-ink">{faqItems.map((item, index) => <details key={item.question} data-hci-region={`pricing-faq-${index + 1}`} className="group border-b border-rule"><summary className="cursor-pointer py-5 pr-2 text-base font-semibold leading-relaxed marker:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{item.question}</summary><p className="max-w-prose pb-6 leading-relaxed text-ink-muted">{item.answer}</p></details>)}</div>
        </section>

        <section aria-labelledby="start-heading" data-hci-region="pricing-start" className="mt-20 flex flex-col items-start gap-6 border-t-2 border-ink pt-8 sm:flex-row sm:items-center sm:justify-between lg:mt-24">
          <div><h2 id="start-heading" className="font-sans text-2xl font-bold md:text-3xl">Mulai dari rencana pertamamu.</h2><p className="mt-2 leading-relaxed text-ink-muted">Buat profil gratis dan kenali area yang cocok untuk kebutuhanmu.</p></div>
          <Link href={freeHref} data-hci-region="pricing-bottom-start-free" className={`${freeActionClass} w-full shrink-0 sm:w-auto`}>Mulai gratis</Link>
        </section>
      </main>
      <Footer />
    </div>
  );
}
