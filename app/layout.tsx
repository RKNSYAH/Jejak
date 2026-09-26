import type { Metadata } from "next";
import "./globals.css";
import { urbanist, sourceSans3 } from "./fonts";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  title: "Jejak",
  description: "Explore Indonesian districts on a map with employment, education, housing, and mobility data.",
  openGraph: {
    title: "Jejak",
    description: "Explore Indonesian districts on a map with employment, education, housing, and mobility data.",
    siteName: "Jejak",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Jejak",
    description: "Explore Indonesian districts on a map with employment, education, housing, and mobility data.",
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
        {children}
        <Analytics />
      </body>
    </html>
  );
}
