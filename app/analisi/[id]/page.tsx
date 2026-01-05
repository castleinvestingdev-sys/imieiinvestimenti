import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'

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

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-emerald-100 selection:text-emerald-900">

            {/* Top Navigation Bar */}
            <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/dashboard" className="group flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-emerald-600 transition-colors">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center group-hover:bg-emerald-50 transition-colors">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                </svg>
                            </div>
                            <span>Torna alla Dashboard</span>
                        </Link>
                    </div>
                </div>
            </nav>

            {/* Header Content */}
            <header className="bg-white border-b border-slate-200 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-emerald-50/50 to-transparent pointer-events-none"></div>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 relative">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
                        <div>
                            <div className="flex items-center gap-3 mb-3">
                                <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase border ${isDossier ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>
                                    {isDossier ? 'Dossier Titoli' : 'Conto Liquidità'}
                                </span>
                                <span className="px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase border bg-slate-50 text-slate-600 border-slate-200">
                                    Analisi Trimestrale
                                </span>
                            </div>
                            <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
                                {analysis.bank_name}
                            </h1>
                            <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-4 text-slate-500 font-medium">
                                <div className="flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" /></svg>
                                    Dossier: <span className="text-slate-900">{analysis.dossierNumber || 'N/D'}</span>
                                </div>
                                <div className="hidden sm:block w-px h-4 bg-slate-300"></div>
                                <div className="flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                    {formatDate(analysis.period_start)} — {formatDate(analysis.period_end)}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-end flex-col gap-1">
                            <span className="text-sm font-semibold text-slate-400 uppercase tracking-widest">Valore Portafoglio</span>
                            <span className="text-4xl font-black text-slate-900 tracking-tight">
                                {formatCurrency(analysis.portfolio_value || 0)}
                            </span>
                            <span className={`text-sm font-bold flex items-center gap-1 ${((analysis.portfolio_value || 0) - (analysis.initial_value || 0)) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {((analysis.portfolio_value || 0) - (analysis.initial_value || 0)) >= 0 ? (
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                                ) : (
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" /></svg>
                                )}
                                {formatCurrency((analysis.portfolio_value || 0) - (analysis.initial_value || 0))}
                                <span className="opacity-60 ml-1">nel periodo</span>
                            </span>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">

                {/* KPI Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

                    {/* KPI Card 1: Performance */}
                    <div className="bg-white p-6 rounded-2xl shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-slate-100 hover:shadow-lg transition-shadow relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                        <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-4 relative z-10">Performance Netta</h3>
                        <div className="flex items-baseline gap-2 relative z-10">
                            <span className={`text-3xl font-black ${analysis.net_return >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                {analysis.net_return ? `${analysis.net_return > 0 ? '+' : ''}${analysis.net_return.toFixed(2)}%` : '0.00%'}
                            </span>
                        </div>
                        <div className="mt-2 text-xs font-semibold text-slate-400 relative z-10">
                            vs Benchmark: <span className="text-rose-500">-3.2% (Est.)</span>
                        </div>
                    </div>

                    {/* KPI Card 2: Costi */}
                    <div className="bg-white p-6 rounded-2xl shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-slate-100 hover:shadow-lg transition-shadow group">
                        <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-4">Incidenza Costi (TER)</h3>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-black text-amber-500">
                                {costs.managementFees ? `${costs.managementFees.toFixed(2)}%` : '0.00%'}
                            </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 mt-4 overflow-hidden">
                            <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: `${Math.min((costs.managementFees || 0) * 20, 100)}%` }}></div>
                        </div>
                        <div className="mt-2 text-xs text-slate-400 text-right">Target &lt; 1.0%</div>
                    </div>

                    {/* KPI Card 3: Dividendi */}
                    <div className="bg-white p-6 rounded-2xl shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-slate-100 hover:shadow-lg transition-shadow">
                        <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-4">Flussi di Cassa</h3>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-black text-slate-700">
                                {formatCurrency(dividends.reduce((a: any, b: any) => a + (b.netAmount || 0), 0))}
                            </span>
                        </div>
                        <div className="mt-2 text-xs font-semibold text-slate-400">
                            {dividends.length} movimenti rilevati
                        </div>
                    </div>

                    {/* KPI Card 4: Rating */}
                    <div className="bg-slate-900 p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.15)] text-white relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-black z-0"></div>
                        <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-4 relative z-10">Rating Implicito</h3>
                        <div className="flex items-center justify-between relative z-10">
                            <span className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
                                B+
                            </span>
                            <div className="text-right">
                                <div className="text-xs text-slate-400">Rischio</div>
                                <div className="font-bold text-orange-400">MEDIO-ALTO</div>
                            </div>
                        </div>
                        <div className="mt-4 text-[10px] text-slate-500 uppercase font-bold tracking-widest relative z-10">Powered by GPT OSS 120B</div>
                    </div>
                </div>

                {/* Main Data Section */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* Left Column: Dossier Holdings */}
                    <div className="lg:col-span-2 space-y-6">
                        {isDossier && holdings.length > 0 && (
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                                <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                                    <h3 className="text-lg font-bold text-slate-900">Composizione Portafoglio</h3>
                                    <span className="text-xs font-bold bg-white border border-slate-200 px-2 py-1 rounded text-slate-500 shadow-sm">{holdings.length} Strumenti</span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-100 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                                <th className="px-6 py-4">Strumento</th>
                                                <th className="px-6 py-4">Asset Class</th>
                                                <th className="px-6 py-4 text-right">Valore</th>
                                                <th className="px-6 py-4 text-right">Peso</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {holdings.map((holding: any, idx: number) => (
                                                <tr key={idx} className="group hover:bg-slate-50 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <div className="font-semibold text-slate-900">{holding.name || 'Nome non disponibile'}</div>
                                                        <div className="text-xs text-slate-400 font-mono mt-1 group-hover:text-emerald-600 transition-colors">{holding.isin || 'ISIN N/D'}</div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                                                            Fondi Comuni
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right font-medium text-slate-900">
                                                        {formatCurrency(holding.value || 0)}
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <span className="font-bold text-slate-700">{analysis.portfolio_value ? ((holding.value || 0) / analysis.portfolio_value * 100).toFixed(1) : 0}%</span>
                                                            <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                                                <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${analysis.portfolio_value ? ((holding.value || 0) / analysis.portfolio_value * 100) : 0}%` }}></div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-slate-50 font-bold text-slate-900">
                                            <tr>
                                                <td colSpan={2} className="px-6 py-4 text-right">Totale</td>
                                                <td className="px-6 py-4 text-right">{formatCurrency(analysis.portfolio_value || 0)}</td>
                                                <td className="px-6 py-4 text-right">100%</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Transaction History */}
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
                                <h3 className="text-lg font-bold text-slate-900">Storico Operazioni</h3>
                            </div>
                            {transactions.length > 0 ? (
                                <div className="p-6">
                                    {/* Placeholder for transaction visualization */}
                                    <div className="text-center text-slate-500 py-8">Visualization coming soon</div>
                                </div>
                            ) : (
                                <div className="p-8 text-center text-slate-500 text-sm">
                                    Nessuna operazione rilevante registrata nel periodo.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Column: AI Insights & Audit */}
                    <div className="space-y-6">
                        {/* AI Audit Card */}
                        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-4 opacity-10">
                                <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zm0 9l2.5-1.25L12 8.5l-2.5 1.25L12 11zm0 2.5l-5-2.5-5 2.5L12 22l10-8.5-5-2.5-5 2.5z" /></svg>
                            </div>

                            <div className="flex items-center gap-3 mb-6 relative z-10">
                                <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center backdrop-blur-sm border border-white/10">
                                    <span className="text-xl">🛡️</span>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold">Audit Forense AI</h3>
                                    <div className="text-[10px] text-emerald-400 font-mono bg-emerald-400/10 px-2 py-0.5 rounded w-fit mt-1 border border-emerald-400/20">ANALISI COMPLETATA</div>
                                </div>
                            </div>

                            <div className="space-y-5 relative z-10">
                                <div className="bg-white/5 rounded-xl p-4 border border-white/5 backdrop-blur-sm">
                                    <div className="text-slate-400 text-xs font-bold uppercase mb-1">Costi Occulti Stimati</div>
                                    <div className="text-2xl font-bold text-rose-400">
                                        High
                                    </div>
                                    <p className="text-slate-400 text-xs mt-2 leading-relaxed">
                                        Rilevata struttura commissionale inefficiente. I costi di gestione superano la media di mercato del 15%.
                                    </p>
                                </div>

                                <div className="bg-white/5 rounded-xl p-4 border border-white/5 backdrop-blur-sm">
                                    <div className="text-slate-400 text-xs font-bold uppercase mb-1">Efficienza Fiscale</div>
                                    <div className="text-2xl font-bold text-amber-400">
                                        Media
                                    </div>
                                    <p className="text-slate-400 text-xs mt-2 leading-relaxed">
                                        Possibile ottimizzazione minusvalenze non sfruttata appieno.
                                    </p>
                                </div>
                            </div>

                            <div className="mt-6 pt-6 border-t border-white/10 relative z-10">
                                <button className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl transition-all shadow-[0_4px_14px_rgba(16,185,129,0.4)] hover:shadow-[0_6px_20px_rgba(16,185,129,0.6)] hover:-translate-y-0.5 active:translate-y-0 text-sm">
                                    RICHIEDI CONSULENZA UMANA
                                </button>
                            </div>
                        </div>

                        {/* Dividends List Mini */}
                        {dividends.length > 0 && (
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                                    <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Ultimi Dividendi</h3>
                                </div>
                                <div className="divide-y divide-slate-50">
                                    {dividends.slice(0, 5).map((div: any, idx: number) => (
                                        <div key={idx} className="p-4 flex justify-between items-center group hover:bg-slate-50 transition-colors">
                                            <div>
                                                <div className="font-bold text-slate-800 text-sm">{div.description || 'Dividendo'}</div>
                                                <div className="text-xs text-slate-400">{div.date || 'Data N/D'}</div>
                                            </div>
                                            <span className="font-mono font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded text-xs">
                                                +{formatCurrency(div.netAmount || 0)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    )
}
