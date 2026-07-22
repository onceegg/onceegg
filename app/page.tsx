export default function Home() {
  return (
    <main className="page">
      <section className="section sectionIntro" aria-labelledby="site-title">
        <h1 className="wordmark" id="site-title" tabIndex={0}>
          <span>Once</span>
          <span className="wordmarkEgg">Egg</span>
        </h1>
      </section>

      <section className="section sectionHatching" aria-labelledby="hatching-title">
        <div className="hatchingContent">
          <h2 id="hatching-title">Still hatching.</h2>
          <p>Ideas, products, experiments, and artworks.</p>
        </div>
      </section>

      <section className="section sectionObservation">
        <p className="observation">
          Not everything needs to be noticed<span className="orangePeriod">.</span>
        </p>
      </section>

      <section className="section sectionClosing">
        <p className="closingNote">Started in 2026.</p>
      </section>
    </main>
  );
}
