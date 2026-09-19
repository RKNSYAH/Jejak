import type { Metadata } from "next";
import { Urbanist, Source_Sans_3 } from "next/font/google";
import "./globals.css";

const urbanist = Urbanist({
  variable: "--font-urbanist",
  subsets: ["latin"],
});

const sourceSans3 = Source_Sans_3({
  variable: "--font-source-sans-3",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Jejak",
  description: "Local Relocation Decision Platform — coming soon.",
  openGraph: {
    title: "Jejak",
    description: "Local Relocation Decision Platform — coming soon.",
    siteName: "Jejak",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Jejak",
    description: "Local Relocation Decision Platform — coming soon.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="jejak"
      className={`${urbanist.variable} ${sourceSans3.variable} h-full antialiased`}
    >
      <body className="bg-base-100 text-base-content min-h-full flex flex-col">{children}</body>
    </html>
  );
}
