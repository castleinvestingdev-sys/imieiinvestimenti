'use client'

import React from 'react'
import Link from 'next/link'
import {
    AlertTriangle,
    ArrowRight,
    Search,
    MinusCircle,
    ShieldAlert,
    Info,
    Wallet,
    Landmark,
    TrendingDown,
    FileSearch,
    Percent
} from 'lucide-react'
import './commissioni.css'

export default function CommissioniPage() {
    return (
        <div className="co-page">
            {/* --- 1. HERO SECTION --- */}
            <section className="co-hero">
                <div className="co-container">
                    <h1>
                        Scopri come funzionano le commissioni bancarie.<br />
                        <span>E come puoi scovarle. Ed evitarle.</span>
                    </h1>

                    <div className="co-hero-cta">
                        <p>Carica il tuo estratto conto.</p>
                        <Link href="/dashboard" className="co-btn-primary">
                            PROVALO ORA →
                        </Link>
                    </div>
                </div>
            </section>

            {/* --- 2. OVERVIEW: THE BANK'S INCOME --- */}
            <section className="co-section">
                <div className="co-container">
                    <div className="co-section-title">
                        <h2>Come guadagna la banca:</h2>
                    </div>

                    <div className="co-grid">
                        <div className="co-card">
                            <div className="co-card-num danger">1</div>
                            <p className="context">Ogni volta che compri o vendi titoli</p>
                            <h3>Commissioni di Transazione</h3>
                            <div className="co-badge danger">NON LE TROVI SULL'ESTRATTO CONTO</div>
                        </div>

                        <div className="co-card">
                            <div className="co-card-num danger">2</div>
                            <p className="context">Ogni giorno in cui hai in portafoglio i titoli</p>
                            <h3>Commissioni di Gestione Fondi</h3>
                            <div className="co-badge danger" style={{ marginBottom: '12px' }}>→ REBATES</div>
                            <div className="co-badge danger">NON LE TROVI SULL'ESTRATTO CONTO</div>
                        </div>

                        <div className="co-card">
                            <div className="co-card-num warning">3</div>
                            <p className="context">Consulenza diretta</p>
                            <h3>Commissioni di Gestione</h3>
                            <div className="co-badge warning">LE TROVI NELL'ESTRATTO CONTO LIQUIDITÀ</div>
                        </div>

                        <div className="co-card">
                            <div className="co-card-num warning">4</div>
                            <p className="context">Addebiti vari</p>
                            <h3>Costi di Tenuta e Servizi</h3>
                            <div className="co-badge warning">LE TROVI NELL'ESTRATTO CONTO LIQUIDITÀ</div>
                        </div>
                    </div>

                    <div style={{ textAlign: 'center', marginTop: '100px' }}>
                        <p style={{ fontSize: '1.5rem', fontWeight: 900, lineHeight: 1.4 }}>
                            Il problema non è solo pagare delle commissioni.<br />
                            <span style={{ color: 'var(--text-gray)', fontWeight: 500 }}>Il problema è non sapere quanto stai pagando davvero.</span>
                        </p>
                    </div>
                </div>
            </section>

            {/* --- 3. DETAIL 1: TRANSACTION FEES --- */}
            <section className="co-section" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="co-container">
                    <div className="co-detail-header">
                        <div className="co-detail-badge">1</div>
                        <h2>COMMISSIONI DI TRANSAZIONE</h2>
                    </div>

                    <p className="co-detail-desc">
                        Ogni volta che acquisti o vendi titoli ti viene sottratta una cifra dalla liquidità che <strong>NON corrisponde</strong> con quella che entra nel tuo dossier titoli.
                    </p>

                    <div className="co-table-visual">
                        <div className="co-table-grid">
                            <div className="co-table-col">
                                <span className="co-table-tag">Liquidità</span>
                                <div className="co-table-header-row" style={{ gridTemplateColumns: '100px 120px 1fr' }}>
                                    <span>Data</span><span>Importo</span><span>Causale</span>
                                </div>
                                <div className="co-table-data-row" style={{ gridTemplateColumns: '100px 120px 1fr' }}>
                                    <span>01.01.2025</span>
                                    <span style={{ color: 'var(--danger)' }}>-25.500 €</span>
                                    <span>Acquisto Fondo XXX</span>
                                </div>
                            </div>

                            <div className="co-table-col" style={{ flex: 1.5 }}>
                                <span className="co-table-tag">Dossier Titoli (Portafoglio)</span>
                                <div className="co-table-header-row" style={{ gridTemplateColumns: '100px 100px 100px 80px 120px' }}>
                                    <span>Data</span><span>ISIN</span><span>Titolo</span><span>NAV</span><span>Importo Totale</span>
                                </div>
                                <div className="co-table-data-row" style={{ gridTemplateColumns: '100px 100px 100px 80px 120px' }}>
                                    <span>01.01.2025</span>
                                    <span>IT123...</span>
                                    <span>FONDO ATTIVO</span>
                                    <span>100 €</span>
                                    <span style={{ color: 'var(--primary)' }}>25.000 €</span>
                                </div>
                            </div>
                        </div>

                        <div className="co-comparison-arrow">
                            <div className="co-arrow-connector">
                                <div className="co-arrow-label">Commissioni 500€ (2 %)</div>
                            </div>
                            <p style={{ marginTop: '40px', color: 'var(--danger)', fontWeight: 900, fontSize: '1.5rem' }}>
                                Non vengono esplicitate da nessuna parte.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* --- 4. DETAIL 2: MANAGEMENT FEES & REBATES --- */}
            <section className="co-section" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="co-container">
                    <div className="co-detail-header">
                        <div className="co-detail-badge">2</div>
                        <h2>COMMISSIONI DI GESTIONE (FONDI)</h2>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '80px', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontSize: '1.3rem', lineHeight: 1.6, color: 'var(--text-gray)' }}>
                                <p style={{ fontWeight: 900, marginBottom: '20px', color: 'var(--text-dark)', fontSize: '1.8rem', letterSpacing: '-1px' }}>Sono le più subdole.</p>
                                <ul style={{ listStyle: 'none', padding: 0 }}>
                                    <li style={{ marginBottom: '16px', display: 'flex', gap: '12px' }}><MinusCircle className="text-danger" /> Tu paghi il fondo (senza accorgertene)</li>
                                    <li style={{ marginBottom: '16px', display: 'flex', gap: '12px' }}><Search className="text-danger" /> Il fondo paga la banca (tu non lo sai)</li>
                                    <li style={{ marginBottom: '16px', display: 'flex', gap: '12px' }}><ShieldAlert className="text-danger" /> È il più grosso conflitto di interessi</li>
                                </ul>
                                <p style={{ marginTop: '40px', fontSize: '2.5rem', fontWeight: 900, color: 'var(--text-dark)', lineHeight: 1.1, letterSpacing: '-2px' }}>
                                    Questa non è consulenza.<br /><span style={{ color: 'var(--danger)' }}>È truffa.</span>
                                </p>
                            </div>
                        </div>

                        <div className="co-conflict-box">
                            <h3 style={{ fontWeight: 900, marginBottom: '40px', fontSize: '1.2rem', textTransform: 'uppercase' }}>Il Ciclo del Conflitto</h3>
                            <svg width="100%" height="auto" viewBox="0 0 440 250" style={{ overflow: 'visible', maxWidth: '440px' }}>
                                <defs>
                                    <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                                        <path d="M0,0 L0,6 L9,3 z" fill="#333" />
                                    </marker>
                                </defs>
                                <path d="M70 180 Q 80 80 170 50" fill="none" stroke="#ccc" strokeWidth="2" strokeDasharray="4,4" markerEnd="url(#arrow)" />
                                <path d="M230 50 Q 320 80 330 180" fill="none" stroke="var(--danger)" strokeWidth="4" markerEnd="url(#arrow)" />
                                <path d="M300 200 L 110 200" fill="none" stroke="var(--text-dark)" strokeWidth="2" markerEnd="url(#arrow)" />
                                <g transform="translate(200, 40)">
                                    <circle cx="0" cy="0" r="30" fill="white" stroke="var(--text-dark)" strokeWidth="2" />
                                    <text x="0" y="6" textAnchor="middle" fontSize="14" fontWeight="800">🏛️</text>
                                </g>
                                <g transform="translate(60, 200)">
                                    <circle cx="0" cy="0" r="30" fill="white" stroke="var(--text-dark)" strokeWidth="2" />
                                    <text x="0" y="6" textAnchor="middle" fontSize="14" fontWeight="800">👤</text>
                                </g>
                                <g transform="translate(340, 200)">
                                    <circle cx="0" cy="0" r="35" fill="var(--text-dark)" />
                                    <text x="0" y="8" textAnchor="middle" fontSize="18" fontWeight="800">🏦</text>
                                </g>
                                <text x="275" y="110" fill="var(--danger)" fontWeight="900" fontSize="12" textAnchor="middle">REBATES</text>
                            </svg>
                        </div>
                    </div>

                    <div style={{ marginTop: '60px', padding: '32px', background: '#f8fafc', borderRadius: '24px', display: 'flex', gap: '20px', alignItems: 'center' }}>
                        <Info className="text-gray" />
                        <p style={{ fontSize: '0.95rem', color: 'var(--text-gray)' }}>
                            <strong>KID (Key Information Document)</strong>: è il documento che contiene le informazioni che il fondo e i consulenti sono tenuti per legge a dare agli investitori. È lì che si nascondono i costi reali.
                        </p>
                    </div>
                </div>
            </section>

            {/* --- 5. POINT 3 & 4: ADDEBITI VARI --- */}
            <section className="co-section" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="co-container">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '60px' }}>
                        <div>
                            <div className="co-detail-header">
                                <div className="co-detail-badge" style={{ background: 'var(--warning)' }}>3</div>
                                <h2>CONSULENZA DIRETTA</h2>
                            </div>
                            <p style={{ fontSize: '1.2rem', color: 'var(--text-gray)', lineHeight: 1.6 }}>
                                Spesso la banca applica una <span style={{ color: 'var(--danger)', fontWeight: 800 }}>fee diretta</span> mensile o trimestrale per il servizio di consulenza.
                                Questa è l'unica che trovi chiaramente sull'estratto conto della liquidità.
                            </p>
                        </div>

                        <div>
                            <div className="co-detail-header" style={{ justifyContent: 'flex-end' }}>
                                <h2 style={{ textAlign: 'right' }}>ADDEBITI VARI</h2>
                                <div className="co-detail-badge" style={{ background: 'var(--warning)' }}>4</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <p style={{ fontSize: '1.2rem', color: 'var(--text-gray)', lineHeight: 1.6, marginBottom: '24px' }}>
                                    Costi fissi che erodono il tuo patrimonio ogni mese:
                                </p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'flex-end' }}>
                                    <span style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--danger)' }}>Canone Conto</span>
                                    <span style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--danger)' }}>Tenuta Dossier Titoli</span>
                                    <span style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--danger)' }}>Spese Invio Documenti</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="co-special-box" style={{ marginTop: '120px' }}>
                        <p>
                            Una vera banca non ti addebita le spese per il conto corrente,<br />
                            al contrario ti paga un <span>TASSO ATTIVO</span>.
                        </p>
                    </div>
                </div>
            </section>

            {/* --- FINAL CTA --- */}
            <section className="co-final-cta">
                <div className="co-container">
                    <h2>Smetti di regalare soldi.</h2>
                    <p style={{ fontSize: '1.25rem', color: 'var(--text-gray)', marginBottom: '48px', maxWidth: '600px', margin: '0 auto 48px' }}>
                        Analizziamo i tuoi documenti bancari e ti mostriamo ogni singolo centesimo che ti viene sottratto.
                    </p>
                    <Link href="/dashboard" className="co-btn-primary" style={{ padding: '24px 64px', fontSize: '1.3rem' }}>
                        ANALIZZA IL MIO PORTAFOGLIO GRATIS →
                    </Link>
                </div>
            </section>
        </div>
    )
}
