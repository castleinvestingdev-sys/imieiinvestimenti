'use client'

import Link from 'next/link'

export default function ReatiPage() {
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
        .warning-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 2rem;
          margin: 3rem 0;
        }
        .warning-card {
          padding: 2rem;
          background: white;
          border-radius: 12px;
          border-left: 4px solid #d32f2f;
          box-shadow: 0 4px 10px rgba(0,0,0,0.05);
        }
        .warning-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
        }
        .warning-card h3 {
          font-size: 1.5rem;
          margin-bottom: 1rem;
          color: #d32f2f;
        }
        .warning-desc {
          font-size: 1rem;
          color: #666;
          margin-bottom: 1.5rem;
          line-height: 1.6;
        }
        .warning-details {
          background: #f8f9fa;
          padding: 1.5rem;
          border-radius: 8px;
        }
        .warning-details h4 {
          font-size: 1rem;
          font-weight: 600;
          margin-bottom: 1rem;
        }
        .warning-details ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .warning-details li {
          font-size: 0.875rem;
          color: #666;
          margin-bottom: 0.5rem;
          padding-left: 1.5rem;
          position: relative;
        }
        .warning-details li:before {
          content: '•';
          position: absolute;
          left: 0;
          color: #d32f2f;
          font-weight: 700;
        }
        .best-practices {
          margin: 4rem 0;
          padding: 3rem;
          background: #f8f9fa;
          border-radius: 12px;
        }
        .practices-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 2rem;
        }
        .practice-item {
          display: flex;
          gap: 1.5rem;
          background: white;
          padding: 1.5rem;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }
        .practice-number {
          flex-shrink: 0;
          width: 40px;
          height: 40px;
          background: linear-gradient(135deg, #00C853 0%, #00A843 100%);
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 1.125rem;
        }
        .disclaimer {
          margin-top: 3rem;
          padding: 2rem;
          background: #fff9e6;
          border: 2px solid #ffd700;
          border-radius: 8px;
        }
      `}</style>

            {/* Header */}
            <section className="page-header">
                <div className="container">
                    <h1>Attenzione ai Reati</h1>
                    <p style={{ fontSize: '1.2rem', color: '#666' }}>Compliance e trasparenza nella gestione del patrimonio</p>
                </div>
            </section>

            {/* Content */}
            <section style={{ padding: '60px 0', background: '#fff' }}>
                <div className="container">
                    <div style={{ marginBottom: '3rem' }}>
                        <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '1rem' }}>Trasparenza e Legalità negli Investimenti</h2>
                        <p style={{ fontSize: '1.1rem', color: '#666', maxWidth: '800px' }}>
                            La gestione del patrimonio deve sempre avvenire nel rispetto delle normative vigenti. È fondamentale essere consapevoli dei rischi legali legati agli investimenti e alla gestione finanziaria.
                        </p>
                    </div>

                    {/* Warning Cards */}
                    <div className="warning-grid">
                        <div className="warning-card">
                            <div className="warning-icon">⚠️</div>
                            <h3>Evasione Fiscale</h3>
                            <p className="warning-desc">L&apos;evasione fiscale è un reato grave che comporta sanzioni penali e amministrative. Tutti i redditi da investimenti devono essere dichiarati.</p>
                            <div className="warning-details">
                                <h4>Cosa Sapere:</h4>
                                <ul>
                                    <li>Obbligo di dichiarazione dei redditi finanziari</li>
                                    <li>Sanzioni fino al 240% dell&apos;imposta evasa</li>
                                    <li>Possibili conseguenze penali</li>
                                    <li>Monitoraggio fiscale degli investimenti esteri</li>
                                </ul>
                            </div>
                        </div>

                        <div className="warning-card">
                            <div className="warning-icon">🚫</div>
                            <h3>Riciclaggio di Denaro</h3>
                            <p className="warning-desc">Il riciclaggio è l&apos;occultamento dell&apos;origine illecita di denaro. Le istituzioni finanziarie sono obbligate a segnalare operazioni sospette.</p>
                            <div className="warning-details">
                                <h4>Cosa Sapere:</h4>
                                <ul>
                                    <li>Controlli antiriciclaggio obbligatori</li>
                                    <li>Tracciabilità delle operazioni finanziarie</li>
                                    <li>Obbligo di identificazione del cliente (KYC)</li>
                                    <li>Segnalazioni di operazioni sospette (SOS)</li>
                                </ul>
                            </div>
                        </div>

                        <div className="warning-card">
                            <div className="warning-icon">🔍</div>
                            <h3>Conflitto di Interessi</h3>
                            <p className="warning-desc">I consulenti finanziari devono agire nell&apos;interesse del cliente, non nel proprio. Attenzione alle commissioni nascoste.</p>
                            <div className="warning-details">
                                <h4>Cosa Sapere:</h4>
                                <ul>
                                    <li>Obbligo di trasparenza sulle commissioni</li>
                                    <li>Divieto di incentivi non dichiarati</li>
                                    <li>Dovere fiduciario verso il cliente</li>
                                    <li>Diritto a consulenza indipendente</li>
                                </ul>
                            </div>
                        </div>

                        <div className="warning-card">
                            <div className="warning-icon">📋</div>
                            <h3>Normativa MiFID II</h3>
                            <p className="warning-desc">La direttiva europea MiFID II protegge gli investitori e garantisce trasparenza nei mercati finanziari.</p>
                            <div className="warning-details">
                                <h4>Cosa Sapere:</h4>
                                <ul>
                                    <li>Obbligo di valutazione di adeguatezza</li>
                                    <li>Trasparenza sui costi e commissioni</li>
                                    <li>Protezione degli investitori retail</li>
                                    <li>Diritto all&apos;informazione completa</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* Best Practices */}
                    <div className="best-practices">
                        <h2 style={{ textAlign: 'center', marginBottom: '3rem' }}>Come Proteggersi</h2>
                        <div className="practices-grid">
                            <div className="practice-item">
                                <div className="practice-number">1</div>
                                <div>
                                    <h4 style={{ marginBottom: '0.5rem', fontSize: '1.125rem' }}>Richiedi Trasparenza Totale</h4>
                                    <p style={{ margin: 0, fontSize: '0.95rem', color: '#666' }}>Pretendi documentazione completa su tutte le commissioni e i costi applicati ai tuoi investimenti.</p>
                                </div>
                            </div>

                            <div className="practice-item">
                                <div className="practice-number">2</div>
                                <div>
                                    <h4 style={{ marginBottom: '0.5rem', fontSize: '1.125rem' }}>Verifica le Autorizzazioni</h4>
                                    <p style={{ margin: 0, fontSize: '0.95rem', color: '#666' }}>Assicurati che il tuo consulente sia regolarmente iscritto all&apos;albo e autorizzato da CONSOB.</p>
                                </div>
                            </div>

                            <div className="practice-item">
                                <div className="practice-number">3</div>
                                <div>
                                    <h4 style={{ marginBottom: '0.5rem', fontSize: '1.125rem' }}>Dichiara Tutti i Redditi</h4>
                                    <p style={{ margin: 0, fontSize: '0.95rem', color: '#666' }}>Dichiara sempre tutti i redditi finanziari nella tua dichiarazione dei redditi.</p>
                                </div>
                            </div>

                            <div className="practice-item">
                                <div className="practice-number">4</div>
                                <div>
                                    <h4 style={{ marginBottom: '0.5rem', fontSize: '1.125rem' }}>Scegli Consulenza Indipendente</h4>
                                    <p style={{ margin: 0, fontSize: '0.95rem', color: '#666' }}>Preferisci consulenti fee-only che non ricevono commissioni dai prodotti venduti.</p>
                                </div>
                            </div>

                            <div className="practice-item">
                                <div className="practice-number">5</div>
                                <div>
                                    <h4 style={{ marginBottom: '0.5rem', fontSize: '1.125rem' }}>Monitora Regolarmente</h4>
                                    <p style={{ margin: 0, fontSize: '0.95rem', color: '#666' }}>Controlla periodicamente i tuoi investimenti e confrontali con i benchmark di mercato.</p>
                                </div>
                            </div>

                            <div className="practice-item">
                                <div className="practice-number">6</div>
                                <div>
                                    <h4 style={{ marginBottom: '0.5rem', fontSize: '1.125rem' }}>Conserva la Documentazione</h4>
                                    <p style={{ margin: 0, fontSize: '0.95rem', color: '#666' }}>Mantieni tutta la documentazione relativa ai tuoi investimenti per almeno 10 anni.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Disclaimer */}
                    <div className="disclaimer">
                        <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>⚖️ Nota Legale</h3>
                        <p style={{ fontSize: '0.875rem', color: '#666', margin: 0, lineHeight: 1.6 }}>
                            iMieiInvestimenti.it fornisce analisi indipendenti a scopo informativo. Non siamo consulenti finanziari autorizzati e non forniamo consulenza personalizzata. Per decisioni di investimento, consulta sempre un professionista abilitato. Le informazioni fornite non costituiscono sollecitazione all&apos;investimento.
                        </p>
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section style={{ padding: '80px 0', background: '#f8f9fa', textAlign: 'center' }}>
                <div className="container">
                    <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '1rem' }}>Verifica la trasparenza dei tuoi investimenti</h2>
                    <p style={{ color: '#666', marginBottom: '2rem' }}>Analizza il tuo portafoglio per scoprire tutti i costi applicati</p>
                    <Link href="/dashboard" style={{ background: '#00C853', color: 'white', padding: '16px 40px', borderRadius: '50px', fontWeight: 800, textDecoration: 'none', display: 'inline-block' }}>
                        INIZIA L&apos;ANALISI
                    </Link>
                </div>
            </section>
        </>
    )
}
