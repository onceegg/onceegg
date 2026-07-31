import { getAllNotes } from "@/lib/notes";

import { Incubator } from "./incubator";
import { HatchingMessage } from "./hatching-message";

export default function Home() {
  const notes = getAllNotes();
  const constellationNotes = notes
    .slice(0, 12)
    .map(({ slug, title, date }) => ({ slug, title, date }));

  return (
    <main className="page">
      <section className="section sectionIntro" aria-labelledby="site-title">
        <Incubator notes={constellationNotes} />
      </section>

      <section className="section sectionHatching" aria-labelledby="hatching-title">
        <HatchingMessage />
      </section>

      <section className="section sectionClosing">
        <p className="closingNote">Started in 2026.</p>
      </section>
    </main>
  );
}
