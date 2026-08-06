import type { Metadata, Viewport } from "next";

import { JotApp } from "./jot-app";

export const metadata: Metadata = {
  title: "Jot — OnceEgg",
  description: "A private, local note wall from OnceEgg.",
  alternates: {
    canonical: "/jot",
  },
  openGraph: {
    title: "Jot — OnceEgg",
    description: "A private, local note wall from OnceEgg.",
    url: "/jot",
    siteName: "OnceEgg",
    type: "website",
    images: [
      {
        url: "/og/onceegg-jot.jpg",
        width: 1200,
        height: 630,
        alt: "OnceEgg on a quiet watercolor paper background",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Jot — OnceEgg",
    description: "A private, local note wall from OnceEgg.",
    images: ["/og/onceegg-jot.jpg"],
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F2EFE7" },
    { media: "(prefers-color-scheme: dark)", color: "#121212" },
  ],
};

export default function JotPage() {
  return <JotApp />;
}
