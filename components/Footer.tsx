'use client'

import Link from 'next/link'

export default function Footer() {
    return (
        <footer style={{ background: '#2d2d2d', color: '#fff', padding: '60px 0 40px 0' }}>
            <div className="container" style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 2rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', gap: '3rem', marginBottom: '3rem' }}>

                    {/* Brand */}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.2rem' }}>
                            <div style={{ width: '40px', height: '40px', background: '#00C853', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span style={{ color: '#fff', fontWeight: 900, fontSize: '1.2rem' }}>📊</span>
                            </div>
                            <span style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.5px' }}>iMieiInvestimenti.it</span>
                        </div>
                        <p style={{ color: '#999', fontSize: '0.95rem', lineHeight: 1.7, maxWidth: '280px' }}>
                            Analisi indipendente dei tuoi investimenti.<br />
                            Trasparenza. Chiarezza. Controllo.
                        </p>
                    </div>

                    {/* Informazioni */}
                    <div>
                        <h4 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', color: '#fff', marginBottom: '1.2rem', letterSpacing: '1.5px' }}>
                            Informazioni
                        </h4>
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                            <li style={{ marginBottom: '0.7rem' }}>
                                <Link href="/come-funziona" style={{ color: '#aaa', textDecoration: 'none', fontSize: '0.95rem' }}>
                                    Come Funziona
                                </Link>
                            </li>
                            <li style={{ marginBottom: '0.7rem' }}>
                                <Link href="/commissioni" style={{ color: '#aaa', textDecoration: 'none', fontSize: '0.95rem' }}>
                                    Commissioni di Sistema
                                </Link>
                            </li>
                            <li style={{ marginBottom: '0.7rem' }}>
                                <Link href="/rendimenti" style={{ color: '#aaa', textDecoration: 'none', fontSize: '0.95rem' }}>
                                    Rendimenti di Mercato
                                </Link>
                            </li>
                            <li style={{ marginBottom: '0.7rem' }}>
                                <Link href="/reati" style={{ color: '#aaa', textDecoration: 'none', fontSize: '0.95rem' }}>
                                    Attenzione ai Reati
                                </Link>
                            </li>
                        </ul>
                    </div>

                    {/* Legale */}
                    <div>
                        <h4 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', color: '#fff', marginBottom: '1.2rem', letterSpacing: '1.5px' }}>
                            Legale
                        </h4>
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                            <li style={{ marginBottom: '0.7rem' }}>
                                <Link href="/privacy" style={{ color: '#aaa', textDecoration: 'none', fontSize: '0.95rem' }}>
                                    Privacy Policy
                                </Link>
                            </li>
                            <li style={{ marginBottom: '0.7rem' }}>
                                <Link href="/termini" style={{ color: '#aaa', textDecoration: 'none', fontSize: '0.95rem' }}>
                                    Termini e Condizioni
                                </Link>
                            </li>
                            <li style={{ marginBottom: '0.7rem' }}>
                                <Link href="/cookie" style={{ color: '#aaa', textDecoration: 'none', fontSize: '0.95rem' }}>
                                    Cookie Policy
                                </Link>
                            </li>
                        </ul>
                    </div>

                    {/* Contatti */}
                    <div>
                        <h4 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', color: '#fff', marginBottom: '1.2rem', letterSpacing: '1.5px' }}>
                            Contatti
                        </h4>
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                            <li style={{ marginBottom: '0.7rem', color: '#aaa', fontSize: '0.95rem' }}>
                                📧 info@imieiinvestimenti.it
                            </li>
                            <li style={{ marginBottom: '0.7rem', color: '#aaa', fontSize: '0.95rem' }}>
                                📞 +39 02 1234 5678
                            </li>
                        </ul>
                    </div>
                </div>

                {/* Copyright */}
                <div style={{ borderTop: '1px solid #444', paddingTop: '2rem', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <p style={{ color: '#666', fontSize: '0.85rem', margin: 0 }}>
                        © 2026 iMieiInvestimenti.it - Tutti i diritti riservati
                    </p>
                </div>
            </div>

            <style jsx>{`
        footer a:hover {
          color: #00C853 !important;
        }
        @media (max-width: 768px) {
          footer > div > div:first-child {
            grid-template-columns: 1fr !important;
            gap: 2rem !important;
          }
        }
      `}</style>
        </footer >
    )
}
