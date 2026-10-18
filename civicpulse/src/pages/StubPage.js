export default function StubPage({ title, eyebrow, description, bullets = [] }) {
  return (
    <section className="page">
      <header className="page__header">
        <div>
          <p className="page__eyebrow">{eyebrow || 'CivicPulse module'}</p>
          <h1 className="page__title">{title}</h1>
          <p className="page__lead">{description}</p>
        </div>
      </header>

      <div className="split">
        <article className="panel">
          <div className="panel__head">
            <h2>What this module delivers</h2>
          </div>
          <ul className="bullet-list">
            {bullets.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
        <article className="panel panel--accent">
          <p className="panel__kicker">Mahilu Solutions</p>
          <h2>Production build next</h2>
          <p>
            UI shell is live. Data connectors for the 247 Eluru PDF parts and
            field apps plug in on this foundation.
          </p>
        </article>
      </div>
    </section>
  );
}
