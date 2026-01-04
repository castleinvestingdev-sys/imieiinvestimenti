'use client'

import React from 'react'
import Link from 'next/link'

export default function ComeFunzionaPage() {
    return (
        <div style={{ backgroundColor: '#FFFFFF', color: '#111827', fontFamily: 'Inter, sans-serif' }}>
            <style jsx global>{`
                @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
                .animate-in { animation: fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
                .delay-1 { animation-delay: 0.1s; }
                .delay-2 { animation-delay: 0.2s; }
                .delay-3 { animation-delay: 0.3s; }
            `}</style>

            {/* --- HERO SECTION --- */}
            <section style={{
                padding: '120px 24px 80px',
                background: 'linear-gradient(180deg, #FFFFFF 0%, #FAFAFA 100%)',
                position: 'relative',
                overflow: 'hidden',
                textAlign: 'center'
            }}>
                <div style={{ maxWidth: '1000px', margin: '0 auto' }} className="animate-in">
                    <h1 style={{
                        fontSize: '3.5rem',
                        lineHeight: '1.1',
                        marginBottom: '2rem',
                        letterSpacing: '-0.03em',
                        fontWeight: 900,
                        color: '#000'
                    }}>
                        Analizzare i tuoi costi<br />
                        è più semplice di quanto pensi.
                    </h1>
                    <p style={{
                        fontSize: '1.25rem',
                        maxWidth: '600px',
                        margin: '0 auto 3rem',
                        color: '#555',
                        fontWeight: 400
                    }}>
                        In 3 semplici passaggi, ti diamo il potere di vedere quello che la banca non ti dice. Gratis e in totale anonimato.
                    </p>
                    <Link href="/dashboard" style={{
                        backgroundColor: '#00C853',
                        color: 'white',
                        fontWeight: 800,
                        padding: '18px 45px',
                        borderRadius: '50px',
                        textDecoration: 'none',
                        display: 'inline-block',
                        textTransform: 'uppercase',
                        letterSpacing: '1px',
                        boxShadow: '0 10px 30px rgba(0,200,83,0.3)',
                        transition: 'transform 0.2s'
                    }}>
                        INIZIA L'ANALISI
                    </Link>
                </div>
            </section>

            {/* --- STEPS SECTION --- */}
            <section style={{ padding: '80px 24px', backgroundColor: '#fff' }}>
                <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                        gap: '40px',
                        marginTop: '2rem'
                    }}>
                        {/* Step 1 */}
                        <div className="animate-in delay-1" style={{
                            background: '#fff',
                            borderRadius: '24px',
                            padding: '40px 30px',
                            textAlign: 'center',
                            border: '1px solid rgba(0,0,0,0.05)',
                            boxShadow: '0 10px 40px -10px rgba(0,0,0,0.05)',
                            position: 'relative',
                            transition: 'transform 0.3s ease'
                        }}>
                            <div style={{
                                fontSize: '4rem',
                                fontWeight: 900,
                                color: '#f0f0f0',
                                position: 'absolute',
                                top: '20px',
                                left: '20px',
                                lineHeight: 1,
                                zIndex: 1
                            }}>1</div>
                            <div style={{
                                width: '80px',
                                height: '80px',
                                background: 'linear-gradient(135deg, #00C853 0%, #009624 100%)',
                                borderRadius: '24px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '2rem',
                                margin: '0 auto 2rem',
                                position: 'relative',
                                zIndex: 2,
                                boxShadow: '0 10px 20px rgba(0, 200, 83, 0.2)'
                            }}>📄</div>
                            <h3 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '1rem', position: 'relative', zIndex: 2, color: '#000' }}>Carica il PDF</h3>
                            <p style={{ color: '#666', lineHeight: 1.6, position: 'relative', zIndex: 2 }}>
                                Scarica il tuo "Portafoglio Titoli" o "Rendiconto Costi" dal sito della tua banca e caricalo qui.
                                <br /><strong>Nessun dato sensibile viene salvato.</strong>
                            </p>
                        </div>

                        {/* Step 2 */}
                        <div className="animate-in delay-2" style={{
                            background: '#fff',
                            borderRadius: '24px',
                            padding: '40px 30px',
                            textAlign: 'center',
                            border: '1px solid rgba(0,0,0,0.05)',
                            boxShadow: '0 10px 40px -10px rgba(0,0,0,0.05)',
                            position: 'relative',
                            transition: 'transform 0.3s ease'
                        }}>
                            <div style={{
                                fontSize: '4rem',
                                fontWeight: 900,
                                color: '#f0f0f0',
                                position: 'absolute',
                                top: '20px',
                                left: '20px',
                                lineHeight: 1,
                                zIndex: 1
                            }}>2</div>
                            <div style={{
                                width: '80px',
                                height: '80px',
                                background: 'linear-gradient(135deg, #00C853 0%, #009624 100%)',
                                borderRadius: '24px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '2rem',
                                margin: '0 auto 2rem',
                                position: 'relative',
                                zIndex: 2,
                                boxShadow: '0 10px 20px rgba(0, 200, 83, 0.2)'
                            }}>🤖</div>
                            <h3 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '1rem', position: 'relative', zIndex: 2, color: '#000' }}>L'AI Analizza</h3>
                            <p style={{ color: '#666', lineHeight: 1.6, position: 'relative', zIndex: 2 }}>
                                Il nostro algoritmo scansiona ogni riga, identifica i fondi tramite ISIN e calcola i <strong>costi occulti (Rebates)</strong> che non vedi nell'estratto conto.
                            </p>
                        </div>

                        {/* Step 3 */}
                        <div className="animate-in delay-3" style={{
                            background: '#fff',
                            borderRadius: '24px',
                            padding: '40px 30px',
                            textAlign: 'center',
                            border: '1px solid rgba(0,0,0,0.05)',
                            boxShadow: '0 10px 40px -10px rgba(0,0,0,0.05)',
                            position: 'relative',
                            transition: 'transform 0.3s ease'
                        }}>
                            <div style={{
                                fontSize: '4rem',
                                fontWeight: 900,
                                color: '#f0f0f0',
                                position: 'absolute',
                                top: '20px',
                                left: '20px',
                                lineHeight: 1,
                                zIndex: 1
                            }}>3</div>
                            <div style={{
                                width: '80px',
                                height: '80px',
                                background: 'linear-gradient(135deg, #00C853 0%, #009624 100%)',
                                borderRadius: '24px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '2rem',
                                margin: '0 auto 2rem',
                                position: 'relative',
                                zIndex: 2,
                                boxShadow: '0 10px 20px rgba(0, 200, 83, 0.2)'
                            }}>💡</div>
                            <h3 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '1rem', position: 'relative', zIndex: 2, color: '#000' }}>Scopri la Verità</h3>
                            <p style={{ color: '#666', lineHeight: 1.6, position: 'relative', zIndex: 2 }}>
                                Ricevi un report immediato con il <strong>Vero Rendimento Netto</strong> e l'impatto delle commissioni sui tuoi soldi nei prossimi 10 anni.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* --- CTA BOTTOM --- */}
            <section className="animate-in delay-3" style={{ padding: '0 24px 80px' }}>
                <div style={{
                    padding: '100px 0',
                    background: '#000',
                    color: '#fff',
                    textAlign: 'center',
                    borderRadius: '30px',
                    maxWidth: '1100px',
                    margin: '0 auto'
                }}>
                    <h2 style={{ fontSize: '2.5rem', marginBottom: '1.5rem', fontWeight: 900 }}>Pronto a prendere il controllo?</h2>
                    <p style={{ fontSize: '1.1rem', opacity: 0.8, maxWidth: '500px', margin: '0 auto 2rem' }}>
                        Non serve registrarsi per iniziare. Carica il tuo primo file adesso.
                    </p>
                    <Link href="/dashboard" style={{
                        background: '#fff',
                        color: '#000',
                        fontWeight: 800,
                        padding: '18px 45px',
                        borderRadius: '50px',
                        textDecoration: 'none',
                        display: 'inline-block',
                        textTransform: 'uppercase',
                        letterSpacing: '1px',
                        transition: 'transform 0.2s',
                    }}>
                        VAI ALL'UPLOAD
                    </Link>
                </div>
            </section>
        </div>
    )
}
