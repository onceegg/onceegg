import { Incubator } from "./incubator";

export default function Home() {
  return (
    <main className="page">
      <section className="section sectionIntro" aria-labelledby="site-title">
        <Incubator />
      </section>

      <section className="section sectionHatching" aria-labelledby="hatching-title">
        <div className="hatchingContent">
          <h2 id="hatching-title">Still hatching.</h2>
        </div>
      </section>

      <section className="section sectionClosing">
        <p className="closingNote">Started in 2026.</p>
      </section>
    </main>
  );
}
