import Link from 'next/link'
import Image from 'next/image'

export default function HomePage() {
  return (
    <>
      {/* Hero Section */}
      <section className="hero-section">
        <div className="container">
          <div className="mx-auto" style={{ width: '100%', maxWidth: '1000px', textAlign: 'left', marginBottom: '1rem' }}>
            <h1 className="hero-title mb-3">I tuoi investimenti rendono davvero?</h1>
            <h2 className="hero-subtitle-bold mb-0">
              La banca non te lo dice.<br />
              <span className="text-primary">Noi sì.</span>
            </h2>
          </div>

          <div className="hero-content-wrapper mx-auto">
            {/* Left Column: Desc & List */}
            <div className="hero-left-col">
              <p className="hero-desc">
                <span className="text-primary" style={{ fontWeight: 700 }}>iMieiInvestimenti.it</span> trasforma i tuoi estratti conto bancari in rendiconti chiari, verificabili e indipendenti.
              </p>

              <ul className="hero-list">
                <li>👉 Performance reali</li>
                <li>👉 Costi nascosti evidenti</li>
                <li>👉 Numeri ricalcolabili da zero</li>
              </ul>
            </div>

            {/* Right Column: CTA */}
            <div className="hero-right-col">
              <div className="hero-cta-group text-right">
                <h4 className="cta-label mb-2">Ti basta caricare un PDF.</h4>
                <Link href="/dashboard" className="btn btn-primary btn-xl">PROVALO ORA! →</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="split-section bg-white" id="problem-section">
        <div className="split-container">
          {/* Text Content */}
          <div className="split-content text-left">
            <span className="section-eyebrow" style={{ fontSize: '2rem', color: '#374151', lineHeight: 1, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '2.2rem' }}>📉</span> IL PROBLEMA
            </span>
            <h2 className="section-headline">Perché non riesci a calcolare le tue performance?</h2>

            <p className="section-body">
              Perché le banche non consegnano estratti conto esaustivi.
            </p>
            <p className="section-body">
              Non mancano i numeri.<br />
              Mancano quelli giusti.
            </p>
          </div>

          {/* Image Content */}
          <div className="split-image-wrapper">
            <Image src="/assets/evil_banker.png" alt="Consulente Bancario" className="split-image" width={300} height={300} />
            <h3 style={{ fontSize: '1.5rem', fontWeight: 800, textAlign: 'center', marginTop: '1rem', lineHeight: 1.2 }}>Intanto il consulente bancario</h3>
          </div>
        </div>
      </section>

      {/* Why Banks Section */}
      <section className="split-section">
        <div className="split-container">
          {/* Text Content */}
          <div className="split-content text-left">
            <span className="section-eyebrow" style={{ fontSize: '2rem', color: '#374151', lineHeight: 1, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '2.2rem' }}>🧠</span> PERCHÉ LE BANCHE NON LO FANNO?
            </span>
            <h2 className="section-headline">Perché la trasparenza ha un costo.</h2>

            <p className="section-body">
              E non lo paga la banca.<br />
              Lo pagherebbe il suo modello di business.
            </p>

            <ul className="mb-4" style={{ listStyle: 'none', padding: 0 }}>
              <li className="section-list-item">• Costi più evidenti</li>
              <li className="section-list-item">• Performance meno "belle"</li>
              <li className="section-list-item">• Clienti più consapevoli</li>
            </ul>

            <p className="section-body" style={{ color: '#f59e0b', fontWeight: 800 }}>👉 Non conviene.</p>
          </div>

          {/* Image Content */}
          <div className="split-image-wrapper">
            <Image src="/assets/confused_investor.png" alt="Investitore Confuso" className="split-image" style={{ mixBlendMode: 'multiply' }} width={300} height={300} />
            <h3 style={{ fontSize: '1.5rem', fontWeight: 800, textAlign: 'center', marginTop: '1rem', lineHeight: 1.2 }}>
              Le banche guadagnano di più da clienti "inconsapevoli"
            </h3>
          </div>
        </div>
      </section>

      {/* Green Section (Solution) */}
      <section className="solution-section section bg-primary-full text-white" style={{ padding: '40px 0', background: '#00C853' }}>
        <div className="container">
          {/* Header */}
          <h5 style={{ fontSize: '4rem', fontWeight: 900, color: '#fff', lineHeight: 1, marginBottom: '0.5rem', letterSpacing: '-2px', textTransform: 'uppercase' }}>COSA FACCIAMO NOI</h5>
          <h2 style={{ fontSize: '2rem', fontWeight: 600, color: 'rgba(255,255,255,0.9)', lineHeight: 1.2, marginBottom: '2rem' }}>Ricostruiamo tutto. Da zero.</h2>

          {/* Two Column Layout */}
          <div className="solution-container" style={{ display: 'flex', gap: '4rem', alignItems: 'stretch' }}>
            {/* Left Content */}
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '1.1rem', lineHeight: 1.5, color: '#fff', marginBottom: '1.5rem' }}>
                Partiamo dai <strong>documenti ufficiali</strong> della tua banca.<br />
                Li trasformiamo in <strong>dati leggibili</strong>.
              </p>

              <p style={{ fontWeight: 700, marginBottom: '0.5rem', color: '#fff' }}>Ecco cosa otterrai:</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: '#fff' }}>
                <li style={{ marginBottom: '0.4rem' }}><strong>• Portafoglio iniziale reale</strong></li>
                <li style={{ marginBottom: '0.4rem' }}>• Tutti i movimenti normalizzati</li>
                <li style={{ marginBottom: '0.4rem' }}><strong>• Commissioni esplicite</strong></li>
                <li style={{ marginBottom: '0.4rem' }}>• Dividendi e cedole separati</li>
                <li style={{ marginBottom: '0.4rem' }}>• Performance vera (ricalcolata)</li>
                <li style={{ marginTop: '1rem', fontWeight: 800, background: 'rgba(255,255,255,0.2)', padding: '8px 12px', borderRadius: '4px', display: 'inline-block' }}>
                  👉 Quello che la banca non ti dice.
                </li>
              </ul>
            </div>

            {/* Right Content */}
            <div style={{ flex: 0.8, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'flex-end', textAlign: 'right' }}>
              <h3 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', textAlign: 'right', marginBottom: '0.5rem', lineHeight: 1.2 }}>Carica il tuo PDF.<br />Al resto pensiamo noi.</h3>

              <p style={{ opacity: 0.7, fontSize: '0.8rem', color: '#fff', marginBottom: '1rem' }}>*I PDF verranno analizzati dall&apos;AI.</p>

              <Link href="/dashboard" className="btn btn-white-pill btn-xl" style={{ background: '#fff', color: '#000', fontWeight: 800, padding: '16px 40px', borderRadius: '50px', textTransform: 'uppercase', boxShadow: '0 4px 15px rgba(0,0,0,0.2)', textDecoration: 'none' }}>PROVALO ORA →</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison Section */}
      <section className="comparison-section" style={{ background: 'linear-gradient(180deg, #f8f9fa 0%, #fff 100%)', padding: '50px 0' }}>
        <div className="container">
          <div className="comparison-container" style={{ display: 'flex', gap: '2rem', alignItems: 'stretch' }}>

            {/* Left Column: LE BANCHE */}
            <div style={{ flex: 1, background: 'linear-gradient(180deg, #fff 0%, #fafafa 100%)', borderRadius: '16px', padding: '1.8rem', boxShadow: '0 6px 25px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', transition: 'all 0.3s ease' }}>
              <h3 style={{ fontFamily: 'Inter, sans-serif', fontSize: '1.4rem', fontWeight: 800, color: '#1a1a1a', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>LE BANCHE TI DANNO</h3>

              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                <li style={{ fontSize: '1rem', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '8px', color: '#333' }}>
                  <span style={{ fontSize: '0.85rem' }}>🔴</span>
                  <span>Valore finale: <strong>24.950 €</strong></span>
                </li>
                <li style={{ fontSize: '1rem', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '8px', color: '#333' }}>
                  <span style={{ fontSize: '0.85rem' }}>🔴</span>
                  <span>Performance: <strong style={{ color: '#dc2626' }}>✗</strong></span>
                </li>
                <li style={{ fontSize: '1rem', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '8px', color: '#333' }}>
                  <span style={{ fontSize: '0.85rem' }}>🔴</span>
                  <span>Costi: <strong style={{ color: '#dc2626' }}>✗</strong></span>
                </li>
                <li style={{ fontSize: '1rem', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '8px', color: '#333' }}>
                  <span style={{ fontSize: '0.85rem' }}>🔴</span>
                  <span>Metodo: <strong style={{ color: '#dc2626' }}>✗</strong></span>
                </li>
              </ul>

              <div style={{ textAlign: 'center', marginTop: 'auto', paddingTop: '1rem' }}>
                <Image src="/assets/card_confused.png" alt="Investitore Confuso" style={{ height: '140px', width: 'auto' }} width={140} height={140} />
              </div>
            </div>

            {/* Right Column: CON IMIEIINVESTIMENTI.IT */}
            <div style={{ flex: 1, background: 'linear-gradient(180deg, #fff 0%, #f0fdf4 100%)', borderRadius: '16px', padding: '1.8rem', boxShadow: '0 6px 25px rgba(0,200,83,0.12)', border: '2px solid #00C853', display: 'flex', flexDirection: 'column', transition: 'all 0.3s ease' }}>
              <h3 style={{ fontFamily: 'Inter, sans-serif', fontSize: '1.4rem', fontWeight: 800, color: '#1a1a1a', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>CON IMIEIINVESTIMENTI.IT 📊</h3>

              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                <li style={{ fontSize: '1rem', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '8px', color: '#333' }}>
                  <span style={{ fontSize: '0.85rem' }}>✅</span>
                  <span>Capitale investito: <strong>25.000 €</strong></span>
                </li>
                <li style={{ fontSize: '1rem', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '8px', color: '#333' }}>
                  <span style={{ fontSize: '0.85rem' }}>✅</span>
                  <span>Commissioni totali: <strong>−50 €</strong></span>
                </li>
                <li style={{ fontSize: '1rem', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '8px', color: '#333' }}>
                  <span style={{ fontSize: '0.85rem' }}>✅</span>
                  <span>Performance reale: <strong style={{ color: '#dc2626' }}>−0,20%</strong></span>
                </li>
                <li style={{ fontSize: '1rem', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '8px', color: '#333' }}>
                  <span style={{ fontSize: '0.85rem' }}>✅</span>
                  <span>Metodo: <strong style={{ color: '#00C853' }}>verificabile</strong></span>
                </li>
                <li style={{ fontSize: '1rem', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '8px', color: '#333' }}>
                  <span style={{ fontSize: '0.85rem' }}>📌</span>
                  <span style={{ fontWeight: 600, fontStyle: 'italic', color: '#00C853' }}>Numeri semplici. Ma veri.</span>
                </li>
              </ul>

              <div style={{ textAlign: 'center', marginTop: 'auto', paddingTop: '1rem' }}>
                <Image src="/assets/card_happy.png" alt="Investitore Soddisfatto" style={{ height: '140px', width: 'auto' }} width={140} height={140} />
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* "Per chi è" Section */}
      <section style={{ background: '#fff', padding: '60px 0' }}>
        <div className="container">
          <div style={{ display: 'flex', gap: '4rem', alignItems: 'center' }}>
            {/* Left Column */}
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: '3rem', fontWeight: 900, color: '#00C853', lineHeight: 1.1, marginBottom: '1rem' }}>Noi ti aiutiamo<br />a farlo.</h2>
              <p style={{ fontSize: '0.9rem', color: '#666', fontStyle: 'italic' }}>*senza magia, solo trasparenza</p>
            </div>

            {/* Right Column */}
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: '1.4rem', fontWeight: 800, textTransform: 'uppercase', color: '#1a1a1a', marginBottom: '1.5rem', letterSpacing: '0.5px' }}>PER CHI È iMieiInvestimenti.it</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                <li style={{ fontSize: '1.1rem', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ color: '#00C853', fontWeight: 700 }}>✓</span>
                  <span>Risparmiatori consapevoli</span>
                </li>
                <li style={{ fontSize: '1.1rem', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ color: '#00C853', fontWeight: 700 }}>✓</span>
                  <span>Investitori autonomi</span>
                </li>
                <li style={{ fontSize: '1.1rem', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ color: '#00C853', fontWeight: 700 }}>✓</span>
                  <span>Clienti bancari e private</span>
                </li>
                <li style={{ fontSize: '1.1rem', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ color: '#00C853', fontWeight: 700 }}>✓</span>
                  <span>Consulenti indipendenti</span>
                </li>
                <li style={{ fontSize: '1.1rem', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ color: '#00C853', fontWeight: 700 }}>✓</span>
                  <span>Chi vuole capire prima di fidarsi</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section style={{ background: 'linear-gradient(180deg, #f8f9fa 0%, #fff 100%)', padding: '80px 0', textAlign: 'center' }}>
        <div className="container">
          <h2 style={{ fontSize: '2.5rem', fontWeight: 800, color: '#1a1a1a', marginBottom: '1.5rem' }}>I tuoi soldi meritano chiarezza.</h2>

          <h3 style={{ fontSize: '3rem', fontWeight: 900, color: '#1a1a1a', lineHeight: 1.2, marginBottom: '2rem' }}>
            Non grafici.<br />
            Non promesse.<br />
            <span style={{ color: '#00C853' }}>Numeri verificabili.</span>
          </h3>

          <p style={{ fontSize: '1.2rem', color: '#555', marginBottom: '2.5rem', maxWidth: '500px', marginLeft: 'auto', marginRight: 'auto' }}>
            Carica il tuo estratto conto<br />e scopri quanto hai <strong>davvero</strong> guadagnato (o perso).
          </p>

          <Link href="/dashboard" style={{ display: 'inline-block', background: '#00C853', color: '#fff', fontWeight: 800, padding: '18px 50px', borderRadius: '50px', fontSize: '1.2rem', textTransform: 'uppercase', textDecoration: 'none', boxShadow: '0 6px 20px rgba(0,200,83,0.3)', transition: 'all 0.3s ease' }}>
            PROVALO ORA →
          </Link>
        </div>
      </section>
    </>
  )
}
