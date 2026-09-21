import type { Metadata, Viewport } from "next";
import { Courier_Prime, Newsreader } from "next/font/google";
import type { CSSProperties, ReactNode } from "react";
import { preload } from "react-dom";

import paperTexture from "../public/textures/watercolor-paper.jpg";

import "./globals.css";

// Share one content-hashed URL between the preload and every paper surface.
const paperTextureStyle = {
  "--onceegg-tape-texture": `url("${paperTexture.src}")`,
} as CSSProperties;

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
  metadataBase: new URL("https://www.onceegg.com"),
  title: "OnceEgg",
  description: "A place for ideas, products, experiments, and artworks.",
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#fefefd",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  preload(paperTexture.src, { as: "image", fetchPriority: "high" });

  return (
    <html
      className={`${newsreader.variable} ${courierPrime.variable}`}
      lang="en"
      style={paperTextureStyle}
    >
      <body>{children}</body>
    </html>
  );
}
