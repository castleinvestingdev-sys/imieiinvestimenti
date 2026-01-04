'use client'

import Link from 'next/link'

export default function ComeFunzionaPage() {
    return (
        <div style={{ backgroundColor: '#FFFFFF', color: '#111827', fontFamily: 'Inter, sans-serif' }}>

            {/* 1. HERO SECTION - CLEAR CALL TO ACTION */}
            <section style={{
                padding: '100px 24px 80px',
                textAlign: 'center',
                background: 'linear-gradient(to bottom, #f0fdf4 0%, #ffffff 100%)',
            }}>
                <div style={{ maxWidth: '900px', margin: '0 auto' }}>
                    <h1 style={{
                        fontSize: 'max(40px, 4.2vw)',
                        fontWeight: 800,
                        letterSpacing: '-2px',
                        lineHeight: 1.1,
                        marginBottom: '32px'
                    }}>
                        Scopri come funzionano le commissioni bancarie.<br />
                        <span style={{ color: '#00C853' }}>E come puoi scovarle. Ed evitarle.</span>
                    </h1>

                    <div style={{ marginTop: '48px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
                        <p style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>Carica il tuo estratto conto.</p>
                        <Link href="/dashboard" style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            backgroundColor: '#00C853',
                            color: '#FFFFFF',
                            padding: '16px 40px',
                            borderRadius: '50px',
                            textDecoration: 'none',
                            fontWeight: 800,
                            fontSize: '1.1rem',
                            boxShadow: '0 10px 25px rgba(0, 200, 83, 0.3)'
                        }}>
                            PROVALO ORA →
                        </Link>
                    </div>
                </div>
            </section>

            {/* 2. OVERVIEW - HOW THE BANK EARNS (Step 1-4) */}
            <section style={{ padding: '80px 24px', backgroundColor: '#F9FAFB', borderTop: '1px solid #E5E7EB' }}>
                <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                    <h2 style={{ fontSize: '2.5rem', fontWeight: 800, letterSpacing: '-1px', marginBottom: '64px', textAlign: 'center' }}>
                        Come guadagna la banca:
                    </h2>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px' }}>
                        {/* Box 1 */}
                        <div style={{ backgroundColor: '#FFFFFF', padding: '40px 24px', borderRadius: '24px', border: '1px solid #E5E7EB', textAlign: 'center' }}>
                            <div style={{ width: '40px', height: '40px', backgroundColor: '#EF4444', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, margin: '0 auto 20px' }}>1</div>
                            <p style={{ fontSize: '0.9rem', color: '#6B7280', marginBottom: '12px', minHeight: '40px' }}>Ogni volta che compri o vendi titoli</p>
                            <h3 style={{ fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '24px' }}>Commissioni di Transazione</h3>
                            <div style={{ padding: '8px', backgroundColor: '#FEF2F2', color: '#EF4444', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 800 }}>NON LE TROVI SULL'ESTRATTO CONTO</div>
                        </div>

                        {/* Box 2 */}
                        <div style={{ backgroundColor: '#FFFFFF', padding: '40px 24px', borderRadius: '24px', border: '1px solid #E5E7EB', textAlign: 'center' }}>
                            <div style={{ width: '40px', height: '40px', backgroundColor: '#EF4444', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, margin: '0 auto 20px' }}>2</div>
                            <p style={{ fontSize: '0.9rem', color: '#6B7280', marginBottom: '12px', minHeight: '40px' }}>Ogni giorno in cui hai in portafoglio i titoli</p>
                            <h3 style={{ fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px' }}>Commissioni di Gestione Fondi</h3>
                            <div style={{ color: '#EF4444', fontWeight: 800, fontSize: '0.9rem', marginBottom: '16px' }}>→ REBATES</div>
                            <div style={{ padding: '8px', backgroundColor: '#FEF2F2', color: '#EF4444', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 800 }}>NON LE TROVI SULL'ESTRATTO CONTO</div>
                        </div>

                        {/* Box 3 */}
                        <div style={{ backgroundColor: '#FFFFFF', padding: '40px 24px', borderRadius: '24px', border: '1px solid #E5E7EB', textAlign: 'center' }}>
                            <div style={{ width: '40px', height: '40px', backgroundColor: '#F59E0B', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, margin: '0 auto 20px' }}>3</div>
                            <p style={{ fontSize: '0.9rem', color: '#6B7280', marginBottom: '12px', minHeight: '40px' }}>Consulenza diretta</p>
                            <h3 style={{ fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '24px' }}>Commissioni di Gestione</h3>
                            <div style={{ padding: '8px', backgroundColor: '#FFFBEB', color: '#D97706', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 800 }}>LE TROVI NELL'ESTRATTO CONTO LIQUIDITÀ</div>
                        </div>

                        {/* Box 4 */}
                        <div style={{ backgroundColor: '#FFFFFF', padding: '40px 24px', borderRadius: '24px', border: '1px solid #E5E7EB', textAlign: 'center' }}>
                            <div style={{ width: '40px', height: '40px', backgroundColor: '#F59E0B', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, margin: '0 auto 20px' }}>4</div>
                            <p style={{ fontSize: '0.9rem', color: '#6B7280', marginBottom: '12px', minHeight: '40px' }}>Addebiti vari</p>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#4B5563', marginBottom: '24px' }}>
                                "CANONE HOMEBANKING"<br />
                                "CANONE DOSSIER TITOLI"<br />
                                "RECUPERO SPESE"<br />
                                ...
                            </div>
                            <div style={{ padding: '8px', backgroundColor: '#FFFBEB', color: '#D97706', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 800 }}>LE TROVI NELL'ESTRATTO CONTO LIQUIDITÀ</div>
                        </div>
                    </div>

                    <div style={{ textAlign: 'center', marginTop: '64px' }}>
                        <p style={{ fontSize: '1.25rem', fontWeight: 700, lineHeight: 1.5 }}>
                            Il problema non è solo pagare delle commissioni.<br />
                            <span style={{ color: '#6B7280', fontWeight: 500 }}>Il problema è non sapere quanto stai pagando davvero.</span>
                        </p>
                    </div>
                </div>
            </section>

            {/* 3. POINT 1: TRANSACTION FEES (WITH TABLE) */}
            <section style={{ padding: '100px 24px' }}>
                <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '32px' }}>
                        <div style={{ width: '50px', height: '50px', backgroundColor: '#EF4444', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.5rem' }}>1</div>
                        <h2 style={{ fontSize: '2.5rem', fontWeight: 800, letterSpacing: '-1px' }}>COMMISSIONI DI TRANSAZIONE</h2>
                    </div>
                    <p style={{ fontSize: '1.2rem', color: '#4B5563', lineHeight: 1.6, marginBottom: '48px', maxWidth: '850px' }}>
                        Ogni volta che acquisti o vendi titoli ti viene sottratta una cifra dalla liquidità che <span style={{ fontWeight: 800, color: '#111827' }}>NON corrisponde</span> con quella che entra nel tuo dossier titoli.
                    </p>

                    <div style={{ position: 'relative', padding: '40px', backgroundColor: '#F9FAFB', borderRadius: '32px', border: '1px solid #E5E7EB', overflowX: 'auto' }}>
                        <div style={{ display: 'flex', gap: '30px', minWidth: '900px', alignItems: 'start', justifyContent: 'center' }}>
                            {/* Liquidity side */}
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'inline-block', padding: '6px 16px', backgroundColor: '#E5E7EB', borderRadius: '8px', fontWeight: 800, fontSize: '0.9rem', marginBottom: '20px' }}>Liquidità</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '80px 100px 140px', gap: '20px', paddingBottom: '12px', borderBottom: '1px solid #D1D5DB', fontSize: '0.8rem', color: '#6B7280', fontWeight: 700 }}>
                                    <span>Data</span><span>Importo</span><span>Causale</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '80px 100px 140px', gap: '20px', paddingTop: '16px', fontWeight: 700, fontSize: '0.9rem' }}>
                                    <span>01.01.2025</span>
                                    <span style={{ color: '#EF4444' }}>-25.500 €</span>
                                    <span>Acquisto Fondo XXX</span>
                                </div>
                            </div>

                            {/* Dossier side */}
                            <div style={{ flex: 1.5 }}>
                                <div style={{ display: 'inline-block', padding: '6px 16px', backgroundColor: '#E5E7EB', borderRadius: '8px', fontWeight: 800, fontSize: '0.9rem', marginBottom: '20px' }}>Dossier Titoli (Portafoglio)</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '80px 100px 100px 60px 60px 100px', gap: '15px', paddingBottom: '12px', borderBottom: '1px solid #D1D5DB', fontSize: '0.8rem', color: '#6B7280', fontWeight: 700 }}>
                                    <span>Data</span><span>ISIN</span><span>Titolo</span><span>Quote</span><span>NAV</span><span>Importo Totale</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '80px 100px 100px 60px 60px 100px', gap: '15px', paddingTop: '16px', fontWeight: 700, fontSize: '0.9rem' }}>
                                    <span>01.01.2025</span>
                                    <span>IT1234567</span>
                                    <span>FONDO ATTIVO</span>
                                    <span>250</span>
                                    <span>100 €</span>
                                    <span style={{ color: '#00C853' }}>25.000 €</span>
                                </div>
                            </div>
                        </div>

                        {/* Connector Arrow */}
                        <div style={{ marginTop: '40px', textAlign: 'center' }}>
                            <div style={{ position: 'relative', display: 'inline-block', width: '80%', height: '20px', borderBottom: '2px solid #EF4444', borderLeft: '2px solid #EF4444', borderRight: '2px solid #EF4444' }}>
                                <div style={{ position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#F9FAFB', padding: '0 20px', color: '#EF4444', fontWeight: 900, fontSize: '1.2rem' }}>Commissioni 500€ (2 %)</div>
                            </div>
                            <p style={{ marginTop: '20px', color: '#EF4444', fontWeight: 900, fontSize: '1.2rem' }}>Non vengono esplicitate da nessuna parte.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* 4. POINT 2: MANAGEMENT FEES & REBATES */}
            <section style={{ padding: '100px 24px', backgroundColor: '#F9FAFB' }}>
                <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '32px' }}>
                        <div style={{ width: '50px', height: '50px', backgroundColor: '#EF4444', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.5rem' }}>2</div>
                        <h2 style={{ fontSize: '2.5rem', fontWeight: 800, letterSpacing: '-1px' }}>COMMISSIONI DI GESTIONE (FONDI)</h2>
                    </div>

                    <div style={{ fontSize: '1.2rem', lineHeight: 1.6, color: '#4B5563', marginBottom: '48px' }}>
                        <p style={{ fontWeight: 800, marginBottom: '8px', color: '#111827' }}>Sono le più subdole.</p>
                        <p>Tu paghi il fondo (senza accorgertene).</p>
                        <p>Il fondo paga la banca (tu non lo sai).</p>
                        <p>La banca continua a proporti fondi su cui guadagna di più.</p>
                        <p style={{ marginTop: '32px', fontSize: '1.8rem', fontWeight: 900, color: '#111827' }}>E' il più grosso conflitto di interessi nel mondo finanziario.</p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '60px', alignItems: 'center' }}>
                        <div style={{ backgroundColor: '#FFFFFF', padding: '48px', borderRadius: '32px', boxShadow: '0 20px 50px rgba(0,0,0,0.05)', textAlign: 'center' }}>
                            <div style={{ fontWeight: 900, marginBottom: '32px', fontSize: '1.1rem' }}>CONFLITTO DI INTERESSI</div>
                            <svg width="100%" height="auto" viewBox="0 0 440 250" style={{ overflow: 'visible', maxWidth: '440px' }}>
                                <defs>
                                    <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                                        <path d="M0,0 L0,6 L9,3 z" fill="#333" />
                                    </marker>
                                </defs>

                                {/* TU -> FONDO */}
                                <path d="M70 180 Q 80 80 170 50" fill="none" stroke="#ccc" strokeWidth="2" strokeDasharray="4,4" markerEnd="url(#arrow)" />
                                <text x="50" y="120" fontWeight="700" fontSize="10" fill="#6B7280" transform="rotate(-50 80 120)">Tu paghi il fondo</text>
                                <text x="50" y="135" fontWeight="600" fontSize="9" fill="#9CA3AF" transform="rotate(-50 80 135)">(Trovi le commissioni nel KID*)</text>

                                {/* FONDO -> BANCA */}
                                <path d="M230 50 Q 320 80 330 180" fill="none" stroke="#EF4444" strokeWidth="4" markerEnd="url(#arrow)" />
                                <rect x="250" y="80" width="100" height="40" rx="8" fill="white" stroke="#EF4444" strokeWidth="1" />
                                <text x="300" y="98" textAnchor="middle" fill="#EF4444" fontWeight="600" fontSize="10">Il fondo paga la banca</text>
                                <text x="300" y="112" textAnchor="middle" fill="#EF4444" fontWeight="900" fontSize="11">REBATES</text>

                                {/* BANCA -> TU */}
                                <path d="M300 200 L 110 200" fill="none" stroke="#111827" strokeWidth="2" markerEnd="url(#arrow)" />
                                <text x="205" y="222" textAnchor="middle" fontWeight="800" fontSize="10" fill="#111827">La banca ti propone il fondo</text>

                                <g transform="translate(200, 40)">
                                    <circle cx="0" cy="0" r="30" fill="#f8f9fa" stroke="#333" strokeWidth="2" />
                                    <rect x="-20" y="-12" width="40" height="24" fill="#333" rx="4" />
                                    <text x="0" y="5" textAnchor="middle" fontSize="11" fontWeight="800" fill="white">🏦🏦</text>
                                </g>
                                <g transform="translate(60, 200)">
                                    <circle cx="0" cy="0" r="30" fill="#fff" stroke="#333" strokeWidth="2" />
                                    <text x="0" y="5" textAnchor="middle" fontSize="11" fontWeight="800" fill="#333">👤</text>
                                </g>
                                <g transform="translate(340, 200)">
                                    <circle cx="0" cy="0" r="30" fill="#111827" />
                                    <rect x="-15" y="-15" width="30" height="30" fill="white" rx="2" />
                                    <text x="0" y="6" textAnchor="middle" fontSize="14" fontWeight="800">🏦</text>
                                </g>
                            </svg>
                        </div>

                        <div>
                            <h3 style={{ fontSize: '2rem', fontWeight: 900, lineHeight: 1.1, marginBottom: '32px' }}>
                                QUESTA NON È CONSULENZA.<br />È TRUFFA.
                            </h3>
                            <h4 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#00C853' }}>
                                I fondi più costosi sono i meno performanti.
                            </h4>
                        </div>
                    </div>

                    <p style={{ marginTop: '48px', fontSize: '0.9rem', color: '#6B7280' }}>
                        *KID (Key Information Document) = è il documento che contiene le informazioni che il fondo e i consulenti sono tenuti per legge a dare agli investitori/clienti. Puoi trovarlo anche online.
                    </p>
                </div>
            </section>

            {/* 5. POINT 3 & 4: ADDEBITI VARI & TASSO ATTIVO */}
            <section style={{ padding: '100px 24px' }}>
                <div style={{ maxWidth: '1000px', margin: '0 auto' }}>

                    {/* Point 3 */}
                    <div style={{ marginBottom: '80px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '24px' }}>
                            <div style={{ width: '40px', height: '40px', backgroundColor: '#EF4444', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.2rem' }}>3</div>
                            <h2 style={{ fontSize: '1.8rem', fontWeight: 800 }}>COMMISSIONI DI GESTIONE (CONSULENZA)</h2>
                        </div>
                        <p style={{ fontSize: '1.2rem', color: '#4B5563', lineHeight: 1.6, maxWidth: '800px' }}>
                            Oltre alle commissioni di gestione dei fondi, spesso la banca applica una <span style={{ color: '#EF4444', fontWeight: 800 }}>fee diretta</span> mensile o trimestrale.<br />
                            <span style={{ fontWeight: 700, color: '#111827' }}>Puoi vederla sull'estratto conto della liquidità.</span>
                        </p>
                    </div>

                    <div style={{ position: 'relative', display: 'flex', justifyContent: 'flex-end', marginBottom: '80px' }}>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', justifyContent: 'flex-end', marginBottom: '24px' }}>
                                <h2 style={{ fontSize: '1.8rem', fontWeight: 800 }}>ADDEBITI VARI</h2>
                                <div style={{ width: '40px', height: '40px', backgroundColor: '#EF4444', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.2rem' }}>3</div>
                            </div>
                            <p style={{ fontSize: '1.2rem', color: '#4B5563', lineHeight: 1.6, marginBottom: '24px' }}>
                                La banca addebita sulla liquidità regolarmente altre spese per:
                            </p>
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '1.5rem', fontWeight: 900, color: '#EF4444', lineHeight: 1.4 }}>
                                <li>Conto corrente</li>
                                <li>Dossier Titoli</li>
                                <li>Canoni Carte</li>
                                <li style={{ color: '#6B7280' }}>...</li>
                            </ul>
                        </div>
                    </div>

                    <div style={{
                        marginTop: '100px',
                        textAlign: 'center',
                        padding: '40px',
                        borderRadius: '24px',
                        backgroundColor: '#ECFDF5',
                        border: '2px solid #00C853'
                    }}>
                        <p style={{ fontSize: '1.5rem', fontWeight: 900, color: '#111827' }}>
                            Una vera banca non ti addebita le spese per il conto corrente,<br />
                            al contrario ti paga un <span style={{ color: '#00C853' }}>TASSO ATTIVO</span>.
                        </p>
                    </div>
                </div>
            </section>

            {/* FINAL CTA */}
            <section style={{ padding: '100px 24px', textAlign: 'center', background: '#f8f9fa' }}>
                <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                    <h2 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '32px' }}>Smetti di regalare soldi.</h2>
                    <p style={{ fontSize: '1.2rem', color: '#6B7280', marginBottom: '48px' }}>Scopri esattamente quanto ti sta costando la tua banca.</p>
                    <Link href="/dashboard" style={{
                        backgroundColor: '#00C853',
                        color: '#FFFFFF',
                        padding: '20px 50px',
                        borderRadius: '50px',
                        textDecoration: 'none',
                        fontWeight: 800,
                        fontSize: '1.2rem',
                        display: 'inline-block',
                        boxShadow: '0 10px 25px rgba(0, 200, 83, 0.4)'
                    }}>
                        ANALIZZA IL MIO PORTAFOGLIO GRATIS →
                    </Link>
                </div>
            </section>

        </div>
    )
}
