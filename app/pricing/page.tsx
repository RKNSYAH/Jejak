import type { Metadata } from "next";
import Link from "next/link";
import Header from "../components/Header";

export const metadata: Metadata = {
  title: "Harga | Jejak",
  description: "Lihat struktur paket Jejak. Rincian harga dan manfaat sedang disiapkan.",
};

type PlanId = "gratis" | "plus" | "pass";

type Plan = {
  id: PlanId;
  name: string;
  price: string;
  term: string;
  benefits: string[];
};

// Isi harga, masa akses, dan daftar manfaat di sini saat model paket ditetapkan.
const plans: Plan[] = [
  { id: "gratis", name: "Gratis", price: "Rp0", term: "", benefits: [] },
  { id: "plus", name: "Plus", price: "Rp49.000", term: "/ bulan", benefits: [] },
  { id: "pass", name: "Pass Pindah", price: "", term: "", benefits: [] },
];

type ComparisonGroup = {
  title: string;
  rows: { feature: string; values: Record<PlanId, string> }[];
};

// Tambahkan grup dan baris saat fitur tiap paket sudah diputuskan.
const comparisonGroups: ComparisonGroup[] = [];
const faqItems: { question: string; answer: string }[] = [];

export default function PricingPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-base-100 text-base-content">
      <Header activeHref="/pricing" />

      <main className="mx-auto w-full max-w-344 flex-1 px-2 pb-28 pt-8 font-body md:px-4 md:pt-6 lg:px-6">
        <section aria-labelledby="pricing-heading" data-hci-region="pricing-plans">
          <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] md:items-end">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-primary">Harga</p>
              <h1 id="pricing-heading" className="max-w-xl font-sans text-4xl font-bold leading-tight text-ink md:text-5xl">
                Pilih akses sesuai caramu merencanakan pindah.
              </h1>
            </div>
            <p className="max-w-sm text-base leading-relaxed text-ink-muted md:justify-self-end">
              Jelajahi Jejak sekarang. Rincian paket, manfaat, dan masa akses akan diumumkan setelah model harga ditetapkan.
            </p>
          </div>

          <div className="mt-10 grid gap-16 md:grid-cols-3">
            {plans.map((plan) => (
              <article
                key={plan.id}
                data-hci-region={`pricing-${plan.id}`}
                className="card card-border min-w-0 rounded-xl border-rule bg-base-100 shadow-none"
              >
                <div className="card-body gap-0 p-6 lg:p-7">
                  <h2 className="card-title font-sans text-xl text-ink">{plan.name}</h2>
                  <p className="mt-2 min-h-12 text-sm leading-relaxed text-ink-muted">
                    Rincian paket akan tersedia setelah model harga ditetapkan.
                  </p>

                  <div className="mt-6 min-h-24">
                    <p className="font-sans text-3xl font-bold text-ink">
                      {plan.price || "Harga belum ditentukan"}
                      <span className="mt-1 ml-2 text-sm font-medium text-ink-muted">
                        {plan.term}
                      </span>
                    </p>
                    {plan.id === "gratis" && (
                      <p className="mt-2 text-sm text-ink-muted">
                        Akses selamanya
                      </p>
                    )}
                  </div>

                  <button className="btn btn-outline btn-block min-h-11 border-ink text-ink" type="button">
                    Pilih {plan.name}
                  </button>

                  <div className="mt-6 border-t border-rule pt-5">
                    <h3 className="text-sm font-semibold text-ink">Termasuk</h3>
                    {plan.benefits.length > 0 ? (
                      <ul className="mt-4 space-y-3 text-sm leading-relaxed">
                        {plan.benefits.map((benefit) => (
                          <li key={benefit} className="flex gap-3">
                            <span aria-hidden="true" className="font-bold text-primary">✓</span>
                            <span>{benefit}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-4 text-sm text-ink-muted">Rincian manfaat menyusul.</p>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div role="note" className="alert mt-5 rounded-lg border-0 bg-primary-tint text-sm text-ink">
            <span aria-hidden="true" className="font-bold text-primary">ⓘ</span>
            <p>Harga dan manfaat di halaman ini belum ditetapkan. Belum ada paket berbayar yang dapat dipilih.</p>
          </div>
        </section>

        <section aria-labelledby="comparison-heading" data-hci-region="pricing-comparison" className="mt-24">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-primary">Perbandingan</p>
          <h2 id="comparison-heading" className="font-sans text-3xl font-bold text-ink">
            Semua detail dalam satu tabel
          </h2>
          <div className="mt-6 overflow-x-auto border-t-2 border-ink">
            <table className="table min-w-[640px] rounded-none text-sm">
              <thead>
                <tr className="text-ink">
                  <th scope="col" className="w-2/5">Fitur</th>
                  {plans.map((plan) => (
                    <th key={plan.id} scope="col">{plan.name}</th>
                  ))}
                </tr>
              </thead>
              {comparisonGroups.length > 0 ? (
                comparisonGroups.map((group) => (
                  <tbody key={group.title}>
                    <tr><th colSpan={plans.length + 1} scope="rowgroup" className="pt-6 text-xs uppercase tracking-widest text-ink-muted">{group.title}</th></tr>
                    {group.rows.map((row) => (
                      <tr key={row.feature}>
                        <th scope="row" className="font-normal">{row.feature}</th>
                        {plans.map((plan) => (
                          <td key={plan.id}>{row.values[plan.id] || "Belum ditentukan"}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                ))
              ) : (
                <tbody>
                  <tr>
                    <td colSpan={plans.length + 1} className="py-8 text-ink-muted">
                      Detail perbandingan akan ditambahkan setelah manfaat tiap paket ditetapkan.
                    </td>
                  </tr>
                </tbody>
              )}
            </table>
          </div>
        </section>

        <section aria-labelledby="institutions-heading" data-hci-region="pricing-institutions" className="mt-20 rounded-xl border border-rule p-6 md:p-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-primary">Untuk institusi</p>
          <h2 id="institutions-heading" className="font-sans text-2xl font-bold text-ink md:text-3xl">
            Kampus, perusahaan, dan platform hunian
          </h2>
          <p className="mt-3 max-w-2xl leading-relaxed text-ink-muted">
            Informasi kerja sama untuk institusi akan tersedia setelah cakupan layanan ditetapkan.
          </p>
        </section>

        <section aria-labelledby="faq-heading" data-hci-region="pricing-faq" className="mt-24">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-primary">Pertanyaan umum</p>
          <h2 id="faq-heading" className="font-sans text-3xl font-bold text-ink">
            Sebelum kamu memilih paket
          </h2>
          {faqItems.length > 0 ? (
            <div className="mt-7 grid gap-7 md:grid-cols-3">
              {faqItems.map((item) => (
                <div key={item.question} className="border-t-2 border-ink pt-4">
                  <h3 className="font-sans font-bold text-ink">{item.question}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">{item.answer}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-7 max-w-2xl border-t-2 border-ink pt-4 text-ink-muted">
              Jawaban tentang paket, pembayaran, dan masa akses akan ditambahkan saat model harga sudah diputuskan.
            </p>
          )}
        </section>
      </main>

      <footer className="border-t border-rule py-6 font-body text-sm">
        <div className="mx-auto flex w-full max-w-344 items-center gap-4 px-2 md:px-4 lg:px-6">
          <Link href="/" className="font-sans text-lg font-bold text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
            jejak<span className="text-primary"> |</span>
          </Link>
          <span className="text-ink-muted">© {new Date().getFullYear()} Jejak</span>
        </div>
      </footer>
    </div>
  );
}
