import type { Metadata, Viewport } from "next";

import { JotApp } from "./jot-app";

export const metadata: Metadata = {
  title: "Jot — OnceEgg",
  description: "A private, local note wall from OnceEgg.",
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
