import Link from 'next/link' // trigger deploy
import Image from 'next/image'

export default function HomePage() {
  return (
    <>
      {/* Hero Section */}
      <section style={{ padding: '160px 0 80px', background: '#fff' }}>
        <div className="container">
          <div style={{ maxWidth: '1000px', margin: '0 auto', textAlign: 'left' }}>
            <h1 style={{ fontSize: '4.5rem', fontWeight: 900, color: '#1a1a1a', lineHeight: 1, letterSpacing: '-2px', marginBottom: '1.5rem' }}>
              I tuoi investimenti<br />rendono davvero?
            </h1>
            <h2 style={{ fontSize: '3rem', fontWeight: 800, color: '#1a1a1a', lineHeight: 1.1, marginBottom: '4rem' }}>
              La banca non te lo dice.<br />
              <span style={{ color: '#00C853' }}>Noi sì.</span>
            </h2>
          </div>

          <div style={{ display: 'flex', gap: '4rem', maxWidth: '1000px', margin: '0 auto', alignItems: 'flex-start' }}>
            {/* Left Column: Desc & List */}
            <div style={{ flex: 1.2 }}>
              <p style={{ fontSize: '1.4rem', lineHeight: 1.5, color: '#1a1a1a', marginBottom: '2rem', fontWeight: 500 }}>
                <span style={{ color: '#00C853', fontWeight: 800 }}>iMieiInvestimenti.it</span> trasforma i tuoi estratti conto bancari in rendiconti chiari, verificabili e indipendenti.
              </p>

              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                <li style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '1.5rem' }}>👉</span> Performance reali
                </li>
                <li style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '1.5rem' }}>👉</span> Costi nascosti evidenti
                </li>
                <li style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '1.5rem' }}>👉</span> Numeri ricalcolabili da zero
                </li>
              </ul>
            </div>

            {/* Right Column: CTA */}
            <div style={{ flex: 0.8, textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', paddingTop: '10px' }}>
              <h4 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1a1a1a', marginBottom: '1.5rem', textTransform: 'uppercase' }}>
                Ti basta caricare un PDF.
              </h4>
              <Link href="/dashboard" style={{
                display: 'inline-block',
                background: '#00C853',
                color: '#fff',
                fontWeight: 900,
                padding: '20px 50px',
                borderRadius: '60px',
                fontSize: '1.4rem',
                textTransform: 'uppercase',
                textDecoration: 'none',
                boxShadow: '0 10px 30px rgba(0,200,83,0.3)',
                transition: 'all 0.3s ease'
              }}>
                PROVALO ORA! →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section style={{ padding: '80px 0', background: '#fff' }} id="problem-section">
        <div className="container">
          <div style={{ display: 'flex', gap: '6rem', alignItems: 'center' }}>
            {/* Text Content */}
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: '1.2rem', fontWeight: 900, textTransform: 'uppercase', color: '#374151', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '2rem' }}>📉</span> IL PROBLEMA
              </span>
              <h2 style={{ fontSize: '3rem', fontWeight: 800, color: '#000', lineHeight: 1.1, marginBottom: '2rem' }}>
                Perché non riesci a calcolare le tue performance?
              </h2>

              <p style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1d1d1f', marginBottom: '1.5rem', lineHeight: 1.4 }}>
                Perché le banche non consegnano estratti conto esaustivi.
              </p>
              <p style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1d1d1f', lineHeight: 1.4 }}>
                Non mancano i numeri.<br />
                Mancano quelli giusti.
              </p>
            </div>

            {/* Image Content */}
            <div style={{ flex: 0.8, textAlign: 'center' }}>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <Image src="/assets/evil_banker.png" alt="Consulente Bancario" width={400} height={400} style={{ mixBlendMode: 'multiply' }} />
                <h3 style={{ fontSize: '1.6rem', fontWeight: 1000, marginTop: '1rem', lineHeight: 1.2, color: '#000' }}>
                  Intanto il consulente bancario
                </h3>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Banks Section */}
      <section style={{ padding: '80px 0', background: '#fff' }}>
        <div className="container">
          <div style={{ display: 'flex', gap: '6rem', alignItems: 'center' }}>
            {/* Image Content (Left) */}
            <div style={{ flex: 0.8, textAlign: 'center', order: 2 }}>
              <Image src="/assets/confused_investor.png" alt="Investitore Confuso" width={400} height={400} style={{ mixBlendMode: 'multiply' }} />
              <h3 style={{ fontSize: '1.6rem', fontWeight: 1000, marginTop: '1rem', lineHeight: 1.2, color: '#000' }}>
                Le banche guadagnano di più da clienti "inconsapevoli"
              </h3>
            </div>

            {/* Text Content (Right) */}
            <div style={{ flex: 1, order: 1 }}>
              <span style={{ fontSize: '1.2rem', fontWeight: 900, textTransform: 'uppercase', color: '#374151', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '2rem' }}>🧠</span> PERCHÉ LE BANCHE NON LO FANNO?
              </span>
              <h2 style={{ fontSize: '3rem', fontWeight: 800, color: '#000', lineHeight: 1.1, marginBottom: '2rem' }}>
                Perché la trasparenza ha un costo.
              </h2>

              <p style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1d1d1f', marginBottom: '1.5rem', lineHeight: 1.4 }}>
                E non lo paga la banca.<br />
                Lo pagherebbe il suo modello di business.
              </p>

              <ul style={{ listStyle: 'none', padding: 0, margin: '2rem 0' }}>
                <li style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: '0.8rem', color: '#000' }}>• Costi più evidenti</li>
                <li style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: '0.8rem', color: '#000' }}>• Performance meno "belle"</li>
                <li style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: '0.8rem', color: '#000' }}>• Clienti più consapevoli</li>
              </ul>

              <p style={{ fontSize: '1.5rem', color: '#f59e0b', fontWeight: 900 }}>👉 Non conviene.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Green Section (Solution) */}
      <section style={{ padding: '100px 0', background: '#00C853', color: '#fff' }}>
        <div className="container">
          <h2 style={{ fontSize: '5rem', fontWeight: 900, color: '#fff', lineHeight: 1, marginBottom: '0.5rem', letterSpacing: '-3px' }}>COSA FACCIAMO NOI</h2>
          <h3 style={{ fontSize: '2.5rem', fontWeight: 700, color: 'rgba(255,255,255,0.95)', lineHeight: 1.2, marginBottom: '4rem' }}>Ricostruiamo tutto. Da zero.</h3>

          <div style={{ display: 'flex', gap: '6rem', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '1.5rem', lineHeight: 1.5, color: '#fff', marginBottom: '2.5rem', fontWeight: 500 }}>
                Partiamo dai <strong>documenti ufficiali</strong> della tua banca.<br />
                Li trasformiamo in <strong>dati leggibili</strong>.
              </p>

              <p style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Ecco cosa otterrai:</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                <li style={{ fontSize: '1.35rem', fontWeight: 600, marginBottom: '0.6rem' }}><strong>• Portafoglio iniziale reale</strong></li>
                <li style={{ fontSize: '1.35rem', fontWeight: 600, marginBottom: '0.6rem' }}>• Tutti i movimenti normalizzati</li>
                <li style={{ fontSize: '1.35rem', fontWeight: 600, marginBottom: '0.6rem' }}><strong>• Commissioni esplicite</strong></li>
                <li style={{ fontSize: '1.35rem', fontWeight: 600, marginBottom: '0.6rem' }}>• Dividendi e cedole separati</li>
                <li style={{ fontSize: '1.35rem', fontWeight: 600, marginBottom: '0.6rem' }}>• Performance vera (ricalcolata)</li>
                <li style={{ marginTop: '2rem', fontWeight: 900, background: '#fff', color: '#00C853', padding: '12px 24px', borderRadius: '50px', display: 'inline-block', fontSize: '1.2rem' }}>
                  👉 Quello che la banca non ti dice.
                </li>
              </ul>
            </div>

            <div style={{ flex: 0.8, textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', height: '100%' }}>
              <h3 style={{ fontSize: '2.5rem', fontWeight: 900, color: '#fff', marginBottom: '1.5rem', lineHeight: 1.1 }}>
                Carica il tuo PDF.<br />Al resto pensiamo noi.
              </h3>
              <p style={{ opacity: 0.8, fontSize: '0.9rem', marginBottom: '2rem', fontWeight: 600 }}>*I PDF verranno analizzati dall’AI.</p>
              <Link href="/dashboard" style={{
                background: '#fff',
                color: '#00C853',
                fontWeight: 900,
                padding: '24px 60px',
                borderRadius: '60px',
                fontSize: '1.4rem',
                textTransform: 'uppercase',
                boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
                textDecoration: 'none',
                transition: 'all 0.3s ease'
              }}>
                PROVALO ORA →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison Section */}
      <section style={{ background: '#fff', padding: '100px 0' }}>
        <div className="container">
          <div style={{ display: 'flex', gap: '3rem', alignItems: 'stretch' }}>
            {/* Left Column: LE BANCHE */}
            <div style={{ flex: 1, background: 'linear-gradient(180deg, #fff 0%, #fef2f2 100%)', borderRadius: '24px', padding: '3rem', boxShadow: '0 10px 40px rgba(220, 38, 38, 0.15)', border: '2px solid #dc2626', display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ fontSize: '1.6rem', fontWeight: 900, color: '#1a1a1a', marginBottom: '2rem', textTransform: 'uppercase', letterSpacing: '1px' }}>LE BANCHE TI DANNO</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, flex: 1 }}>
                <li style={{ fontSize: '1.2rem', marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 600 }}>
                  <span style={{ fontSize: '1.2rem' }}>🔴</span> Valore finale: <strong>24.950 €</strong>
                </li>
                <li style={{ fontSize: '1.2rem', marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 600 }}>
                  <span style={{ fontSize: '1.2rem' }}>🔴</span> Performance: <strong style={{ color: '#dc2626' }}>✗</strong>
                </li>
                <li style={{ fontSize: '1.2rem', marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 600 }}>
                  <span style={{ fontSize: '1.2rem' }}>🔴</span> Costi: <strong style={{ color: '#dc2626' }}>✗</strong>
                </li>
                <li style={{ fontSize: '1.2rem', marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 600 }}>
                  <span style={{ fontSize: '1.2rem' }}>🔴</span> Metodo: <strong style={{ color: '#dc2626' }}>✗</strong>
                </li>
              </ul>
              <div style={{ textAlign: 'center', marginTop: '3rem' }}>
                <Image src="/assets/card_confused.png" alt="Investitore Confuso" width={180} height={180} />
              </div>
            </div>

            {/* Right Column: CON IMIEIINVESTIMENTI.IT */}
            <div style={{ flex: 1, background: 'linear-gradient(180deg, #fff 0%, #f0fdf4 100%)', borderRadius: '24px', padding: '3rem', boxShadow: '0 10px 40px rgba(0,200,83,0.15)', border: '2px solid #00C853', display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ fontSize: '1.6rem', fontWeight: 900, color: '#1a1a1a', marginBottom: '2rem', textTransform: 'uppercase', letterSpacing: '1px' }}>CON IMIEIINVESTIMENTI.IT 📊</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, flex: 1 }}>
                <li style={{ fontSize: '1.2rem', marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 600 }}>
                  <span style={{ fontSize: '1.2rem' }}>✅</span> Capitale investito: <strong>25.000 €</strong>
                </li>
                <li style={{ fontSize: '1.2rem', marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 600 }}>
                  <span style={{ fontSize: '1.2rem' }}>✅</span> Commissioni totali: <strong>−50 €</strong>
                </li>
                <li style={{ fontSize: '1.2rem', marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 600 }}>
                  <span style={{ fontSize: '1.2rem' }}>✅</span> Performance reale: <strong style={{ color: '#dc2626' }}>−0,20%</strong>
                </li>
                <li style={{ fontSize: '1.2rem', marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 600 }}>
                  <span style={{ fontSize: '1.2rem' }}>✅</span> Metodo: <strong style={{ color: '#00C853' }}>verificabile</strong>
                </li>
                <li style={{ fontSize: '1.2rem', marginTop: '1rem', background: '#e5f9e7', padding: '12px 20px', borderRadius: '12px', color: '#00C853', fontWeight: 800 }}>
                  📌 Numeri semplici. Ma veri.
                </li>
              </ul>
              <div style={{ textAlign: 'center', marginTop: '3rem' }}>
                <Image src="/assets/card_happy.png" alt="Investitore Soddisfatto" width={180} height={180} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* "Per chi è" Section */}
      <section style={{ background: '#fff', padding: '100px 0' }}>
        <div className="container">
          <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
            {/* Top Headline */}
            <h2 style={{ fontSize: '3.5rem', fontWeight: 900, color: '#1a1a1a', lineHeight: 1.1, marginBottom: '2rem', letterSpacing: '-1.5px' }}>
              Valuta il tuo consulente per i suoi rendimenti, non per la sua simpatia*
            </h2>

            <div style={{ display: 'flex', gap: '4rem', alignItems: 'flex-start' }}>
              {/* Left Column */}
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: '3rem', fontWeight: 900, color: '#00C853', lineHeight: 1.1, marginBottom: '1.5rem', letterSpacing: '-1px' }}>
                  Noi ti aiutiamo<br />a farlo.
                </h2>
                <p style={{ fontSize: '1.1rem', color: '#1a1a1a', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px' }}>
                  *capacità di persuasione
                </p>
              </div>

              {/* Right Column */}
              <div style={{ flex: 1, paddingTop: '20px' }}>
                <h3 style={{ fontSize: '1.8rem', fontWeight: 900, textTransform: 'uppercase', color: '#1a1a1a', marginBottom: '2.5rem', letterSpacing: '1px' }}>
                  PER CHI È iMieiInvestimenti.it
                </h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  <li style={{ fontSize: '1.4rem', marginBottom: '0.4rem', fontWeight: 850, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span>✓ Risparmiatori consapevoli</span>
                  </li>
                  <li style={{ fontSize: '1.4rem', marginBottom: '0.4rem', fontWeight: 850, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '10px', marginLeft: '45px' }}>
                    <span>✓ Investitori autonomi</span>
                  </li>
                  <li style={{ fontSize: '1.4rem', marginBottom: '0.4rem', fontWeight: 850, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '10px', marginLeft: '15px' }}>
                    <span>✓ Clienti bancari e private</span>
                  </li>
                  <li style={{ fontSize: '1.4rem', marginBottom: '0.4rem', fontWeight: 850, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '10px', marginLeft: '55px' }}>
                    <span>✓ Consulenti indipendenti</span>
                  </li>
                  <li style={{ fontSize: '1.4rem', fontWeight: 850, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '10px', marginLeft: '-15px' }}>
                    <span>✓ Chi vuole capire prima di fidarsi</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section style={{ background: '#fff', padding: '120px 0 160px', textAlign: 'center' }}>
        <div className="container">
          <div style={{ marginBottom: '100px' }}>
            <h2 style={{ fontSize: '2.2rem', fontWeight: 800, color: '#1a1a1a', lineHeight: 1.4, letterSpacing: '-0.5px' }}>
              Carica il tuo estratto conto<br />
              e scopri quanto hai davvero guadagnato (o perso)
            </h2>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '50px',
            flexWrap: 'wrap'
          }}>
            <h3 style={{
              fontSize: '5.5rem',
              fontWeight: 950,
              color: '#00C853',
              lineHeight: 0.9,
              margin: 0,
              letterSpacing: '-4px'
            }}>
              Carica il tuo<br />estratto conto.
            </h3>

            <Link href="/dashboard" style={{
              display: 'flex',
              alignItems: 'center',
              gap: '15px',
              background: '#00C853',
              color: '#fff',
              fontWeight: 950,
              padding: '30px 60px',
              borderRadius: '80px',
              fontSize: '1.8rem',
              textTransform: 'uppercase',
              textDecoration: 'none',
              boxShadow: '0 15px 40px rgba(0,200,83,0.3)',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              border: 'none',
              transform: 'translateY(10px)'
            }}>
              PROVALO ORA
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
