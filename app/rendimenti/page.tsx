'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function RendimentiPage() {
    const [period, setPeriod] = useState('1m')
    const [geo, setGeo] = useState('world')

    const sectors = [
        { id: 'tech', icon: '🖥', name: 'Tech' },
        { id: 'software', icon: '💾', name: 'Software' },
        { id: 'semi', icon: '🔌', name: 'Semiconduttori' },
        { id: 'cyber', icon: '🔒', name: 'Cybersecurity' },
        { id: 'ai', icon: '🤖', name: 'AI & Big Data' },
        { id: 'energy', icon: '⚡', name: 'Energia' },
        { id: 'industry', icon: '🏭', name: 'Industria' },
        { id: 'auto', icon: '🚗', name: 'Automotive' },
        { id: 'health', icon: '🏥', name: 'Healthcare' },
        { id: 'finance', icon: '🏦', name: 'Finanza' },
    ]

    const getReturn = (periodId: string, geoId: string, sectorId: string) => {
        const periodRates: Record<string, number> = { '1m': 1.5, '3m': 4, '6m': 8, '1y': 12, '3y': 35, '5y': 60, '10y': 150 }
        const geoMult: Record<string, number> = { 'world': 1, 'usa': 1.2, 'eu': 0.8, 'it': 0.7 }
        const sectorMult: Record<string, number> = {
            'tech': 1.3, 'software': 1.4, 'semi': 1.5, 'cyber': 1.3, 'ai': 1.6,
            'energy': 0.9, 'industry': 0.8, 'auto': 0.7, 'health': 0.9, 'finance': 0.85
        }

        const base = periodRates[periodId] || 10
        const mult = (geoMult[geoId] || 1) * (sectorMult[sectorId] || 1)
        const seed = periodId.length + geoId.length + sectorId.length
        const noise = (seed % 10) / 10 + 0.9

        return `+${(base * mult * noise).toFixed(2)} %`
    }

    return (
        <>
            <style jsx>{`
        .page-header {
          background: linear-gradient(180deg, #fff 0%, #f4f6f8 100%);
          padding: 100px 0 60px;
          text-align: center;
        }
        .page-header h1 {
          font-size: 3rem;
          font-weight: 900;
          margin-bottom: 1rem;
        }
        .filter-tag {
          border: none;
          background: #eee;
          color: #666;
          padding: 8px 18px;
          border-radius: 50px;
          font-weight: 700;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .filter-tag:hover {
          background: #ddd;
          color: #333;
        }
        .filter-tag.active {
          background: #00C853 !important;
          color: white !important;
        }
        .sector-pill {
          background: #f0fdf4; 
          color: #1a1a1a;
          border: 1px solid #dcfce7;
          padding: 10px 20px;
          border-radius: 12px;
          font-weight: 700;
          font-size: 0.9rem;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          min-width: 180px;
          justify-content: space-between;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .sector-pill:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,200,83,0.15);
          border-color: #00C853;
        }
        .sector-value {
          color: #00C853;
          font-weight: 900;
          font-size: 1rem;
        }
        .comparison-row {
          display: grid;
          grid-template-columns: 2fr 1.5fr 1.5fr 1.5fr 1.5fr;
          gap: 1rem;
          padding: 1rem 1.5rem;
          align-items: center;
          border-bottom: 1px solid #eee;
        }
        .comparison-header {
          background: #1e293b;
          color: white;
          font-weight: 600;
          font-size: 0.875rem;
        }
        .comparison-row.highlight {
          background: #f0fdf4;
        }
        .comparison-row.danger {
          background: #fff5f5;
          font-weight: 600;
        }
      `}</style>

            {/* Header */}
            <section className="page-header">
                <div className="container">
                    <h1>Rendimenti di Mercato</h1>
                    <p style={{ fontSize: '1.2rem', color: '#666' }}>Confronta i tuoi investimenti con i benchmark di mercato</p>
                </div>
            </section>

            {/* Content */}
            <section style={{ padding: '60px 0', background: '#fff' }}>
                <div className="container">
                    <div style={{ marginBottom: '3rem' }}>
                        <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '1rem' }}>Perché il Confronto con il Mercato è Fondamentale</h2>
                        <p style={{ fontSize: '1.1rem', color: '#666', maxWidth: '800px' }}>
                            Non basta sapere se il tuo portafoglio è in guadagno o in perdita. È essenziale confrontare i tuoi rendimenti con quelli del mercato per capire se la tua strategia di investimento sta davvero funzionando.
                        </p>
                    </div>

                    {/* Interactive Section */}
                    <div style={{ marginBottom: '4rem' }}>
                        <h2 style={{ fontSize: '1.8rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: '1.5rem' }}>SCOPRI I RENDIMENTI DI MERCATO NEL TEMPO...</h2>

                        {/* Period Filter */}
                        <div style={{ marginBottom: '1.5rem' }}>
                            <span style={{ fontWeight: 800, display: 'block', marginBottom: '0.5rem' }}>Periodo:</span>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {[
                                    { id: '1m', label: 'Ultimo mese' },
                                    { id: '3m', label: 'Ultimi 3 mesi' },
                                    { id: '6m', label: 'Ultimi 6 mesi' },
                                    { id: '1y', label: 'Ultimo anno' },
                                    { id: '3y', label: 'Ultimi 3 anni' },
                                    { id: '5y', label: 'Ultimi 5 anni' },
                                    { id: '10y', label: 'Ultimi 10 anni' },
                                ].map(p => (
                                    <button
                                        key={p.id}
                                        className={`filter-tag ${period === p.id ? 'active' : ''}`}
                                        onClick={() => setPeriod(p.id)}
                                    >
                                        {p.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Geo Filter */}
                        <div style={{ marginBottom: '2rem' }}>
                            <span style={{ fontWeight: 800, display: 'block', marginBottom: '0.5rem' }}>Area Geografica:</span>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {[
                                    { id: 'world', label: '🌍 World' },
                                    { id: 'usa', label: '🇺🇸 Nordamerica' },
                                    { id: 'eu', label: '🇪🇺 Europa' },
                                    { id: 'it', label: '🇮🇹 Italy' },
                                ].map(g => (
                                    <button
                                        key={g.id}
                                        className={`filter-tag ${geo === g.id ? 'active' : ''}`}
                                        onClick={() => setGeo(g.id)}
                                    >
                                        {g.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Sectors Grid */}
                        <div>
                            <span style={{ fontWeight: 800, display: 'block', marginBottom: '1rem' }}>Rendimenti per Settore:</span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px' }}>
                                {sectors.map(s => (
                                    <div key={s.id} className="sector-pill">
                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                            <span style={{ fontSize: '1.1rem', marginRight: '5px' }}>{s.icon}</span>
                                            <span>{s.name}</span>
                                        </div>
                                        <span className="sector-value">{getReturn(period, geo, s.id)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Comparison Example */}
                    <div style={{ marginTop: '4rem', padding: '2rem', background: '#f8f9fa', borderRadius: '12px' }}>
                        <h2 style={{ textAlign: 'center', marginBottom: '2rem' }}>Esempio di Confronto</h2>
                        <div style={{ background: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                            <div className="comparison-row comparison-header">
                                <div>Scenario</div>
                                <div>Investimento Iniziale</div>
                                <div>Rendimento Annuo</div>
                                <div>Valore dopo 10 anni</div>
                                <div>Guadagno</div>
                            </div>
                            <div className="comparison-row">
                                <div><strong>Il tuo portafoglio</strong></div>
                                <div>€100.000</div>
                                <div style={{ color: '#d32f2f' }}>+4.5%</div>
                                <div>€155.297</div>
                                <div style={{ color: '#d32f2f' }}>+€55.297</div>
                            </div>
                            <div className="comparison-row highlight">
                                <div><strong>MSCI World (mercato)</strong></div>
                                <div>€100.000</div>
                                <div style={{ color: '#00C853' }}>+10.2%</div>
                                <div>€264.844</div>
                                <div style={{ color: '#00C853' }}>+€164.844</div>
                            </div>
                            <div className="comparison-row danger">
                                <div><strong>Differenza</strong></div>
                                <div>-</div>
                                <div style={{ color: '#d32f2f' }}>-5.7%</div>
                                <div style={{ color: '#d32f2f' }}>-€109.547</div>
                                <div style={{ color: '#d32f2f' }}>-€109.547</div>
                            </div>
                        </div>
                        <p style={{ marginTop: '1.5rem', padding: '1rem', background: 'white', borderLeft: '4px solid #d32f2f', borderRadius: '4px' }}>
                            <strong>In questo esempio</strong>, un portafoglio che rende il 4.5% annuo sembra positivo, ma confrontato con il mercato (10.2%) ha perso oltre €100.000 in opportunità di guadagno in 10 anni.
                        </p>
                    </div>

                    {/* Why it Matters */}
                    <div style={{ marginTop: '4rem' }}>
                        <h2 style={{ textAlign: 'center', marginBottom: '2rem' }}>Perché è Importante</h2>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '2rem' }}>
                            <div style={{ textAlign: 'center', padding: '2rem' }}>
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎯</div>
                                <h4 style={{ fontSize: '1.125rem', marginBottom: '0.75rem' }}>Valuta la Performance Reale</h4>
                                <p style={{ fontSize: '0.95rem', color: '#666' }}>Un guadagno del 5% può sembrare buono, ma se il mercato ha reso il 12%, hai perso opportunità.</p>
                            </div>
                            <div style={{ textAlign: 'center', padding: '2rem' }}>
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💡</div>
                                <h4 style={{ fontSize: '1.125rem', marginBottom: '0.75rem' }}>Scopri i Costi Nascosti</h4>
                                <p style={{ fontSize: '0.95rem', color: '#666' }}>Se il tuo portafoglio sottoperforma costantemente, probabilmente le commissioni stanno erodendo i rendimenti.</p>
                            </div>
                            <div style={{ textAlign: 'center', padding: '2rem' }}>
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📈</div>
                                <h4 style={{ fontSize: '1.125rem', marginBottom: '0.75rem' }}>Prendi Decisioni Informate</h4>
                                <p style={{ fontSize: '0.95rem', color: '#666' }}>Confrontare con il mercato ti permette di capire se la tua strategia funziona o va cambiata.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section style={{ padding: '80px 0', background: '#f8f9fa', textAlign: 'center' }}>
                <div className="container">
                    <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '1rem' }}>Scopri come si confronta il tuo portafoglio</h2>
                    <p style={{ color: '#666', marginBottom: '2rem' }}>Analizza i tuoi investimenti e confrontali con i benchmark di mercato</p>
                    <Link href="/dashboard" className="btn btn-primary btn-lg" style={{ background: '#00C853', color: 'white', padding: '16px 40px', borderRadius: '50px', fontWeight: 800, textDecoration: 'none', display: 'inline-block' }}>
                        INIZIA L&apos;ANALISI
                    </Link>
                </div>
            </section>
        </>
    )
}
