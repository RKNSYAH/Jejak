import type { Metadata } from "next";
import "./globals.css";
import Header from "./components/Header";
import { urbanist, sourceSans3 } from "./fonts";
import { Analytics } from "@vercel/analytics/next";

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
      className={`${urbanist.variable} ${sourceSans3.variable} h-dvh antialiased`}
    >
      <body className="h-full flex flex-col">
        {/* <Header /> */}
        {children}
        <Analytics />
      </body>
    </html>
  );
}
