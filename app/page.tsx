export default function Home() {
  return (
    <main className="page">
      <section className="composition" aria-labelledby="site-title">
        <h1 id="site-title">OnceEgg</h1>

        <div className="details">
          <span className="mark" aria-hidden="true" />
          <p className="status">
            Still hatching<span className="orange-stop">.</span>
          </p>
          <p className="description">
            Ideas, products, experiments, and artworks.
          </p>
          <p className="date">Started in 2026.</p>
        </div>
      </section>
    </main>
  );
}
