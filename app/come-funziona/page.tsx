'use client'

import React from 'react'
import Link from 'next/link'
import {
    Upload,
    Zap,
    BarChart3,
    CheckCircle2,
    Fingerprint,
    FileText,
    TrendingUp,
    ShieldCheck,
    XCircle,
    ArrowRight,
    Users
} from 'lucide-react'
import './come-funziona.css'

export default function ComeFunzionaPage() {
    return (
        <div className="cf-page">
            {/* --- HERO: THE JOURNEY --- */}
            <section className="cf-hero-premium">
                <div className="cf-container">
                    <h1>Come funziona <span>imieiinvestimenti.it</span></h1>

                    <div className="cf-journey">
                        <div className="cf-journey-grid">
                            <div className="cf-journey-card">
                                <div className="cf-icon-wrapper">
                                    <Upload size={32} />
                                    <div className="cf-step-num-badge">1</div>
                                </div>
                                <span className="cf-journey-label">Carichi i documenti</span>
                                <div className="cf-step-tracer" />
                            </div>
                            <div className="cf-journey-card">
                                <div className="cf-icon-wrapper">
                                    <Zap size={32} />
                                    <div className="cf-step-num-badge">2</div>
                                </div>
                                <span className="cf-journey-label">Noi li traduciamo</span>
                                <div className="cf-step-tracer" />
                            </div>
                            <div className="cf-journey-card">
                                <div className="cf-icon-wrapper">
                                    <BarChart3 size={32} />
                                    <div className="cf-step-num-badge">3</div>
                                </div>
                                <span className="cf-journey-label">Ti restituiamo i numeri</span>
                                <div className="cf-step-tracer" />
                            </div>
                            <div className="cf-journey-card">
                                <div className="cf-icon-wrapper">
                                    <CheckCircle2 size={32} />
                                    <div className="cf-step-num-badge">4</div>
                                </div>
                                <span className="cf-journey-label">Investi consapevolmente</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* --- STEP 1: UPLOAD --- */}
            <section className="cf-step-section">
                <div className="cf-container">
                    <div className="cf-step-layout">
                        <div className="cf-step-content">
                            <span className="cf-step-tag">Step 01</span>
                            <h2 className="cf-step-title">Carichi i documenti</h2>
                            <p className="cf-step-desc">
                                Carichi gli estratti conto e i rendiconti che ricevi dalla banca.
                                Non serve capire dove guardare: li conosciamo già noi.
                            </p>

                            <div className="cf-feat-list">
                                <div className="cf-feat-item">
                                    <div className="cf-feat-icon"><CheckCircle2 size={18} /></div>
                                    Analisi completa caricando entrambi i file
                                </div>
                                <div className="cf-feat-item">
                                    <div className="cf-feat-icon"><ShieldCheck size={18} /></div>
                                    Privacy garantita: nessun dato sensibile salvato
                                </div>
                            </div>
                        </div>

                        <div className="cf-asset-stack">
                            <div className="cf-asset-card">
                                <h3 className="cf-asset-title"><FileText className="text-primary" /> Conto corrente</h3>
                                <div className="cf-metric-grid">
                                    <div className="cf-metric-tile">
                                        <span className="cf-metric-label">👉 Interessi</span>
                                        <span className="cf-metric-val">Attivi e passivi</span>
                                    </div>
                                    <div className="cf-metric-tile">
                                        <span className="cf-metric-label">👉 Flussi</span>
                                        <span className="cf-metric-val">Dividendi e Cedole</span>
                                    </div>
                                    <div className="cf-metric-tile">
                                        <span className="cf-metric-label">👉 Costi</span>
                                        <span className="cf-metric-val">Commissioni varie</span>
                                    </div>
                                </div>
                            </div>

                            <div className="cf-asset-card">
                                <h3 className="cf-asset-title"><TrendingUp className="text-primary" /> Dossier Titoli</h3>
                                <div className="cf-metric-grid">
                                    <div className="cf-metric-tile">
                                        <span className="cf-metric-label">👉 Performance</span>
                                        <span className="cf-metric-val">Rendimenti reali</span>
                                    </div>
                                    <div className="cf-metric-tile">
                                        <span className="cf-metric-label">👉 Asset Map</span>
                                        <span className="cf-metric-val">Allocazione fondi</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* --- STEP 2: TRANSLATE --- */}
            <section className="cf-step-section alt">
                <div className="cf-container">
                    <div className="cf-step-layout">
                        <div className="cf-ai-processing">
                            <div style={{ position: 'relative', width: '100%', maxWidth: '500px' }}>
                                <div className="cf-asset-card" style={{ transform: 'rotate(-2deg)', opacity: 0.5 }}>Dato Bancario 1...</div>
                                <div className="cf-asset-card" style={{ transform: 'rotate(2deg)', marginTop: '-80px', position: 'relative', zIndex: 1 }}>
                                    <div className="cf-step-tag" style={{ margin: '0 0 10px' }}>Dato Normalizzato</div>
                                    <div style={{ height: '2px', background: 'var(--primary)', width: '100%', marginBottom: '10px' }}></div>
                                    <div style={{ height: '20px', background: '#f1f5f9', width: '80%', borderRadius: '4px' }}></div>
                                </div>
                            </div>
                        </div>

                        <div className="cf-step-content">
                            <span className="cf-step-tag">Step 02</span>
                            <h2 className="cf-step-title">Noi li traduciamo</h2>
                            <p className="cf-step-desc">
                                Analizziamo i documenti, li normalizziamo e li rendiamo leggibili e confrontabili.
                                Niente stime o interpretazioni arbitrarie: solo dati reali.
                            </p>

                            <ul className="cf-feat-list">
                                <li className="cf-feat-item">
                                    <div className="cf-feat-icon"><Fingerprint size={18} /></div>
                                    Uniamo ciò che la banca manda separato
                                </li>
                                <li className="cf-feat-item">
                                    <div className="cf-feat-icon"><Zap size={18} /></div>
                                    Ordiniamo ciò che è sparso
                                </li>
                                <li className="cf-feat-item">
                                    <div className="cf-feat-icon"><CheckCircle2 size={18} /></div>
                                    Evidenziamo ciò che conta davvero
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            {/* --- STEP 3: NUMBERS --- */}
            <section className="cf-step-section">
                <div className="cf-container">
                    <div className="cf-step-layout">
                        <div className="cf-step-content">
                            <span className="cf-step-tag">Step 03</span>
                            <h2 className="cf-step-title">Ti restituiamo i numeri</h2>
                            <p className="cf-step-desc">
                                In un’unica vista hai ciò che serve davvero per controllare i tuoi investimenti.
                                Eliminiamo la complessità per lasciarti la chiarezza.
                            </p>

                            <div className="cf-metric-grid">
                                <div className="cf-feat-item" style={{ justifyContent: 'space-between' }}>
                                    <span>Rendimento Lordo</span>
                                    <span style={{ opacity: 0.5, fontSize: '0.9rem' }}>Crescita reale</span>
                                </div>
                                <div className="cf-feat-item" style={{ justifyContent: 'space-between', borderColor: 'var(--primary)', background: 'var(--primary-soft)' }}>
                                    <span>Benchmark di Mercato</span>
                                    <span style={{ opacity: 0.5, fontSize: '0.9rem' }}>Il confronto vero</span>
                                </div>
                                <div className="cf-feat-item" style={{ justifyContent: 'space-between' }}>
                                    <span>Rendimento Netto</span>
                                    <span style={{ opacity: 0.5, fontSize: '0.9rem' }}>Quello che intaschi</span>
                                </div>
                            </div>
                            <p style={{ marginTop: '24px', fontWeight: 900, fontSize: '1.5rem' }}>Tutto il resto è rumore.</p>
                        </div>

                        <div className="cf-visual-focus">
                            <div style={{ background: 'white', padding: '40px', borderRadius: '40px', boxShadow: '0 40px 80px rgba(0,0,0,0.05)', border: '1px solid var(--border)' }}>
                                <BarChart3 size={100} className="text-primary" style={{ margin: '0 auto', display: 'block' }} />
                                <div style={{ textAlign: 'center', marginTop: '32px' }}>
                                    <div style={{ fontSize: '3rem', fontWeight: 900 }}>+8.42%</div>
                                    <div style={{ color: 'var(--text-gray)', fontWeight: 600 }}>Performance Netta Rispetto al Mercato</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* --- STEP 4: DECIDE --- */}
            <section className="cf-step-section alt">
                <div className="cf-container">
                    <div className="cf-step-layout">
                        <div className="cf-step-visual">
                            <ShieldCheck size={200} strokeWidth={0.5} style={{ opacity: 0.1, position: 'absolute', transform: 'translate(-50%, -50%)' }} />
                            <div className="cf-feat-item" style={{ padding: '40px', borderRadius: '32px', textAlign: 'center', flexDirection: 'column' }}>
                                <h3 style={{ fontSize: '1.8rem', marginBottom: '20px' }}>Investimento Consapevole</h3>
                                <ArrowRight size={40} className="text-primary" />
                                <div style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--primary)', marginTop: '20px' }}>Migliori il tuo portafoglio</div>
                            </div>
                        </div>

                        <div className="cf-step-content">
                            <span className="cf-step-tag">Step 04</span>
                            <h2 className="cf-step-title">Investi consapevolmente</h2>
                            <p className="cf-step-desc">
                                Non devi più interpretare tabelle o note a piè pagina della banca.
                                Vedi immediatamente la salute dei tuoi soldi.
                            </p>

                            <ul className="cf-feat-list">
                                <li className="cf-feat-item">• Il rendimento è coerente?</li>
                                <li className="cf-feat-item">• I costi stanno erodendo valore?</li>
                                <li className="cf-feat-item">• Risultato vs Mercato?</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            {/* --- TRUST: WHAT WE DON'T DO --- */}
            <section className="cf-trust-section">
                <div className="cf-container">
                    <div className="cf-trust-grid">
                        <div>
                            <div className="cf-step-tag" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', marginBottom: '40px' }}>Massima Indipendenza</div>
                            <h2 style={{ fontSize: '3rem', fontWeight: 900, marginBottom: '40px', color: 'var(--text-dark)' }}>Cosa non facciamo</h2>
                            <ul className="cf-no-list">
                                <li className="cf-no-item">
                                    <div className="cf-no-icon"><XCircle size={20} /></div>
                                    Non vendiamo prodotti finanziari
                                </li>
                                <li className="cf-no-item">
                                    <div className="cf-no-icon"><XCircle size={20} /></div>
                                    Non facciamo consulenza interessata
                                </li>
                                <li className="cf-no-item">
                                    <div className="cf-no-icon"><XCircle size={20} /></div>
                                    Non “abbelliamo” mai i numeri
                                </li>
                            </ul>
                        </div>

                        <div>
                            <div className="cf-trust-reality">
                                Mostriamo la <span>realtà</span> dei fatti.
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* --- WHO IT'S FOR --- */}
            <section className="cf-who-section">
                <div className="cf-container">
                    <h2 style={{ fontSize: '3rem', fontWeight: 900, letterSpacing: '-1.5px' }}>Per chi è questo servizio</h2>

                    <div className="cf-who-grid">
                        <div className="cf-who-card">
                            <span className="cf-who-icon">🧍</span>
                            <p>Per chi investe ma non riesce a capire davvero come sta andando</p>
                        </div>
                        <div className="cf-who-card">
                            <span className="cf-who-icon">🧍</span>
                            <p>Per chi vuole trasparenza totale su costi e risultati</p>
                        </div>
                        <div className="cf-who-card">
                            <span className="cf-who-icon">🧍</span>
                            <p>Per chi pretende di misurare, confrontare, decidere</p>
                        </div>
                    </div>

                    <div className="cf-who-footer">
                        Se tieni al tuo <span>patrimonio</span>, è lo strumento per <span>te</span>.
                    </div>
                </div>
            </section>

            {/* --- FINAL CTA --- */}
            <section className="cf-final-cta">
                <div className="cf-container">
                    <Link href="/dashboard" className="cf-btn-huge">
                        PROVALO ORA →
                    </Link>
                </div>
            </section>
        </div>
    )
}
