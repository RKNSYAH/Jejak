import type { Metadata } from "next";
import { connection } from "next/server";
import "./globals.css";
import { urbanist, sourceSans3 } from "./fonts";
import { Analytics } from "@vercel/analytics/next";

const title = "Jejak";
const description = "Jelajahi kecamatan di Indonesia lewat peta data pekerjaan, pendidikan, hunian, dan mobilitas.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, siteName: title, type: "website" },
  twitter: { card: "summary_large_image", title, description },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await connection();
  return (
    <html
      lang="id"
      data-theme="jejak"
      className={`${urbanist.variable} ${sourceSans3.variable} h-dvh antialiased`}
    >
      <body className="h-full flex flex-col">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
