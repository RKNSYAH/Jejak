import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Syarat Layanan | Jejak",
  description: "Ringkasan syarat penggunaan layanan Jejak.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 text-ink md:px-6">
      <h1 className="font-sans text-3xl font-bold">Syarat Layanan Jejak</h1>
      <p className="mt-4 text-sm leading-relaxed text-ink-muted">
        Dengan membuat akun atau menggunakan Jejak, kamu setuju menggunakan layanan secara wajar, tidak menyalahgunakan sistem, dan menjaga keamanan akses akunmu.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-ink-muted">
        Jejak dapat memperbarui fitur, konten, dan ketentuan layanan dari waktu ke waktu untuk meningkatkan kualitas layanan dan mematuhi peraturan yang berlaku.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-ink-muted">
        Jika kamu tidak menyetujui ketentuan ini, kamu dapat menghentikan penggunaan layanan kapan saja.
      </p>
    </main>
  );
}
