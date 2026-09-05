import { Incubator } from "./incubator";
import { HatchingMessage } from "./hatching-message";

export default function Home() {
  return (
    <main className="page">
      <section className="section sectionIntro" aria-labelledby="site-title">
        <Incubator />
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
