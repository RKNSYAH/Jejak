import type { Metadata } from "next";
import LandingPage from "./components/landing/LandingPage";

export const metadata: Metadata = {
  title: "Jejak | Cari tempat tinggal sesuai tujuanmu",
  description: "Cari area tinggal di sekitar kampus atau tempat kerjamu. Pertimbangkan perkiraan sewa dan akses perjalanan dengan Jejak.",
};

export default function Home() {
  return <LandingPage />;
}
