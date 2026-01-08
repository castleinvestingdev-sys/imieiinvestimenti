"use client"
import Link from 'next/link'
import Image from 'next/image'

export default function HomePage() {
  return (
    <>
      {/* Hero Section */}
      <section className="hero-section">
        <div className="container">
          <div className="hero-header">
            <h1 className="hero-title">
              I tuoi investimenti<br />rendono davvero?
            </h1>
            <h2 className="hero-subtitle">
              La banca non te lo dice.<br />
              <span className="text-primary">Noi sì.</span>
            </h2>
          </div>

          <div className="hero-flex">
            {/* Left Column: Desc & List */}
            <div className="hero-left">
              <p className="hero-desc">
                <span className="hero-brand">iMieiInvestimenti.it</span> trasforma i tuoi estratti conto bancari in rendiconti chiari, verificabili e indipendenti.
              </p>

              <ul className="hero-list">
                <li><span>👉</span> Performance reali</li>
                <li><span>👉</span> Costi nascosti evidenti</li>
                <li><span>👉</span> Numeri ricalcolabili da zero</li>
              </ul>
            </div>

            {/* Right Column: CTA */}
            <div className="hero-right">
              <h4 className="hero-cta-title">
                Ti basta caricare un PDF.
              </h4>
              <Link href="/discover" className="hero-btn">
                PROVALO ORA! →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="section-padding" id="problem-section">
        <div className="container">
          <div className="flex-row-mobile">
            {/* Text Content */}
            <div style={{ flex: 1 }}>
              <span className="section-label">
                <span style={{ fontSize: '2rem' }}>📉</span> IL PROBLEMA
              </span>
              <h2 className="section-title">
                Perché non riesci a calcolare le tue performance?
              </h2>

              <p className="section-p">
                Perché le banche non consegnano estratti conto esaustivi.
              </p>
              <p className="section-p">
                Non mancano i numeri.<br />
                Mancano quelli giusti.
              </p>
            </div>

            {/* Image Content */}
            <div className="section-img-wrapper">
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <Image src="/assets/evil_banker.png" alt="Consulente Bancario" width={400} height={400} style={{ mixBlendMode: 'multiply' }} />
                <h3 className="img-caption">
                  Intanto il consulente bancario
                </h3>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Banks Section */}
      <section className="section-padding">
        <div className="container">
          <div className="flex-row-mobile flip-mobile">
            {/* Text Content (Right in desktop order) */}
            <div style={{ flex: 1 }}>
              <span className="section-label">
                <span style={{ fontSize: '2rem' }}>🧠</span> PERCHÉ LE BANCHE NON LO FANNO?
              </span>
              <h2 className="section-title">
                Perché la trasparenza ha un costo.
              </h2>

              <p className="section-p">
                E non lo paga la banca.<br />
                Lo pagherebbe il suo modello di business.
              </p>

              <ul className="check-list">
                <li>• Costi più evidenti</li>
                <li>• Performance meno "belle"</li>
                <li>• Clienti più consapevoli</li>
              </ul>

              <p className="section-p" style={{ color: '#f59e0b', fontWeight: 900 }}>👉 Non conviene.</p>
            </div>

            {/* Image Content (Left in desktop order) */}
            <div className="section-img-wrapper">
              <Image src="/assets/confused_investor.png" alt="Investitore Confuso" width={400} height={400} style={{ mixBlendMode: 'multiply' }} />
              <h3 className="img-caption">
                Le banche guadagnano di più da clienti "inconsapevoli"
              </h3>
            </div>
          </div>
        </div>
      </section>

      {/* Green Section (Solution) */}
      <section className="green-section">
        <div className="container">
          <h2 className="green-title">COSA FACCIAMO NOI</h2>
          <h3 className="green-subtitle">Ricostruiamo tutto. Da zero.</h3>

          <div className="flex-row-mobile">
            <div style={{ flex: 1 }}>
              <p className="green-p">
                Partiamo dai <strong>documenti ufficiali</strong> della tua banca.<br />
                Li trasformiamo in <strong>dati leggibili</strong>.
              </p>

              <p className="green-list-label">Ecco cosa otterrai:</p>
              <ul className="green-list">
                <li><strong>• Portafoglio iniziale reale</strong></li>
                <li>• Tutti i movimenti normalizzati</li>
                <li><strong>• Commissioni esplicite</strong></li>
                <li>• Dividendi e cedole separati</li>
                <li>• Performance vera (ricalcolata)</li>
                <li style={{ marginTop: '2rem', fontWeight: 900, background: '#fff', color: '#00C853', padding: '12px 24px', borderRadius: '50px', display: 'inline-block', fontSize: '1.2rem' }}>
                  👉 Quello che la banca non ti dice.
                </li>
              </ul>
            </div>

            <div className="green-right">
              <h3 className="green-cta-title">
                Carica il tuo PDF.<br />Al resto pensiamo noi.
              </h3>
              <p className="green-disclaimer">*I PDF verranno analizzati dall’AI.</p>
              <Link href="/discover" className="green-btn">
                PROVALO ORA →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison Section */}
      <section className="section-padding">
        <div className="container">
          <div className="comparison-flex">
            {/* Left Column: LE BANCHE */}
            <div className="comp-card card-red">
              <h3 className="comp-title">LE BANCHE TI DANNO</h3>
              <ul className="comp-list">
                <li><span>🔴</span> Valore finale: <strong>24.950 €</strong></li>
                <li><span>🔴</span> Performance: <strong className="text-danger">✗</strong></li>
                <li><span>🔴</span> Costi: <strong className="text-danger">✗</strong></li>
                <li><span>🔴</span> Metodo: <strong className="text-danger">✗</strong></li>
              </ul>
              <div className="comp-img">
                <Image src="/assets/card_confused.png" alt="Investitore Confuso" width={180} height={180} />
              </div>
            </div>

            {/* Right Column: CON IMIEIINVESTIMENTI.IT */}
            <div className="comp-card card-green">
              <h3 className="comp-title">CON IMIEIINVESTIMENTI.IT 📊</h3>
              <ul className="comp-list">
                <li><span>✅</span> Capitale investito: <strong>25.000 €</strong></li>
                <li><span>✅</span> Commissioni totali: <strong>−50 €</strong></li>
                <li><span>✅</span> Performance reale: <strong className="text-danger">−0,20%</strong></li>
                <li><span>✅</span> Metodo: <strong className="text-primary">verificabile</strong></li>
                <li className="comp-badge">📌 Numeri semplici. Ma veri.</li>
              </ul>
              <div className="comp-img">
                <Image src="/assets/card_happy.png" alt="Investitore Soddisfatto" width={180} height={180} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* "Per chi è" Section */}
      <section className="section-padding">
        <div className="container">
          <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
            {/* Top Headline */}
            <h2 className="quote-title">
              Valuta il tuo consulente per i suoi rendimenti, non per la sua simpatia*
            </h2>

            <div className="flex-row-mobile">
              {/* Left Column */}
              <div style={{ flex: 1 }}>
                <h2 className="punch-title">
                  Noi ti aiutiamo<br />a farlo.
                </h2>
                <p className="quote-sub">
                  *capacità di persuasione
                </p>
              </div>

              {/* Right Column */}
              <div style={{ flex: 1, paddingTop: '20px' }}>
                <h3 className="list-header">
                  PER CHI È iMieiInvestimenti.it
                </h3>
                <ul className="target-list">
                  <li className="t-1"><span>✓ Risparmiatori consapevoli</span></li>
                  <li className="t-2"><span>✓ Investitori autonomi</span></li>
                  <li className="t-3"><span>✓ Clienti bancari e private</span></li>
                  <li className="t-4"><span>✓ Consulenti indipendenti</span></li>
                  <li className="t-5"><span>✓ Chi vuole capire prima di fidarsi</span></li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="cta-section">
        <div className="container">
          <div className="cta-header">
            <h2 className="cta-title-top">
              Carica il tuo estratto conto<br />
              e scopri quanto hai davvero guadagnato (o perso)
            </h2>
          </div>

          <div className="cta-flex">
            <h3 className="cta-big-text">
              Carica il tuo<br />estratto conto.
            </h3>

            <Link href="/discover" className="cta-btn-large">
              PROVALO ORA
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      <style jsx>{`
        .hero-section {
          padding: 180px 0 80px;
          background: #fff;
        }
        .hero-title {
          font-size: clamp(2.5rem, 8vw, 4.5rem);
          font-weight: 900;
          color: #1a1a1a;
          line-height: 1;
          letter-spacing: -2px;
          margin-bottom: 1.5rem;
        }
        .hero-subtitle {
          font-size: clamp(1.8rem, 5vw, 3rem);
          font-weight: 800;
          color: #1a1a1a;
          line-height: 1.1;
          margin-bottom: 4rem;
        }
        .hero-flex {
          display: flex;
          gap: 4rem;
          max-width: 1000px;
          margin: 0 auto;
          align-items: flex-start;
        }
        .hero-left { flex: 1.2; }
        .hero-right {
          flex: 0.8;
          text-align: right;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          padding-top: 10px;
        }
        .hero-desc {
          font-size: clamp(1.1rem, 3vw, 1.4rem);
          line-height: 1.5;
          color: #1a1a1a;
          margin-bottom: 2rem;
          font-weight: 500;
        }
        .hero-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .hero-list li {
          font-size: clamp(1rem, 2.5vw, 1.25rem);
          font-weight: 700;
          margin-bottom: 1rem;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .hero-cta-title {
          font-size: 1.2rem;
          font-weight: 800;
          color: #1a1a1a;
          margin-bottom: 1.5rem;
          text-transform: uppercase;
        }
        .hero-btn {
          display: inline-block;
          background: #00C853;
          color: #fff;
          font-weight: 900;
          padding: 20px 50px;
          border-radius: 60px;
          font-size: 1.4rem;
          text-transform: uppercase;
          text-decoration: none;
          box-shadow: 0 10px 30px rgba(0,200,83,0.3);
          transition: all 0.3s ease;
        }

        .section-padding { padding: 80px 0; background: #fff; }
        .flex-row-mobile {
          display: flex;
          gap: 6rem;
          align-items: center;
        }
        .section-title {
          font-size: clamp(1.8rem, 5vw, 3rem);
          font-weight: 800;
          color: #000;
          line-height: 1.1;
          margin-bottom: 2rem;
        }
        .section-p {
          font-size: clamp(1.1rem, 3vw, 1.5rem);
          font-weight: 600;
          color: #1d1d1f;
          margin-bottom: 1.5rem;
          line-height: 1.4;
        }

        .green-section {
          padding: 100px 0;
          background: #00C853;
          color: #fff;
        }
        .green-title {
          font-size: clamp(2.5rem, 10vw, 5rem);
          font-weight: 900;
          color: #fff;
          line-height: 1;
          margin-bottom: 0.5rem;
          letter-spacing: -3px;
        }
        .green-subtitle {
          font-size: clamp(1.5rem, 5vw, 2.5rem);
          font-weight: 700;
          color: rgba(255,255,255,0.95);
          line-height: 1.2;
          margin-bottom: 4rem;
        }
        .green-p {
          font-size: clamp(1.2rem, 3vw, 1.5rem);
          line-height: 1.5;
          margin-bottom: 2.5rem;
          font-weight: 500;
        }
        .green-list-label {
          font-size: 1.2rem;
          font-weight: 800;
          margin-bottom: 1rem;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .green-list { list-style: none; padding: 0; margin: 0; }
        .green-list li {
          font-size: clamp(1.1rem, 3vw, 1.35rem);
          font-weight: 600;
          margin-bottom: 0.6rem;
        }
        .green-right {
          flex: 0.8;
          text-align: right;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          justify-content: center;
        }
        .green-cta-title {
          font-size: clamp(1.8rem, 5vw, 2.5rem);
          font-weight: 900;
          margin-bottom: 1.5rem;
          line-height: 1.1;
        }
        .green-btn {
          background: #fff;
          color: #00C853;
          font-weight: 900;
          padding: 24px 60px;
          border-radius: 60px;
          font-size: 1.4rem;
          text-transform: uppercase;
          box-shadow: 0 10px 30px rgba(0,0,0,0.15);
          text-decoration: none;
          transition: all 0.3s ease;
        }

        .comparison-flex {
          display: flex;
          gap: 3rem;
          align-items: stretch;
        }
        .comp-card {
          flex: 1;
          border-radius: 24px;
          padding: 3rem;
          display: flex;
          flex-direction: column;
        }
        .card-red {
          background: linear-gradient(180deg, #fff 0%, #fef2f2 100%);
          box-shadow: 0 10px 40px rgba(220, 38, 38, 0.15);
          border: 2px solid #dc2626;
        }
        .card-green {
          background: linear-gradient(180deg, #fff 0%, #f0fdf4 100%);
          box-shadow: 0 10px 40px rgba(0,200,83,0.15);
          border: 2px solid #00C853;
        }
        .comp-title {
          font-size: 1.6rem;
          font-weight: 900;
          color: #1a1a1a;
          margin-bottom: 2rem;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .comp-list { list-style: none; padding: 0; margin: 0; flex: 1; }
        .comp-list li {
          font-size: 1.2rem;
          margin-bottom: 1.2rem;
          display: flex;
          align-items: center;
          gap: 12px;
          font-weight: 600;
        }
        .comp-badge {
          margin-top: 1rem;
          background: #e5f9e7;
          padding: 12px 20px;
          border-radius: 12px;
          color: #00C853;
          font-weight: 800;
        }
        .comp-img { text-align: center; margin-top: 3rem; }

        .quote-title {
          font-size: clamp(2rem, 6vw, 3.5rem);
          font-weight: 900;
          color: #1a1a1a;
          line-height: 1.1;
          margin-bottom: 2rem;
          letter-spacing: -1.5px;
        }
        .punch-title {
          font-size: clamp(2rem, 5vw, 3rem);
          font-weight: 900;
          color: #00C853;
          line-height: 1.1;
          margin-bottom: 1.5rem;
          letter-spacing: -1px;
        }
        .target-list { list-style: none; padding: 0; margin: 0; }
        .target-list li {
          font-size: clamp(1.1rem, 3vw, 1.4rem);
          font-weight: 850;
          color: #1a1a1a;
          margin-bottom: 0.4rem;
        }
        .t-2 { margin-left: 45px; }
        .t-3 { margin-left: 15px; }
        .t-4 { margin-left: 55px; }
        .t-5 { margin-left: -15px; }

        .cta-section { padding: 120px 0 160px; text-align: center; background: #fff; }
        .cta-title-top {
          font-size: clamp(1.5rem, 4vw, 2.2rem);
          font-weight: 800;
          color: #1a1a1a;
          line-height: 1.4;
          margin-bottom: 100px;
        }
        .cta-flex {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 50px;
        }
        .cta-big-text {
          font-size: clamp(2.5rem, 10vw, 5.5rem);
          font-weight: 950;
          color: #00C853;
          line-height: 0.9;
          margin: 0;
          letter-spacing: -4px;
          text-align: left;
        }
        .cta-btn-large {
          display: flex;
          align-items: center;
          gap: 15px;
          background: #00C853;
          color: #fff;
          font-weight: 950;
          padding: 30px 60px;
          border-radius: 80px;
          font-size: clamp(1.2rem, 4vw, 1.8rem);
          text-transform: uppercase;
          text-decoration: none;
          box-shadow: 0 15px 40px rgba(0,200,83,0.3);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .text-primary { color: #00C853; }
        .text-danger { color: #dc2626; }
        .hero-brand { color: #00C853; font-weight: 800; }
        .section-label {
          font-size: 1.2rem;
          font-weight: 900;
          text-transform: uppercase;
          color: #374151;
          margin-bottom: 1.5rem;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .img-caption {
          font-size: 1.6rem;
          font-weight: 1000;
          marginTop: 1rem;
          line-height: 1.2;
          color: #000;
        }
        .check-list { list-style: none; padding: 0; margin: 2rem 0; }
        .check-list li {
          font-size: clamp(1.1rem, 3vw, 1.35rem);
          font-weight: 700;
          margin-bottom: 0.8rem;
          color: #000;
        }

        @media (max-width: 1024px) {
          .hero-section { padding: 160px 0 70px; }
          .hero-flex, .flex-row-mobile, .comparison-flex, .cta-flex {
            flex-direction: column;
            text-align: center;
            align-items: center;
            gap: 3rem;
          }
          .hero-right, .green-right, .cta-big-text {
            text-align: center;
            align-items: center;
          }
          .hero-btn, .green-btn, .cta-btn-large {
            padding: 15px 40px;
            font-size: 1.2rem;
          }
          .t-1, .t-2, .t-3, .t-4, .t-5 { margin-left: 0; }
          .flip-mobile { flex-direction: column-reverse; }
        }

        @media (max-width: 640px) {
          .hero-section {
            padding: 110px 0 50px !important;
          }
          .hero-title {
            font-size: 2rem;
            margin-bottom: 1rem;
          }
          .hero-subtitle {
            font-size: 1.4rem;
            margin-bottom: 2.5rem;
          }
          .hero-desc {
            font-size: 1rem;
          }
          .hero-list li {
            font-size: 0.95rem;
          }
          .hero-cta-title {
            font-size: 1rem;
          }
          .hero-btn {
            width: 100%;
            padding: 16px 24px;
            font-size: 1.1rem;
            text-align: center;
          }
          .section-padding {
            padding: 50px 0;
          }
          .section-title {
            font-size: 1.5rem;
          }
          .section-p {
            font-size: 1rem;
          }
          .section-img-wrapper {
            max-width: 280px;
          }
          .img-caption {
            font-size: 1.2rem;
          }
          .green-section {
            padding: 60px 0;
          }
          .green-title {
            font-size: 2rem;
          }
          .green-subtitle {
            font-size: 1.3rem;
            margin-bottom: 2.5rem;
          }
          .green-btn {
            width: 100%;
            padding: 16px 24px;
            font-size: 1.1rem;
            text-align: center;
          }
          .comp-card {
            padding: 1.5rem;
            border-radius: 16px;
          }
          .comp-title {
            font-size: 1.2rem;
          }
          .comp-list li {
            font-size: 1rem;
          }
          .comp-img img {
            width: 120px;
            height: 120px;
          }
          .quote-title {
            font-size: 1.5rem;
          }
          .punch-title {
            font-size: 1.5rem;
          }
          .list-header {
            font-size: 1rem;
          }
          .target-list li {
            font-size: 1rem;
          }
          .cta-section {
            padding: 60px 0 80px;
          }
          .cta-title-top {
            font-size: 1.2rem;
            margin-bottom: 50px;
          }
          .cta-big-text {
            font-size: 2rem;
            letter-spacing: -2px;
          }
          .cta-btn-large {
            width: 100%;
            padding: 18px 24px;
            font-size: 1rem;
            justify-content: center;
          }
        }
      `}</style>
    </>
  )
}
