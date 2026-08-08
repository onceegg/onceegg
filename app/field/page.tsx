import type { Metadata } from "next";

import { FieldExperience } from "./field-experience";

export const metadata: Metadata = {
  title: "hint — OnceEgg",
  description: "Draw once. A hint may appear.",
};

export default function FieldPage() {
  return <FieldExperience />;
}
