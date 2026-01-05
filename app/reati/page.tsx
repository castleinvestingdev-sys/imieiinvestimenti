'use client'

import React from 'react'
import Link from 'next/link'
import { TrendingDown, Handshake, Clock, Search, FileText } from 'lucide-react'
import './reati.css'

export default function ReatiPage() {
    return (
        <div className="reati-page">
            {/* --- HERO SECTION --- */}
            <section className="rebate-hero">
                <div className="reati-container">
                    <span className="badge">Rebates.</span>
                    <h1>Scopri i costi &quot;invisibili&quot; che possono mangiarsi i tuoi rendimenti</h1>

                    <div className="hero-box">
                        <h2>Paragona il tuo rendimento con il mercato, altrimenti non sai se ritenerti soddisfatto.</h2>

                        <p>
                            Se hai fondi, gestioni o polizze, è possibile che una parte dei costi vada alla banca come retrocessione (rebate).
                        </p>
                        <p>
                            Non sempre è chiaro quanto paghi, dove sta scritto e chi lo incassa.
                            <strong> imieiinvestimenti.it</strong> ti aiuta a trovarli nei documenti e a quantificarli.
                        </p>

                        <div className="rebate-cta-line">
                            <span className="rebate-cta-text">Carica il tuo estratto conto.</span>
                            <Link href="/dashboard" className="btn-pill">PROVALO ORA →</Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* --- COS'È UN REBATE --- */}
            <section className="rebate-explanation">
                <div className="reati-container">
                    <h3>Cos&apos;è un <span>rebate</span> (o retrocessione)</h3>

                    <div className="explanation-grid">
                        <div style={{ fontSize: '1.25rem' }}>
                            <p style={{ marginBottom: '20px' }}>
                                Un rebate è una parte delle commissioni che tu paghi sul prodotto (es. fondo o gestione)
                                che viene girata alla banca/intermediario come compenso per la distribuzione.
                            </p>
                            <p style={{ fontWeight: 800 }}>
                                In pratica: tu paghi, ma una quota di quel costo torna indietro a chi te l&apos;ha venduto o collocato.
                            </p>
                        </div>

                        <div className="rebate-viz-container">
                            <div className="donut-wrapper">
                                <svg className="donut-svg" width="240" height="240" viewBox="0 0 200 200">
                                    <circle className="donut-segment donut-bg" cx="100" cy="100" r="85" />
                                    <circle
                                        className="donut-segment donut-netto"
                                        cx="100" cy="100" r="85"
                                        strokeDasharray="300 534"
                                    />
                                    <circle
                                        className="donut-segment donut-rebate"
                                        cx="100" cy="100" r="85"
                                        strokeDasharray="234 534"
                                        strokeDashoffset="-300"
                                    />
                                </svg>
                                <div className="donut-center">
                                    <span className="value">+4,5%</span>
                                    <span className="label">Netto</span>
                                </div>
                                <div className="donut-callout gross" style={{ color: '#22c55e' }}>
                                    <span className="callout-value">+8%</span>
                                    <span className="callout-label">Guadagno Lordo</span>
                                </div>
                                <div className="donut-callout rebate" style={{ color: '#ef4444' }}>
                                    <span className="callout-value">-3,50%</span>
                                    <span className="callout-label">Rebate</span>
                                </div>
                            </div>

                            <div className="viz-explanation-box">
                                <p>
                                    Hai un fondo con costi annui totali del <strong>3,50%</strong>.
                                    Di quel 3,50%, per esempio il 2,00% può essere <strong>retrocesso</strong> alla banca come rebate.
                                </p>
                                <p style={{ fontWeight: 800, color: 'var(--danger)', fontStyle: 'italic' }}>
                                    Risultato: il prodotto può essere &quot;preferito&quot; non perché è il migliore per te, ma perché paga di più chi lo propone.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* --- PERCHÉ SONO UN PROBLEMA --- */}
            <section className="rebate-problems">
                <div className="reati-container">
                    <h3 style={{ marginBottom: '40px', textAlign: 'center' }}>Perché i rebates sono un problema per te</h3>

                    <div className="problem-grid">
                        <div className="problem-card">
                            <div className="problem-card-icon"><TrendingDown size={20} /></div>
                            <h4>Costo reale più alto</h4>
                            <p>Spesso il costo totale non è percepito in modo chiaro e grava silenziosamente sul capitale.</p>
                        </div>
                        <div className="problem-card">
                            <div className="problem-card-icon"><Handshake size={20} /></div>
                            <h4>Conflitto di interessi</h4>
                            <p>Chi ti consiglia è incentivato a proporti ciò che rende alla banca, non a te.</p>
                        </div>
                        <div className="problem-card">
                            <div className="problem-card-icon"><Clock size={20} /></div>
                            <h4>Rendimento eroso nel tempo</h4>
                            <p>Anche l&apos;1% annuo in più può pesare enormemente sul risultato finale a 5-10 anni.</p>
                        </div>
                        <div className="problem-card">
                            <div className="problem-card-icon"><Search size={20} /></div>
                            <h4>Difficile confrontare alternative</h4>
                            <p>ETF o share class &quot;clean&quot; costano meno, ma spesso non vengono mostrati.</p>
                        </div>
                        <div className="problem-card">
                            <div className="problem-card-icon"><FileText size={20} /></div>
                            <h4>Opacità documentale</h4>
                            <p>I rebates compaiono in note o voci tecniche di difficile lettura per il risparmiatore.</p>
                        </div>
                    </div>

                    <div className="problem-footer">
                        Il problema non è che esistono. Il problema è quando non sai <span>quanto</span> ti costano e <span>perché</span> ti vengono proposti.
                    </div>
                </div>
            </section>

            {/* --- DOVE SI VEDONO --- */}
            <section className="rebate-where">
                <div className="reati-container">
                    <div className="section-header">
                        <h3>Dove trovare queste informazioni?</h3>
                        <p>I rebates non sono pubblicizzati, ma devono essere dichiarati per legge nei documenti informativi ufficiali.</p>
                    </div>

                    <div className="kid-card">
                        <div className="kid-card-icon">
                            <FileText size={40} />
                        </div>
                        <div className="kid-card-content">
                            <span className="kid-badge">Documento Chiave</span>
                            <h4>Il KID (Key Information Document)</h4>
                            <p>È il documento standardizzato che ogni fondo deve fornire. All&apos;interno, nella sezione <strong>&quot;Composizione dei costi&quot;</strong>, troverai la percentuale di commissioni retrocessa alla banca.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* --- FINAL CTA --- */}
            <section className="reati-final-cta">
                <div className="reati-container">
                    <h2>I tuoi soldi meritano chiarezza.</h2>
                    <p>Scopri quanto stai pagando davvero oggi stesso.</p>
                    <Link href="/dashboard" className="btn-pill">
                        ANALIZZA IL MIO PDF ORA →
                    </Link>
                </div>
            </section>

            {/* --- FOOTER INFO --- */}
            <section style={{ padding: '40px 0', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
                <div className="reati-container">
                    <div style={{ fontSize: '0.85rem', color: '#9ca3af', maxWidth: '600px', margin: '0 auto' }}>
                        iMieiInvestimenti.it fornisce analisi indipendenti basate sui dati forniti dall&apos;utente.
                        Tutte le informazioni hanno scopo puramente informativo e non costituiscono sollecitazione al risparmio.
                    </div>
                </div>
            </section>
        </div>
    )
}
