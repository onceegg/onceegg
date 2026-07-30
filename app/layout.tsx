import type { Metadata, Viewport } from "next";
import { Courier_Prime, Newsreader } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";
import "./incubator-notes.css";

const newsreader = Newsreader({
  axes: ["opsz"],
  display: "swap",
  subsets: ["latin"],
  variable: "--font-newsreader",
  weight: "variable",
});

const courierPrime = Courier_Prime({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-courier-prime",
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "OnceEgg",
  description: "A place for ideas, products, experiments, and artworks.",
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#fefefd",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      className={`${newsreader.variable} ${courierPrime.variable}`}
      lang="en"
    >
      <body>{children}</body>
    </html>
  );
}
