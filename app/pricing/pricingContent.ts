export type PlanId = "gratis" | "jejak-pass" | "jejak-lifetime";

export type PricingPlan = {
  id: PlanId;
  name: string;
  description: string;
  price: string;
  originalPrice?: string;
  period: string;
  billing: string;
  access: string;
  credits: string;
  creditDetail: string;
  planLimit: string;
  benefits: string[];
};

const premiumBenefits = [
  "Peta dan informasi kecamatan lebih mendalam",
  "Informasi biaya hidup, kampus, dan pekerjaan",
  "Penjelasan personal dan pembaruan preferensi lewat AI",
  "Simpan rencana dan ekspor laporan",
  "Pembaruan fitur premium",
];

export const plans: PricingPlan[] = [
  {
    id: "gratis", name: "Free",
    description: "Kenali area pilihanmu dan mulai susun rencana pindah pertamamu.",
    price: "Rp0", period: "", billing: "Gratis selamanya", access: "Selamanya",
    credits: "5 kredit", creditDetail: "Sekali untuk setiap akun, tanpa kedaluwarsa.", planLimit: "1 rencana",
    benefits: ["Peta interaktif dan informasi wilayah dasar", "1 profil dan rencana relokasi personal", "Kecocokan dasar sesuai profilmu", "Pembuatan profil awal gratis", "5 kredit AI untuk percakapan terbatas"],
  },
  {
    id: "jejak-pass", name: "Jejak Pass",
    description: "Untuk kamu yang sedang aktif menimbang area dan menyiapkan kepindahan.",
    price: "Rp29.900", originalPrice: "Rp39.900", period: "/bulan",
    billing: "Bulanan, diperpanjang otomatis", access: "Selama berlangganan",
    credits: "50 kredit/bulan", creditDetail: "Diperbarui setiap bulan tagihan. Sisa kredit tidak diakumulasi.",
    planLimit: "Tanpa batas selama berlangganan",
    benefits: [...premiumBenefits, "Rencana relokasi tanpa batas selama berlangganan", "50 kredit AI setiap bulan tagihan"],
  },
  {
    id: "jejak-lifetime", name: "Jejak Lifetime",
    description: "Untuk rencana pindah sekarang dan keputusan tempat tinggalmu di masa depan.",
    price: "Rp99.000", originalPrice: "Rp129.900", period: "",
    billing: "Sekali bayar, akses selamanya", access: "Selamanya",
    credits: "200 kredit total", creditDetail: "Sekali diberikan, tanpa kedaluwarsa dan tanpa isi ulang bulanan.",
    planLimit: "Tanpa batas",
    benefits: [...premiumBenefits, "Rencana relokasi tanpa batas", "200 kredit AI total tanpa kedaluwarsa"],
  },
];

type ComparisonRow = { feature: string; values: Record<PlanId, string> };
type ComparisonGroup = { title: string; rows: ComparisonRow[] };

function planValues(field: "access" | "billing" | "credits" | "planLimit"): Record<PlanId, string> {
  return Object.fromEntries(plans.map((plan) => [plan.id, plan[field]])) as Record<PlanId, string>;
}

function featureValues(free: string, premium: string): Record<PlanId, string> {
  return { gratis: free, "jejak-pass": premium, "jejak-lifetime": premium };
}

export const comparisonGroups: ComparisonGroup[] = [
  { title: "Akses dan pembayaran", rows: [
    { feature: "Masa akses", values: planValues("access") },
    { feature: "Pembayaran", values: planValues("billing") },
  ] },
  { title: "Eksplorasi dan personalisasi", rows: [
    { feature: "Peta dan informasi kecamatan", values: featureValues("Dasar", "Lebih mendalam") },
    { feature: "Informasi biaya hidup, kampus, dan pekerjaan", values: featureValues("Ringkasan dasar", "Detail sesuai ketersediaan data") },
    { feature: "Pembuatan profil awal", values: featureValues("Gratis, tanpa kredit", "Gratis, tanpa kredit") },
    { feature: "Kecocokan sesuai profil", values: featureValues("Kecocokan dasar", "Kecocokan dan penjelasan mendalam") },
    { feature: "Chat AI dan pembaruan preferensi", values: featureValues("Terbatas pada 5 kredit", "Sesuai saldo kredit") },
  ] },
  { title: "Rencana dan laporan", rows: [
    { feature: "Rencana relokasi", values: planValues("planLimit") },
    { feature: "Simpan beberapa rencana", values: featureValues("Tidak termasuk", "Termasuk") },
    { feature: "Ekspor laporan", values: featureValues("Tidak termasuk", "Termasuk") },
    { feature: "Pembaruan fitur premium", values: featureValues("Tidak termasuk", "Termasuk selama masa akses") },
  ] },
  { title: "Kredit AI", rows: [
    { feature: "Kredit yang termasuk", values: planValues("credits") },
    { feature: "Pembaruan kuota", values: { gratis: "Sekali per akun", "jejak-pass": "Setiap bulan, tidak akumulasi", "jejak-lifetime": "Sekali, 200 kredit total" } },
  ] },
];

export const premiumDetails = [
  { title: "Hitung biaya tinggal dengan konteks", description: "Pertimbangkan sewa bersama kebutuhan harian dan transportasi, supaya pilihan area tetap sesuai anggaranmu." },
  { title: "Dekat dengan tujuan sehari-hari", description: "Lihat informasi kampus, pekerjaan, dan akses perjalanan untuk menimbang area di sekitar tujuanmu." },
  { title: "Sesuaikan rencana lewat percakapan", description: "Minta penjelasan kecocokan area, ubah preferensi, atau telusuri informasi tambahan melalui chat AI." },
  { title: "Simpan hasil pertimbanganmu", description: "Susun beberapa skenario pindah, simpan rencananya, dan ekspor laporan untuk kamu tinjau kembali." },
];

export const faqItems = [
  { question: "Apa bedanya Jejak Pass dan Jejak Lifetime?", answer: "Keduanya menawarkan fitur premium. Jejak Pass adalah langganan Rp29.900 per bulan yang diperpanjang otomatis, dengan 50 kredit setiap bulan tagihan. Jejak Lifetime dibayar sekali Rp99.000 untuk akses premium selamanya, dengan 200 kredit total yang tidak diperbarui bulanan." },
  { question: "Apakah Jejak Pass diperpanjang otomatis?", answer: "Ya. Jejak Pass adalah langganan bulanan dengan pembayaran otomatis setiap bulan. Jejak Lifetime hanya dibayar sekali. Paket berbayar belum dapat dibeli saat ini." },
  { question: "Apakah membuat profil awal memakai kredit?", answer: "Tidak. Kamu bisa membuat profil awal gratis, termasuk dengan akun Free." },
  { question: "Kapan satu kredit AI terpakai?", answer: "Setiap balasan chat memakai satu kredit." },
  { question: "Apakah kredit diperbarui setiap bulan?", answer: "Hanya Jejak Pass yang mendapat 50 kredit baru setiap bulan tagihan. Kredit sebelumnya yang tersisa tidak diakumulasi. Free mendapat 5 kredit sekali per akun, sedangkan Lifetime mendapat 200 kredit total. Kredit Free dan Lifetime tidak kedaluwarsa." },
  { question: "Apa yang terjadi kalau kredit AI habis?", answer: "Chat AI membutuhkan saldo kredit. Kamu tetap bisa menggunakan peta, filter manual, dan fitur non-chat yang termasuk dalam paketmu. Kuota Pass diperbarui pada bulan tagihan berikutnya. Akses premium Lifetime tetap berlaku meskipun 200 kreditnya sudah habis." },
  { question: "Apakah rencana tanpa batas berarti chat AI tanpa batas?", answer: "Tidak. Rencana tanpa batas mengacu pada jumlah rencana relokasi yang dapat kamu susun selama masa akses premium. Percakapan AI tetap mengikuti saldo kredit paketmu." },
  { question: "Apakah semua area memiliki informasi yang sama lengkapnya?", answer: "Detail biaya hidup, kampus, pekerjaan, dan akses perjalanan mengikuti ketersediaan data di tiap area. Paket premium tidak menjamin setiap kecamatan memiliki informasi yang sama lengkapnya. Periksa sumber dan periode data saat menimbang pilihanmu." },
  { question: "Kapan paket berbayar bisa dibeli?", answer: "Jejak Pass dan Jejak Lifetime segera hadir. Pembelian belum dibuka. Sambil menunggu, kamu bisa membuat akun Free dan mulai menyusun profil relokasimu." },
];
