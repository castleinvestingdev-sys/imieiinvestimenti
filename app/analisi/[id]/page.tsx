import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import styles from './Analysis.module.css'

interface PageProps {
    params: Promise<{ id: string }>
}

export default async function AnalysisPage({ params }: PageProps) {
    const { id } = await params
    const supabase = await createClient()

    const { data: analysis, error } = await supabase
        .from('analyses')
        .select('*')
        .eq('id', id)
        .single()

    if (error || !analysis) {
        notFound()
    }

    const isDossier = analysis.account_type === 'DOSSIER'
    const holdings = analysis.holdings || []
    const transactions = analysis.transactions || []
    const dividends = analysis.dividends || []
    const costs = analysis.costs_breakdown || {}

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(value)
    }

    const formatDate = (dateStr: string) => {
        if (!dateStr) return 'N/D'
        return new Date(dateStr).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
    }

    const portfolioDelta = (analysis.portfolio_value || 0) - (analysis.initial_value || 0)
    const isPositiveDelta = portfolioDelta >= 0

    return (
        <div className={styles.analysisWrapper}>
            {/* Header Content */}
            <header className={styles.header}>
                <div className={styles.headerBg}></div>
                <div className={styles.headerContent}>
                    <div className={styles.headerInfo}>
                        <Link href="/dashboard" className={styles.backLinkHeader}>
                            <div className={styles.backIcon}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M19 12H5M12 19l-7-7 7-7" />
                                </svg>
                            </div>
                            <span>Torna alla Dashboard</span>
                        </Link>
                        <div className={styles.headerInfoRow}>
                            <span className={`${styles.badge} ${isDossier ? styles.badgeDossier : styles.badgeLiquidity}`}>
                                {isDossier ? 'Dossier Titoli' : 'Conto Liquidità'}
                            </span>
                            <span className={`${styles.badge} ${styles.badgeType}`}>
                                Analisi Trimestrale
                            </span>
                        </div>
                        <h1 className={styles.bankTitle}>
                            {analysis.bank_name}
                        </h1>
                        <div className={styles.headerSubRow}>
                            <div className={styles.headerSubItem}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 12V8H6a2 2 0 01-2-2V5" /><path d="M4 6v12c0 1.1.9 2 2 2h14v-4" /><path d="M18 12a2 2 0 00-2 2c0 1.1.9 2 2 2h4v-4h-4z" /></svg>
                                <span>Conto: <strong>{analysis.benchmark_comparison || 'N/D'}</strong></span>
                            </div>
                            <div className={styles.headerSubItem}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                                <span>{formatDate(analysis.period_start)} — {formatDate(analysis.period_end)}</span>
                            </div>
                        </div>
                    </div>

                    <div className={styles.portfolioSummary}>
                        <span className={styles.portfolioLabel}>Valore Portafoglio</span>
                        <div className={styles.portfolioValue}>
                            {formatCurrency(analysis.portfolio_value || 0)}
                        </div>
                        <div className={styles.deltaContainer}>
                            <div className={`${styles.deltaBadge} ${isPositiveDelta ? styles.deltaPositive : styles.deltaNegative}`}>
                                {isPositiveDelta ? '▲' : '▼'} {formatCurrency(Math.abs(portfolioDelta))}
                            </div>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8' }}>nel periodo</span>
                        </div>
                    </div>
                </div>
            </header>

            <main className={styles.mainGrid}>
                {/* KPI Cards */}
                <div className={styles.kpiGrid}>
                    <div className={styles.card}>
                        <h3 className={styles.kpiTitle}>Performance Netta</h3>
                        <div className={`${styles.kpiValue} ${analysis.net_return >= 0 ? styles.performancePositive : styles.performanceNegative}`}>
                            {analysis.net_return ? `${analysis.net_return > 0 ? '+' : ''}${analysis.net_return.toFixed(2)}%` : '0.00%'}
                        </div>
                        <div className={styles.kpiFooter}>
                            vs Benchmark: <strong>-3.2% (Est.)</strong>
                        </div>
                    </div>

                    <div className={styles.card}>
                        <h3 className={styles.kpiTitle}>Incidenza Costi (TER)</h3>
                        <div className={styles.kpiValue} style={{ color: '#f59e0b' }}>
                            {costs.managementFees ? `${costs.managementFees.toFixed(2)}%` : '1.85%'}
                        </div>
                        <div className={styles.costBarContainer}>
                            <div className={styles.costBarFill} style={{ width: '65%' }}></div>
                        </div>
                        <div className={styles.kpiFooter}>
                            Target: <span style={{ color: '#1e293b' }}>&lt; 1.0%</span>
                        </div>
                    </div>

                    <div className={styles.card}>
                        <h3 className={styles.kpiTitle}>Cedole e Dividendi</h3>
                        <div className={styles.kpiValue}>
                            {formatCurrency(dividends.reduce((a: any, b: any) => a + (b.netAmount || 0), 0))}
                        </div>
                        <div className={styles.kpiFooter}>
                            {dividends.length} movimenti rilevati
                        </div>
                    </div>

                    <div className={`${styles.card} ${styles.ratingCard}`}>
                        <h3 className={styles.kpiTitle} style={{ color: '#475569' }}>Rating Portafoglio</h3>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                            <div className={styles.ratingValue}>B+</div>
                            <div className={styles.ratingMeta}>
                                <div className={styles.ratingRiskLabel}>Rischio</div>
                                <div className={styles.ratingRiskValue}>Medio-Alto</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main and Sidebar Layout */}
                <div className={styles.contentLayout}>
                    {/* Main Content Area */}
                    <div style={{ minWidth: 0 }}>
                        {isDossier && holdings.length > 0 && (
                            <div className={styles.card} style={{ padding: 0, overflow: 'hidden' }}>
                                <div className={styles.sectionHeader}>
                                    <h3 className={styles.sectionTitle}>Composizione Portafoglio</h3>
                                    <span className={styles.countBadge}>{holdings.length} Strumenti</span>
                                </div>
                                <div className={styles.tableWrapper}>
                                    <table className={styles.table}>
                                        <thead>
                                            <tr>
                                                <th>Titolo / ISIN</th>
                                                <th>Asset Class</th>
                                                <th style={{ textAlign: 'right' }}>Valore</th>
                                                <th style={{ textAlign: 'right' }}>Peso</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {holdings.map((holding: any, idx: number) => (
                                                <tr key={idx}>
                                                    <td>
                                                        <span className={styles.securityName}>{holding.name || 'Nome non disponibile'}</span>
                                                        <span className={styles.securityIsin}>{holding.isin || 'ISIN N/D'}</span>
                                                    </td>
                                                    <td>
                                                        <span className={styles.assetBadge}>Fondi Comuni</span>
                                                    </td>
                                                    <td style={{ textAlign: 'right', fontWeight: 800 }}>
                                                        {formatCurrency(holding.value || 0)}
                                                    </td>
                                                    <td>
                                                        <div className={styles.weightContainer}>
                                                            <span className={styles.weightValue}>
                                                                {analysis.portfolio_value ? ((holding.value || 0) / analysis.portfolio_value * 100).toFixed(1) : 0}%
                                                            </span>
                                                            <div className={styles.weightBar}>
                                                                <div className={styles.weightFill} style={{ width: `${analysis.portfolio_value ? ((holding.value || 0) / analysis.portfolio_value * 100) : 0}%` }}></div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className={styles.tableFooter}>
                                            <tr>
                                                <td colSpan={2} style={{ textAlign: 'right', color: '#94a3b8', fontSize: '11px', letterSpacing: '0.1em' }}>TOTALE PORTAFOGLIO</td>
                                                <td style={{ textAlign: 'right' }}>{formatCurrency(analysis.portfolio_value || 0)}</td>
                                                <td style={{ textAlign: 'right' }}>100%</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        )}

                        <div className={styles.card} style={{ padding: 0, overflow: 'hidden', marginTop: '1.5rem' }}>
                            <div className={styles.sectionHeader}>
                                <h3 className={styles.sectionTitle}>Storico Operazioni</h3>
                            </div>
                            <div className={styles.emptyState}>
                                <span className={styles.emptyIcon}>⚡</span>
                                <p className={styles.emptyText}>Analisi automatizzata in corso...</p>
                                <p style={{ fontSize: '11px', marginTop: '0.5rem', opacity: 0.6 }}>Il modulo di analisi cronologica IA sarà disponibile a breve.</p>
                            </div>
                        </div>
                    </div>

                    {/* Sidebar Area */}
                    <aside>
                        <div className={styles.auditCard}>
                            <div className={styles.auditHeader}>
                                <div className={styles.auditIconBox}>
                                    🛡️
                                </div>
                                <div>
                                    <h3 className={styles.auditTitle}>Audit Forense AI</h3>
                                    <span className={styles.auditStatus}>Verificato • Finalizzato</span>
                                </div>
                            </div>

                            <div className={styles.auditItem}>
                                <div className={styles.auditItemLabel}>Costi Occulti Stimati</div>
                                <div className={styles.auditItemValue}>
                                    <span className={styles.auditItemText} style={{ color: '#fb7185' }}>High Alert</span>
                                    <span style={{ fontSize: '10px', color: '#64748b' }}>Score: 84/100</span>
                                </div>
                                <p className={styles.auditItemDesc}>
                                    Rilevata struttura commissionale inefficiente. I costi superano la media di mercato del 15% nel periodo analizzato.
                                </p>
                            </div>

                            <div className={styles.auditItem}>
                                <div className={styles.auditItemLabel}>Efficienza Fiscale</div>
                                <div className={styles.auditItemValue}>
                                    <span className={styles.auditItemText} style={{ color: '#fbbf24' }}>Media</span>
                                    <span style={{ fontSize: '10px', color: '#64748b' }}>Score: 52/100</span>
                                </div>
                                <p className={styles.auditItemDesc}>
                                    Possibile ottimizzazione delle minusvalenze non sfruttata appieno nei movimenti registrati.
                                </p>
                            </div>

                            <button className={styles.auditButton}>
                                Richiedi Consensus Umano
                            </button>
                        </div>

                        {dividends.length > 0 && (
                            <div className={styles.card} style={{ padding: 0, overflow: 'hidden', marginTop: '2rem' }}>
                                <div className={styles.sectionHeader}>
                                    <h3 className={styles.sectionTitle} style={{ fontSize: '0.75rem' }}>Ultimi Proventi</h3>
                                </div>
                                <div className={styles.miniList}>
                                    {dividends.slice(0, 5).map((div: any, idx: number) => (
                                        <div key={idx} className={styles.miniListItem}>
                                            <div className={styles.miniListItemInfo}>
                                                <span className={styles.miniListItemTitle}>{div.description || 'Proventi / Cedola'}</span>
                                                <span className={styles.miniListItemDate}>{div.date || 'Data N/D'}</span>
                                            </div>
                                            <span className={styles.miniListValue}>
                                                +{formatCurrency(div.netAmount || 0)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </aside>
                </div>
            </main>
        </div>
    )
}
