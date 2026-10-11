import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kebijakan Privasi | Jejak",
  description: "Informasi cara Jejak mengelola data pribadimu.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 text-ink md:px-6">
      <h1 className="font-sans text-3xl font-bold">Kebijakan Privasi Jejak</h1>
      <p className="mt-4 text-sm leading-relaxed text-ink-muted">
        Jejak melindungi data pribadimu dan menggunakannya hanya untuk menyediakan layanan, meningkatkan pengalaman penggunaan, dan memenuhi kewajiban hukum.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-ink-muted">
        Dengan menggunakan Jejak, kamu menyetujui pemrosesan data yang diperlukan untuk autentikasi akun, personalisasi rekomendasi, dan analisis penggunaan secara terbatas.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-ink-muted">
        Untuk pertanyaan terkait privasi, hubungi kami di{" "}
        <a href="mailto:dukungan@jejak.id" className="font-semibold text-primary underline">
          dukungan@jejak.id
        </a>.
      </p>
    </main>
  );
}
