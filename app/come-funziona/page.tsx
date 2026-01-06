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
                    <h1>Come funziona <span>imieiinvestimenti.it</span></h1>

                    <div className="cf-snake-visual">
                        <div className="cf-snake-step step-1">1. Carichi i documenti</div>

                        <div className="cf-snake-arrow a-1-2">
                            <svg width="120" height="60" viewBox="0 0 120 60" fill="none">
                                <path d="M10 10C40 10 80 10 110 50" stroke="#1a1a1a" strokeWidth="4" strokeLinecap="round" />
                                <path d="M95 50L110 50L110 35" stroke="#1a1a1a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>

                        <div className="cf-snake-step step-2">2. Noi li traduciamo</div>

                        <div className="cf-snake-arrow a-2-3">
                            <svg width="120" height="60" viewBox="0 0 120 60" fill="none">
                                <path d="M10 10C40 10 80 10 110 50" stroke="#1a1a1a" strokeWidth="4" strokeLinecap="round" />
                                <path d="M95 50L110 50L110 35" stroke="#1a1a1a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>

                        <div className="cf-snake-step step-3">3. Ti restituiamo i numeri</div>

                        <div className="cf-snake-arrow a-3-4">
                            <svg width="120" height="60" viewBox="0 0 120 60" fill="none">
                                <path d="M10 10C40 10 80 10 110 50" stroke="#1a1a1a" strokeWidth="4" strokeLinecap="round" />
                                <path d="M95 50L110 50L110 35" stroke="#1a1a1a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>

                        <div className="cf-snake-step step-4">4. Investi consapevolmente</div>
                    </div>

                    <div className="cf-cta-bar">
                        <span className="cf-cta-text">Carica il tuo estratto conto.</span>
                        <Link href="/dashboard" className="cf-btn-pill">
                            PROVALO ORA →
                        </Link>
                    </div>
                </div>
            </section>

            {/* --- STEP 1: CARICA --- */}
            <section className="cf-section bg-alt">
                <div className="cf-container">
                    <div className="cf-step-circle">1</div>
                    <h2 className="cf-step-title">Carichi i documenti</h2>
                    <p className="cf-step-desc">
                        Carichi gli estratti conto e i rendiconti che ricevi dalla banca.
                        Non serve capire dove guardare: li conosciamo già noi.
                    </p>

                    <div className="cf-step1-grid">
                        <div className="cf-doc-card">
                            <Image
                                src="/document-placeholder.svg"
                                alt="Conto Corrente"
                                width={100}
                                height={130}
                                className="cf-doc-icon"
                                style={{ filter: 'grayscale(1)', opacity: 0.3 }}
                            />
                            <h3 className="cf-doc-title">Conto corrente</h3>
                            <ul className="cf-pointer-list" style={{ display: 'inline-block', textAlign: 'left' }}>
                                <li className="cf-pointer-item">👉 Interessi attivi</li>
                                <li className="cf-pointer-item">👉 Interessi passivi</li>
                                <li className="cf-pointer-item">👉 Dividendi</li>
                                <li className="cf-pointer-item">👉 Cedole</li>
                                <li className="cf-pointer-item">👉 Commissioni...</li>
                            </ul>
                        </div>
                        <div className="cf-doc-card">
                            <Image
                                src="/document-placeholder.svg"
                                alt="Dossier Titoli"
                                width={100}
                                height={130}
                                className="cf-doc-icon"
                                style={{ filter: 'grayscale(1)', opacity: 0.3 }}
                            />
                            <h3 className="cf-doc-title">Dossier Titoli</h3>
                            <ul className="cf-pointer-list" style={{ display: 'inline-block', textAlign: 'left' }}>
                                <li className="cf-pointer-item">👉 Performance</li>
                                <li className="cf-pointer-item">👉 Asset Allocation</li>
                                <li className="cf-pointer-item">👉 Movimenti</li>
                            </ul>
                        </div>
                    </div>

                    <div style={{ textAlign: 'center', marginTop: '100px' }}>
                        <p style={{ fontSize: '2.5rem', fontWeight: 1000, letterSpacing: '-1.5px' }}>Per un’analisi completa caricali entrambi</p>
                    </div>
                </div>
            </section>

            {/* --- STEP 2: TRADUZIONE --- */}
            <section className="cf-section">
                <div className="cf-container">
                    <div className="cf-step-circle">2</div>
                    <h2 className="cf-step-title">Noi li traduciamo</h2>
                    <p className="cf-step-desc">
                        Analizziamo i documenti, li normalizziamo e li rendiamo leggibili e confrontabili.
                        Niente stime, niente interpretazioni arbitrarie: solo dati reali.
                    </p>

                    <div style={{ marginTop: '60px' }}>
                        <ul className="cf-pointer-list">
                            <li className="cf-pointer-item large">👉 Uniamo ciò che la banca ti manda separato</li>
                            <li className="cf-pointer-item large">👉 Ordiniamo ciò che è sparso</li>
                            <li className="cf-pointer-item large">👉 Evidenziamo ciò che conta davvero</li>
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
                        In un’unica vista hai ciò che serve davvero per controllare i tuoi investimenti:
                    </p>

                    <div style={{ marginTop: '60px' }}>
                        <ul className="cf-pointer-list">
                            <li className="cf-pointer-item large" style={{ display: 'flex', gap: '30px', marginBottom: '40px' }}>
                                <span style={{ fontSize: '2.5rem' }}>👉</span>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '50px' }}>
                                        <strong style={{ minWidth: '220px', fontSize: '2.5rem' }}>Rendimento lordo</strong>
                                        <span style={{ fontWeight: 400, fontSize: '2rem' }}>quanto ha prodotto il portafoglio</span>
                                    </div>
                                </div>
                            </li>
                            <li className="cf-pointer-item large" style={{ display: 'flex', gap: '30px', marginBottom: '40px' }}>
                                <span style={{ fontSize: '2.5rem' }}>👉</span>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '50px' }}>
                                        <strong style={{ minWidth: '220px', fontSize: '2.5rem' }}>Benchmark</strong>
                                        <span style={{ fontWeight: 400, fontSize: '2rem' }}>come sarebbe andata con un’alternativa di</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '50px', marginTop: '5px' }}>
                                        <span style={{ minWidth: '220px', textAlign: 'center', fontSize: '2rem', fontWeight: 900 }}>→</span>
                                        <span style={{ fontWeight: 400, fontSize: '2rem' }}>mercato</span>
                                    </div>
                                </div>
                            </li>
                            <li className="cf-pointer-item large" style={{ display: 'flex', gap: '30px', marginBottom: '40px' }}>
                                <span style={{ fontSize: '2.5rem' }}>👉</span>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '50px' }}>
                                        <strong style={{ minWidth: '220px', fontSize: '2.5rem' }}>Rendimento netto</strong>
                                        <span style={{ fontWeight: 400, fontSize: '2rem' }}>quanto ti resta dopo costi e commissioni</span>
                                    </div>
                                </div>
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
                        Non devi interpretare tabelle o note a piè pagina.
                        Vedi immediatamente se:
                    </p>

                    <ul style={{ listStyle: 'none', padding: 0, fontSize: '2.5rem', fontWeight: 900, letterSpacing: '-1.5px', lineHeight: 1.4, marginBottom: '60px' }}>
                        <li>• il rendimento è coerente</li>
                        <li>• i costi stanno erodendo valore</li>
                        <li>• il risultato è migliore o peggiore del mercato</li>
                    </ul>

                    <div className="cf-step4-visual">
                        <div className="cf-arrow-down-right">
                            <svg viewBox="0 0 100 100" fill="none">
                                <path d="M10 10C50 10 90 30 90 85" stroke="#1a1a1a" strokeWidth="4" strokeLinecap="round" />
                                <path d="M75 80L90 85L95 70" stroke="#1a1a1a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <div className="cf-step4-success">
                            Migliori il tuo portafoglio
                        </div>
                    </div>
                </div>
            </section>

            {/* --- TRUST: WHAT WE DON'T DO --- */}
            <section className="cf-no-section">
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

            {/* --- FINAL CTA --- */}
            <section className="cf-final-hero">
                <div className="cf-container">
                    <h2>Pronto a scoprire la verità?</h2>
                    <Link href="/dashboard" className="cf-btn-pill" style={{ fontSize: '1.5rem', padding: '25px 60px' }}>
                        PROVALO ORA →
                    </Link>
                </div>
            </section>
        </div>
    )
}
