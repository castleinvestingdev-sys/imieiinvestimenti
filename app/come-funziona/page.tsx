'use client'

import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import './come-funziona.css'

export default function ComeFunzionaPage() {
    return (
        <div className="cf-page">
            {/* --- HERO: SNAKE FLOW --- */}
            <section className="cf-hero-snake">
                <div className="cf-container">
                    <h1 style={{ letterSpacing: '-1px', fontSize: '2.5rem', fontWeight: 800 }}>Come funziona <span>imieiinvestimenti.it</span></h1>

                    <div className="cf-snake-visual">
                        <div className="cf-snake-step step-1">1. Carichi i documenti</div>

                        <div className="cf-snake-arrow a-1-2">
                            <svg width="120" height="70" viewBox="0 0 120 70" fill="none">
                                <path d="M10 10C60 10 110 20 110 60" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" />
                                <path d="M100 50L110 60L120 50" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>

                        <div className="cf-snake-step step-2">2. Noi li traduciamo</div>

                        <div className="cf-snake-arrow a-2-3">
                            <svg width="120" height="70" viewBox="0 0 120 70" fill="none">
                                <path d="M10 10C60 10 110 20 110 60" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" />
                                <path d="M100 50L110 60L120 50" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>

                        <div className="cf-snake-step step-3">3. Ti restituiamo i numeri</div>

                        <div className="cf-snake-arrow a-3-4">
                            <svg width="120" height="70" viewBox="0 0 120 70" fill="none">
                                <path d="M10 10C60 10 110 20 110 60" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" />
                                <path d="M100 50L110 60L120 50" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>

                        <div className="cf-snake-step step-4">4. Investi consapevolmente</div>
                    </div>

                    <div className="cf-cta-bar">
                        <span className="cf-cta-text" style={{ color: '#00C853' }}>Carica il tuo estratto conto.</span>
                        <Link href="/discover" className="cf-btn-pill">
                            PROVALO ORA →
                        </Link>
                    </div>
                </div>
            </section>

            {/* --- STEP 1: CARICA --- */}
            <section className="cf-section bg-alt" style={{ padding: '60px 0' }}>
                <div className="cf-container">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
                        <div className="cf-step-circle" style={{ margin: 0 }}>1</div>
                        <h2 style={{ margin: 0, fontSize: '2rem', fontWeight: 800, letterSpacing: 'normal' }}>Carichi i documenti</h2>
                    </div>
                    <p className="cf-step-desc" style={{ marginBottom: '40px', fontSize: '1rem', fontWeight: 500 }}>
                        Carichi gli estratti conto e i rendiconti che ricevi dalla banca.<br />
                        Non serve capire dove guardare: li conosciamo già noi.
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '60px', maxWidth: '800px', margin: '0 auto' }}>
                        <div style={{ textAlign: 'center' }}>
                            <Image
                                src="/document-premium.png"
                                alt="Conto Corrente"
                                width={110}
                                height={132}
                                style={{ margin: '0 auto 16px', display: 'block', mixBlendMode: 'multiply' }}
                            />
                            <h3 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '16px' }}>Conto corrente</h3>
                            <ul style={{ listStyle: 'none', padding: 0, textAlign: 'left', display: 'inline-block' }}>
                                <li style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '6px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <span>👉</span> Interessi attivi
                                </li>
                                <li style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '6px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <span>👉</span> Interessi passivi
                                </li>
                                <li style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '6px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <span>👉</span> Dividendi
                                </li>
                                <li style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '6px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <span>👉</span> Cedole
                                </li>
                                <li style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '6px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <span>👉</span> Commissioni...
                                </li>
                            </ul>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <Image
                                src="/document-premium.png"
                                alt="Dossier Titoli"
                                width={110}
                                height={132}
                                style={{ margin: '0 auto 16px', display: 'block', mixBlendMode: 'multiply' }}
                            />
                            <h3 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '16px' }}>Dossier Titoli</h3>
                            <ul style={{ listStyle: 'none', padding: 0, textAlign: 'left', display: 'inline-block' }}>
                                <li style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '6px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <span>👉</span> Performance
                                </li>
                                <li style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '6px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <span>👉</span> Asset Allocation
                                </li>
                                <li style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '6px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <span>👉</span> Movimenti
                                </li>
                            </ul>
                        </div>
                    </div>

                    <div style={{ textAlign: 'center', marginTop: '50px' }}>
                        <p style={{ fontSize: '1.1rem', fontWeight: 700 }}>Per un&apos;analisi completa caricali entrambi</p>
                    </div>
                </div>
            </section>

            {/* --- STEP 2: TRADUZIONE --- */}
            <section className="cf-section">
                <div className="cf-container">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
                        <div className="cf-step-circle" style={{ margin: 0 }}>2</div>
                        <h2 style={{ margin: 0, fontSize: '2rem', fontWeight: 800, letterSpacing: 'normal' }}>Noi li traduciamo</h2>
                    </div>
                    <p style={{ fontSize: '1.05rem', fontWeight: 600, color: '#1d1d1f', lineHeight: 1.5, marginBottom: '0' }}>
                        Analizziamo i documenti, li normalizziamo e li rendiamo leggibili e confrontabili.<br />
                        Niente stime, niente interpretazioni arbitrarie: solo dati reali.
                    </p>

                    <div style={{ marginTop: '50px', display: 'flex', justifyContent: 'center' }}>
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                            <li style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '6px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <span>👉</span> Uniamo ciò che la banca ti manda separato
                            </li>
                            <li style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '6px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <span>👉</span> Ordiniamo ciò che è sparso
                            </li>
                            <li style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '6px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <span>👉</span> Evidenziamo ciò che conta davvero
                            </li>
                        </ul>
                    </div>
                </div>
            </section>

            {/* --- STEP 3: NUMERI --- */}
            <section className="cf-section bg-alt">
                <div className="cf-container">
                    <div className="cf-step-circle">3</div>
                    <h2 className="cf-step-title">Ti restituiamo i numeri</h2>
                    <p className="cf-step-desc">
                        In un’unica vista hai ciò che serve davvero per controllare i tuoi investimenti in modo professionale:
                    </p>

                    <div style={{ marginTop: "60px" }}>
                        <ul className="cf-pointer-list">
                            <li className="cf-pointer-item large" style={{ display: 'flex', gap: '30px', marginBottom: '40px', whiteSpace: 'nowrap', alignItems: 'baseline' }}>
                                <span style={{ fontSize: '2.5rem' }}>👉</span>
                                <strong style={{ minWidth: '280px', fontSize: '2.5rem' }}>Rendimento lordo</strong>
                                <span style={{ display: 'flex', alignItems: 'baseline', gap: '15px' }}>
                                    <span style={{ fontSize: '2rem', fontWeight: 900 }}>→</span>
                                    <span style={{ fontWeight: 400, fontSize: '2rem' }}>quanto ha prodotto il portafoglio</span>
                                </span>
                            </li>
                            <li className="cf-pointer-item large" style={{ display: 'flex', gap: '30px', marginBottom: '40px', whiteSpace: 'nowrap', alignItems: 'baseline' }}>
                                <span style={{ fontSize: '2.5rem' }}>👉</span>
                                <strong style={{ minWidth: '280px', fontSize: '2.5rem' }}>Benchmark</strong>
                                <span style={{ display: 'flex', alignItems: 'baseline', gap: '15px' }}>
                                    <span style={{ fontSize: '2rem', fontWeight: 900 }}>→</span>
                                    <span style={{ fontWeight: 400, fontSize: '2rem' }}>come sarebbe andata con un’alternativa di mercato</span>
                                </span>
                            </li>
                            <li className="cf-pointer-item large" style={{ display: 'flex', gap: '30px', marginBottom: '40px', whiteSpace: 'nowrap', alignItems: 'baseline' }}>
                                <span style={{ fontSize: '2.5rem' }}>👉</span>
                                <strong style={{ minWidth: '280px', fontSize: '2.5rem' }}>Rendimento netto</strong>
                                <span style={{ display: 'flex', alignItems: 'baseline', gap: '15px' }}>
                                    <span style={{ fontSize: '2rem', fontWeight: 900 }}>→</span>
                                    <span style={{ fontWeight: 400, fontSize: '2rem' }}>quanto ti resta dopo costi e commissioni</span>
                                </span>
                            </li>
                        </ul>
                    </div>

                    <div style={{ textAlign: 'center', marginTop: '120px' }}>
                        <p style={{ fontSize: '4.5rem', fontWeight: 1000, letterSpacing: '-3px' }}>Tutto il resto è rumore.</p>
                    </div>
                </div>
            </section>

            {/* --- STEP 4: INVESTI --- */}
            <section className="cf-section">
                <div className="cf-container">
                    <div className="cf-step-circle">4</div>
                    <h2 className="cf-step-title">Investi consapevolmente</h2>
                    <p className="cf-step-desc">
                        Niente tabelle infinite o note a piè pagina illeggibili.
                        Vedi subito la verità:
                    </p>

                    <ul style={{ listStyle: 'none', padding: 0, fontSize: '2.5rem', fontWeight: 900, letterSpacing: '-1.5px', lineHeight: 1.4, marginBottom: '60px' }}>
                        <li>• il rendimento è coerente</li>
                        <li>• i costi stanno erodendo valore</li>
                        <li>• il risultato è migliore o peggiore del mercato</li>
                    </ul>

                    <div className="cf-step4-visual">
                        <div className="cf-arrow-down-right">
                            <svg viewBox="0 0 120 120" fill="none">
                                <path d="M20 20C40 60 70 90 100 90" stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round" />
                                <path d="M85 80L100 90L85 100" stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <div className="cf-step4-success">
                            Migliori il tuo portafoglio
                        </div>
                    </div>
                </div>
            </section>

            {/* --- TRUST: WHAT WE DON'T DO --- */}
            <section className="cf-no-section bg-alt">
                <div className="cf-container">
                    <h2 className="cf-no-title">❌ Cosa non facciamo</h2>
                    <p className="cf-no-lead">Per essere chiari fin da subito:</p>

                    <ul className="cf-no-list">
                        <li className="cf-no-item">
                            <span className="cf-no-icon">❌</span>
                            Non vendiamo prodotti finanziari
                        </li>
                        <li className="cf-no-item">
                            <span className="cf-no-icon">❌</span>
                            Non facciamo consulenza interessata
                        </li>
                        <li className="cf-no-item">
                            <span className="cf-no-icon">❌</span>
                            Non “abbelliamo” i numeri
                        </li>
                    </ul>

                    <div className="cf-reality-center">
                        Mostriamo la <span>realtà</span> dei fatti.
                    </div>
                </div>
            </section>

            {/* --- PER CHI E --- */}
            <section className="cf-per-chi-section">
                <div className="cf-container">
                    <h2 className="cf-per-chi-title">Per chi è questo servizio</h2>

                    <div className="cf-per-chi-grid">
                        <div className="cf-per-chi-card">
                            <span>🚶</span>
                            <p>Per chi investe ma non riesce a capire davvero come sta andando</p>
                        </div>
                        <div className="cf-per-chi-card">
                            <span>🚶</span>
                            <p>Per chi vuole trasparenza totale su costi e risultati</p>
                        </div>
                        <div className="cf-per-chi-card">
                            <span>🚶</span>
                            <p>Per chi pretende di misurare, confrontare, decidere</p>
                        </div>
                    </div>

                    <div className="cf-per-chi-punchline">
                        Se tieni al tuo <span>patrimonio</span>, è lo strumento per <span>te</span>.
                    </div>

                    <div style={{ textAlign: 'center', marginTop: '60px' }}>
                        <Link href="/discover" className="cf-btn-pill" style={{ padding: '25px 60px', fontSize: '1.8rem' }}>
                            PROVALO ORA →
                        </Link>
                    </div>
                </div>
            </section>

        </div>
    )
}
