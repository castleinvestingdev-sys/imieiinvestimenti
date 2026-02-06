"use client"
import { useState, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { AreaChart, Area, XAxis, ResponsiveContainer } from 'recharts'

export default function HomePage() {
  const [patrimonio, setPatrimonio] = useState(100000)
  const [inputFocused, setInputFocused] = useState(false)
  const [inputRaw, setInputRaw] = useState('100000')

  const chartData = useMemo(() => {
    const p = patrimonio || 0
    const marketReturn = 0.07
    // Banca: commissioni annue 3% + sottoperformance 5% = 8% annuo, transazione 1% una tantum
    const bankAnnual = marketReturn - 0.03 - 0.05 // -1% netto
    const bankStart = p * (1 - 0.01) // -1% costi transazione iniziali
    // Efficiente: commissioni annue 0.3% + sottoperformance 0.5% = 0.8% annuo, transazione 0.1% una tantum
    const effAnnual = marketReturn - 0.003 - 0.005 // 6.2% netto
    const effStart = p * (1 - 0.001) // -0.1% costi transazione iniziali
    const data = []
    for (let i = 0; i <= 30; i++) {
      data.push({
        year: 2026 + i,
        banca: Math.round(bankStart * Math.pow(1 + bankAnnual, i)),
        efficiente: Math.round(effStart * Math.pow(1 + effAnnual, i)),
      })
    }
    return data
  }, [patrimonio])

  const finalBank = chartData[chartData.length - 1]?.banca || 0
  const finalEff = chartData[chartData.length - 1]?.efficiente || 0
  const finalDiff = finalEff - finalBank
  return (
    <>
      {/* Hero Section */}
      <section className="hero-section">
        <div className="container">
          <div className="hero-header">
            <h1 className="hero-title">
              I tuoi investimenti rendono davvero?
            </h1>
            <h2 className="hero-subtitle">
              La banca non te lo dice.<br />
              <span className="text-primary">Noi sì.</span>
            </h2>
          </div>

          <div className="hero-content-wrapper">
            {/* Left Column: Desc & List */}
            <div className="hero-left-col">
              <p className="hero-note">
                <span className="hero-brand">iMieiInvestimenti.it</span> ti dice:
              </p>

              <ul className="hero-list">
                <li><span className="hero-icon">📈</span> Performance reali</li>
                <li><span className="hero-icon">❌</span> Costi nascosti evidenti</li>
                <li><span className="hero-icon">📊</span> Numeri ricalcolabili da zero</li>
              </ul>
            </div>

            {/* Right Column: CTA */}
            <div className="hero-right-col">
              <h4 className="hero-cta-title">
                Ti basta caricare un PDF.
              </h4>
              <Link href="/discover" className="hero-btn">
                PROVALO ORA!
                <span className="hero-btn-icon">→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="section-padding" id="problem-section" style={{ background: '#f5f5f5' }}>
        <div className="container">
          <div className="flex-row-mobile">
            {/* Text Content */}
            <div style={{ flex: 1 }}>
              <span className="section-label" style={{ color: '#999', fontWeight: 700, fontSize: '2.8rem', letterSpacing: '0.05em' }}>
                IL PROBLEMA
              </span>
              <h2 className="section-title" style={{ marginTop: '1rem' }}>
                La banca <span style={{ color: '#e07a6a' }}>trattiene</span> gran parte dei tuoi guadagni.
              </h2>

              <p className="section-p" style={{ fontWeight: 700 }}>
                Le banche spesso non te lo dicono.
              </p>
              <p className="section-p" style={{ fontWeight: 700 }}>
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
      <section className="section-padding" style={{ background: '#f5f5f5' }}>
        <div className="container">
          <div style={{ borderBottom: '1px solid #d1d1d1', paddingBottom: '0.8rem', marginBottom: '2rem' }}>
            <span className="section-label" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: 0 }}>
              <span style={{ fontSize: '2rem' }}>🧠</span> PERCHÉ LE BANCHE NON SONO TRASPARENTI?
            </span>
          </div>

          <h2 className="section-title" style={{ marginBottom: '2.5rem' }}>
            Perché le banche guadagnano,<br />
            <span style={{ color: '#e07a6a' }}>con i tuoi soldi</span>.
          </h2>

          <div className="flex-row-mobile" style={{ alignItems: 'flex-start', gap: '4rem' }}>
            <div style={{ flex: 1.2 }}>
              <p style={{ fontWeight: 700, fontSize: '1rem', color: '#1d1d1f', marginBottom: '0.6rem' }}>
                Cosa ti nascondono:
              </p>
              <ul style={{ listStyle: 'disc', paddingLeft: '1.5rem', margin: '0 0 2rem 0' }}>
                <li style={{ fontSize: '1rem', fontWeight: 500, color: '#1d1d1f', marginBottom: '0.3rem' }}>Commissioni non evidenti</li>
                <li style={{ fontSize: '1rem', fontWeight: 500, color: '#1d1d1f', marginBottom: '0.3rem' }}>Performance non chiare</li>
                <li style={{ fontSize: '1rem', fontWeight: 500, color: '#1d1d1f', marginBottom: '0.3rem' }}>Alternative che ti fanno guadagnare di più</li>
              </ul>

              <p style={{ fontWeight: 600, fontSize: '1rem', color: '#1d1d1f' }}>
                → La banca ti propone SOLO gli strumenti su cui guadagna.
              </p>
            </div>

            <div style={{ flex: 0.6, display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
              <Image src="/assets/confused_investor.png" alt="Investitore Confuso" width={220} height={220} style={{ mixBlendMode: 'multiply' }} />
            </div>
          </div>

          <h3 style={{ textAlign: 'right', marginTop: '1.5rem', fontSize: '2.2rem', fontWeight: 900, lineHeight: 1.15, color: '#000' }}>
            Le banche guadagnano di<br />più da clienti &ldquo;inconsapevoli&rdquo;
          </h3>
        </div>
      </section>

      {/* Green Section (Solution) */}
      <section style={{ padding: '80px 0', background: 'linear-gradient(180deg, #e8f5e9 0%, #f1f8e9 100%)' }}>
        <div className="container">
          <div style={{ borderBottom: '1px solid rgba(0,0,0,0.12)', paddingBottom: '0.8rem', marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '2rem', fontWeight: 900, color: '#2e7d32', letterSpacing: '1px', margin: 0 }}>
              COSA FACCIAMO NOI
            </h2>
          </div>

          <h3 style={{ fontSize: '2.2rem', fontWeight: 900, color: '#000', marginBottom: '2rem' }}>
            Ricostruiamo tutto. Da zero.
          </h3>

          <div className="flex-row-mobile" style={{ alignItems: 'flex-start', gap: '4rem' }}>
            <div style={{ flex: 1.2 }}>
              <p style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1d1d1f', lineHeight: 1.5, marginBottom: '2rem' }}>
                Partiamo esclusivamente dai documenti ufficiali della tua banca e li trasformiamo in dati leggibili e ricalcolabili.
              </p>

              <p style={{ fontWeight: 700, fontSize: '1rem', color: '#1d1d1f', marginBottom: '0.6rem' }}>
                iMieiInvestimenti.it ti mostra:
              </p>
              <ul style={{ listStyle: 'disc', paddingLeft: '2rem', margin: '0 0 2.5rem 0' }}>
                <li style={{ fontSize: '1rem', fontWeight: 500, color: '#1d1d1f', marginBottom: '0.3rem' }}>Il tuo patrimonio</li>
                <li style={{ fontSize: '1rem', fontWeight: 500, color: '#1d1d1f', marginBottom: '0.3rem' }}>I tuoi guadagni</li>
                <li style={{ fontSize: '1rem', fontWeight: 500, color: '#1d1d1f', marginBottom: '0.3rem' }}>Le commissioni che hai pagato (anche quelle nascoste)</li>
                <li style={{ fontSize: '1rem', fontWeight: 500, color: '#1d1d1f', marginBottom: '0.3rem' }}>Performance reale, non dichiarata dalla banca</li>
              </ul>

              <p style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1d1d1f', fontStyle: 'italic' }}>
                Tutto quello che la banca non ha interesse a mostrarti.
              </p>
            </div>

            <div style={{ flex: 0.8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', textAlign: 'center', gap: '1.5rem', paddingTop: '8rem' }}>
              <h3 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#000', lineHeight: 1.3 }}>
                Ti basterà caricare l&apos;Estratto conto in formato PDF, al resto pensiamo noi*.
              </h3>

              <Link href="/discover" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', background: '#000', color: '#fff', fontWeight: 800, padding: '14px 32px', borderRadius: '6px', fontSize: '1rem', textTransform: 'uppercase', textDecoration: 'none', letterSpacing: '1px' }}>
                PROVALO ORA <span style={{ fontSize: '1.2rem' }}>→</span>
              </Link>

              <p style={{ fontSize: '0.85rem', color: '#666', margin: 0 }}>
                *I PDF verranno analizzati dal nostro software AI
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Simulation Section */}
      <section className="section-padding">
        <div className="container">
          {/* Header row */}
          <div style={{ maxWidth: '750px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
              <h2 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#000', margin: 0 }}>
                Fai la tua simulazione
              </h2>
              <input
                type="text"
                inputMode="numeric"
                placeholder="Patrimonio iniziale €"
                value={inputFocused ? inputRaw : (patrimonio ? patrimonio.toLocaleString('it-IT') + ' €' : '')}
                onFocus={() => {
                  setInputFocused(true)
                  setInputRaw(patrimonio ? String(patrimonio) : '')
                }}
                onBlur={() => {
                  setInputFocused(false)
                  const val = parseInt(inputRaw) || 0
                  setPatrimonio(val)
                }}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^\d]/g, '')
                  setInputRaw(val)
                  setPatrimonio(val ? parseInt(val) : 0)
                }}
                style={{ padding: '10px 20px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '1rem', width: '240px', textAlign: 'center', color: '#666' }}
              />
            </div>

            {/* Comparison Table */}
            <div style={{ marginBottom: '1.5rem' }}>
              {/* Column Headers */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}>
                <div />
                <h3 style={{ textAlign: 'center', fontWeight: 800, fontSize: '1.1rem', margin: 0 }}>Banca</h3>
                <h3 style={{ textAlign: 'center', fontWeight: 800, fontSize: '1.1rem', margin: 0 }}>Investimenti efficienti</h3>
              </div>

              {/* Rows */}
              {[
                { label: 'Commissioni annue', bank: '-3,00 %', efficient: '0,30 %' },
                { label: 'Commissioni transazione', bank: '-1,00 %', efficient: '0,10 %' },
                { label: 'Sottoperformance', bank: '-5,00%', efficient: '0,50 %' },
              ].map((row, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: '0.5rem', alignItems: 'center', marginBottom: '0.7rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end', fontSize: '0.9rem', fontWeight: 600, color: '#333' }}>
                    {row.label}
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', borderRadius: '50%', border: '1.5px solid #ccc', fontSize: '0.6rem', color: '#999' }}>i</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <span style={{ background: '#fef2f2', color: '#dc2626', padding: '6px 20px', borderRadius: '999px', fontWeight: 700, fontSize: '0.95rem', minWidth: '90px', textAlign: 'center' }}>{row.bank}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <span style={{ background: '#f0fdf4', color: '#1d1d1f', padding: '6px 20px', borderRadius: '999px', fontWeight: 700, fontSize: '0.95rem', minWidth: '90px', textAlign: 'center' }}>{row.efficient}</span>
                  </div>
                </div>
              ))}

            <p style={{ textAlign: 'center', fontSize: '0.85rem', color: '#bbb', marginTop: '1rem' }}>Fonte: analisi di mercato...</p>
            </div>
          </div>

          {/* Simulation Chart */}
          <div style={{ marginTop: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
              <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>Simulazione a</span>
              <span style={{ background: '#f5f5f5', padding: '8px 24px', borderRadius: '999px', fontWeight: 600, color: '#999', fontSize: '1rem' }}>30 anni</span>
            </div>

            <div style={{ background: '#f8f8f8', borderRadius: '16px', padding: '2rem 1rem 1rem', position: 'relative' }}>
              <ResponsiveContainer width="100%" height={350}>
                <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradEff" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00C853" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#00C853" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="gradBank" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#dc2626" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#dc2626" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#999' }} axisLine={{ stroke: '#eee' }} tickLine={false} interval={5} />
                  <Area type="monotone" dataKey="efficiente" stroke="#00C853" strokeWidth={2.5} fill="url(#gradEff)" />
                  <Area type="monotone" dataKey="banca" stroke="#dc2626" strokeWidth={2.5} fill="url(#gradBank)" />
                </AreaChart>
              </ResponsiveContainer>

              {patrimonio > 0 && (
                <>
                  <div style={{ position: 'absolute', right: '4rem', top: '20%', background: '#00C853', color: '#fff', padding: '8px 20px', borderRadius: '8px', fontWeight: 800, fontSize: '0.95rem' }}>
                    {finalEff.toLocaleString('it-IT')} €
                  </div>
                  <div style={{ position: 'absolute', right: '4rem', top: '50%', background: '#dc2626', color: '#fff', padding: '8px 20px', borderRadius: '8px', fontWeight: 800, fontSize: '0.95rem' }}>
                    -{finalDiff.toLocaleString('it-IT')} €
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Report Comparison Section */}
      <section className="section-padding">
        <div className="container">
          <div style={{ maxWidth: '950px', margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: '2.5rem', fontWeight: 900, color: '#000', marginBottom: '3.5rem', letterSpacing: '3px' }}>
            REPORT
          </h2>

          <div style={{ display: 'flex', gap: '4rem' }}>
            {/* Left: Con la banca */}
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#000', marginBottom: '2.5rem' }}>
                con la banca
              </h3>

              <p style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1d1d1f', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>✅</span> Capitale investito: 50.000 €
              </p>
              <p style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1d1d1f', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🔴</span> Commissioni: <span style={{ color: '#dc2626', fontStyle: 'italic', fontSize: '1.4rem' }}>?</span>
              </p>
              <p style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1d1d1f', marginBottom: '2.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🔴</span> Performance reale: <span style={{ color: '#dc2626', fontStyle: 'italic', fontSize: '1.4rem' }}>?</span>
              </p>

              <p style={{ fontSize: '1.3rem', fontWeight: 800, color: '#000', marginBottom: '3rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>❌</span> Non si sa nulla
              </p>

              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <Image src="/assets/confused_investor.png" alt="Investitore Confuso" width={260} height={260} style={{ mixBlendMode: 'multiply' }} />
              </div>
            </div>

            {/* Right: Con imieiinvestimenti.it */}
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#000', marginBottom: '2.5rem' }}>
                con <span style={{ color: '#00C853' }}>imieiinvestimenti.it</span> <span style={{ fontSize: '1.5rem' }}>📊</span>
              </h3>

              <p style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1d1d1f', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>✅</span> Capitale investito: 50.000 €
              </p>
              <p style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1d1d1f', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>✅</span> Commissioni totali: −500 €
              </p>
              <p style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1d1d1f', marginBottom: '2.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>✅</span> Performance reale: 3,75%
              </p>

              <p style={{ fontSize: '1.3rem', fontWeight: 800, color: '#000', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>📌</span> Numeri semplici. Ma veri.
              </p>
              <p style={{ fontSize: '1.2rem', fontWeight: 700, color: '#00C853', marginBottom: '3rem' }}>
                E scopri anche come guadagnare di più.
              </p>

              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <Image src="/assets/card_happy.png" alt="Investitore Soddisfatto" width={260} height={260} style={{ mixBlendMode: 'multiply' }} />
              </div>
            </div>
          </div>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section style={{ padding: '100px 0 120px', background: '#fff', textAlign: 'center' }}>
        <div className="container">
          <h2 style={{ fontSize: '2.2rem', fontWeight: 800, color: '#000', marginBottom: '2.5rem' }}>
            I tuoi soldi meritano chiarezza.
          </h2>

          <p style={{ fontSize: '1.6rem', fontWeight: 800, color: '#000', lineHeight: 1.6, marginBottom: '5rem' }}>
            Non grafici.<br />
            Non promesse.<br />
            Numeri verificabili.
          </p>

          <p style={{ fontSize: '1rem', fontWeight: 700, color: '#000', marginBottom: '5rem' }}>
            Carica il tuo estratto conto<br />
            e scopri quanto hai davvero guadagnato (o perso)
          </p>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.5rem' }}>
            <h3 style={{ fontSize: '2rem', fontWeight: 800, color: '#00C853', margin: 0 }}>
              Carica il tuo estratto conto.
            </h3>
            <Link href="/discover" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', background: '#00C853', color: '#fff', fontWeight: 800, padding: '14px 28px', borderRadius: '999px', fontSize: '1rem', textTransform: 'uppercase', textDecoration: 'none', whiteSpace: 'nowrap' }}>
              PROVALO ORA <span>→</span>
            </Link>
          </div>
        </div>
      </section>

      <style jsx>{`
        .hero-section {
          padding: 0;
          background: #fff;
        }
        .hero-header {
          max-width: 980px;
          margin: 0 auto;
        }
        .hero-title {
          font-size: 3.5rem;
          font-weight: 800;
          color: #121212;
          line-height: 1.05;
          letter-spacing: -1px;
          margin-bottom: 1rem;
        }
        .hero-subtitle {
          font-size: 2.2rem;
          font-weight: 700;
          color: #121212;
          line-height: 1.3;
          margin-bottom: 2.4rem;
        }
        .hero-flex {
          display: flex;
          gap: 3.5rem;
          max-width: 980px;
          margin: 0 auto;
          align-items: flex-end;
        }
        .hero-left { flex: 1.2; }
        .hero-right {
          flex: 0.8;
          text-align: right;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          padding-bottom: 6px;
        }
        .hero-note {
          font-size: 1rem;
          line-height: 1.4;
          color: #00C853;
          margin-bottom: 1.2rem;
          font-weight: 700;
        }
        .hero-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .hero-list li {
          font-size: clamp(1rem, 2.2vw, 1.2rem);
          font-weight: 700;
          margin-bottom: 0.85rem;
          display: flex;
          align-items: center;
          gap: 10px;
          color: #121212;
        }
        .hero-icon {
          font-size: 1.05rem;
          line-height: 1;
        }
        .hero-cta-title {
          font-size: 2.5rem;
          font-weight: 800;
          color: #121212;
          margin-bottom: 0.9rem;
          white-space: nowrap;
        }
        :global(.hero-btn) {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          background: #00C853;
          color: #fff;
          font-weight: 900;
          padding: 10px 18px 10px 18px;
          border-radius: 999px;
          font-size: 0.9rem;
          text-transform: uppercase;
          text-decoration: none;
          box-shadow: 0 8px 18px rgba(0, 0, 0, 0.12);
          transition: all 0.3s ease;
        }
        :global(.hero-btn-icon) {
          width: 26px;
          height: 26px;
          border-radius: 50%;
          background: #fff;
          color: #00C853;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 0.95rem;
          font-weight: 900;
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
          .hero-section { padding: 90px 0 60px; }
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
          :global(.hero-btn) {
            padding: 10px 18px;
            font-size: 0.9rem;
          }
          .green-btn, .cta-btn-large {
            padding: 15px 40px;
            font-size: 1.2rem;
          }
          .t-1, .t-2, .t-3, .t-4, .t-5 { margin-left: 0; }
          .flip-mobile { flex-direction: column-reverse; }
        }

        @media (max-width: 640px) {
          .hero-section {
            padding: 80px 0 50px !important;
          }
          .hero-title {
            font-size: 2rem;
            margin-bottom: 1rem;
          }
          .hero-subtitle {
            font-size: 1.4rem;
            margin-bottom: 2.5rem;
          }
          .hero-note {
            font-size: 1rem;
          }
          .hero-list li {
            font-size: 0.95rem;
          }
          .hero-cta-title {
            font-size: 1.4rem;
          }
          :global(.hero-btn) {
            width: 100%;
            padding: 12px 18px;
            font-size: 0.95rem;
            text-align: center;
            justify-content: center;
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
