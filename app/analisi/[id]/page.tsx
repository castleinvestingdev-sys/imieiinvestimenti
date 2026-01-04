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
        return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value)
    }

    const formatDate = (dateStr: string) => {
        if (!dateStr) return 'N/D'
        return new Date(dateStr).toLocaleDateString('it-IT')
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <section className="bg-white border-b border-gray-100">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                        <div className="flex items-center gap-4">
                            <Link href="/dashboard" className="text-gray-500 hover:text-gray-900">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                            </Link>
                            <div>
                                <div className="flex gap-2 mb-2">
                                    <span className="bg-gray-800 text-white px-3 py-1 rounded-full text-xs font-bold uppercase">
                                        {isDossier ? 'INVESTIMENTI' : 'LIQUIDITÀ'}
                                    </span>
                                    <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold uppercase">
                                        TRIMESTRALE
                                    </span>
                                </div>
                                <h1 className="text-2xl font-extrabold text-gray-900">{analysis.bank_name}</h1>
                                <p className="text-gray-500 text-sm">
                                    Dossier: <span className="text-red-500 font-semibold">{analysis.benchmark_comparison || 'N/D'}</span>
                                </p>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-gray-400 text-xs uppercase font-bold">Periodo Analisi</div>
                            <div className="text-lg font-bold text-gray-900">
                                {formatDate(analysis.period_start)} — {formatDate(analysis.period_end)}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Main Content */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Summary Cards */}
                <div className="grid md:grid-cols-3 gap-6 mb-8">
                    {/* Rendimenti */}
                    <div className="bg-white rounded-xl shadow-sm p-6">
                        <h3 className="text-gray-400 text-xs uppercase font-bold mb-4">Rendimenti</h3>
                        <div className="flex justify-between items-center mb-4">
                            <span className="text-gray-600">Rendimento (Netto)</span>
                            <span className="text-2xl font-bold text-emerald-500">
                                {analysis.net_return ? `${analysis.net_return.toFixed(1)}%` : '+0.0%'}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-600">Gap vs Benchmark</span>
                            <span className="text-red-500 font-bold">-5.1%</span>
                        </div>
                    </div>

                    {/* Costi e Oneri */}
                    <div className="bg-white rounded-xl shadow-sm p-6">
                        <h3 className="text-gray-400 text-xs uppercase font-bold mb-4">Costi e Oneri</h3>
                        <div className="flex justify-between items-center mb-4">
                            <span className="text-gray-600">Costi Gestione (TER)</span>
                            <span className="text-2xl font-bold text-emerald-500">
                                {costs.managementFees ? `${costs.managementFees.toFixed(2)}%` : '0.00%'}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-600">Operazioni totali</span>
                            <span className="font-bold">{transactions.length} eseguiti</span>
                        </div>
                    </div>

                    {/* Asset Allocation */}
                    <div className="bg-white rounded-xl shadow-sm p-6">
                        <h3 className="text-gray-400 text-xs uppercase font-bold mb-4">Asset Allocation</h3>
                        <div className="space-y-3">
                            <div>
                                <div className="flex justify-between text-sm mb-1">
                                    <span>Quota Azionaria</span>
                                    <span className="font-bold">60%</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div className="bg-emerald-500 h-2 rounded-full" style={{ width: '60%' }}></div>
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between text-sm mb-1">
                                    <span>Quota Obbligazionaria</span>
                                    <span className="font-bold">40%</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div className="bg-blue-500 h-2 rounded-full" style={{ width: '40%' }}></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Holdings Table */}
                {isDossier && holdings.length > 0 && (
                    <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">
                            Composizione del Dossier <span className="text-gray-400">({holdings.length} strumenti)</span>
                        </h3>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="text-left text-xs text-gray-400 uppercase border-b border-gray-100">
                                        <th className="pb-3">ISIN / Ticker</th>
                                        <th className="pb-3">Strumento</th>
                                        <th className="pb-3">Asset Class</th>
                                        <th className="pb-3 text-right">Valore (€)</th>
                                        <th className="pb-3 text-right">Quota %</th>
                                        <th className="pb-3 text-right">TER %</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {holdings.map((holding: { isin?: string; name?: string; value?: number }, idx: number) => (
                                        <tr key={idx}>
                                            <td className="py-3">
                                                <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs font-mono">
                                                    {holding.isin || 'N/A'}
                                                </span>
                                            </td>
                                            <td className="py-3 font-medium">{holding.name || 'Strumento'}</td>
                                            <td className="py-3">
                                                <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-xs font-bold">
                                                    FONDI
                                                </span>
                                            </td>
                                            <td className="py-3 text-right">{formatCurrency(holding.value || 0)}</td>
                                            <td className="py-3 text-right font-bold">
                                                {analysis.portfolio_value ? ((holding.value || 0) / analysis.portfolio_value * 100).toFixed(1) : 0}%
                                            </td>
                                            <td className="py-3 text-right text-emerald-500 font-bold">1.80%</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Dividends/Cash Flows */}
                {dividends.length > 0 && (
                    <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">
                            Dettaglio Flussi di Cassa <span className="text-gray-400">(Dividendi e Cedole)</span>
                        </h3>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="text-left text-xs text-gray-400 uppercase border-b border-gray-100">
                                        <th className="pb-3">Data</th>
                                        <th className="pb-3">Ticker / ISIN</th>
                                        <th className="pb-3 text-right">Lordo (€)</th>
                                        <th className="pb-3 text-right">Tasse (€)</th>
                                        <th className="pb-3 text-right">Netto (€)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {dividends.map((div: { date?: string; description?: string; grossAmount?: number; tax?: number; netAmount?: number }, idx: number) => (
                                        <tr key={idx}>
                                            <td className="py-3">{div.date || 'N/D'}</td>
                                            <td className="py-3">{div.description || 'N/D'}</td>
                                            <td className="py-3 text-right">{formatCurrency(div.grossAmount || 0)}</td>
                                            <td className="py-3 text-right text-red-500">{formatCurrency(div.tax || 0)}</td>
                                            <td className="py-3 text-right">{formatCurrency(div.netAmount || 0)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Audit Forense */}
                <div className="bg-gray-800 rounded-2xl p-8 text-white">
                    <div className="flex items-center gap-3 mb-6">
                        <span className="text-3xl">🔍</span>
                        <div>
                            <h3 className="text-xl font-bold">AUDIT FORENSE</h3>
                            <p className="text-gray-400 text-sm">Analisi profonda dei costi occulti e delle inefficienze rispetto al benchmark di mercato.</p>
                        </div>
                        <span className="ml-auto bg-gray-700 text-gray-400 px-3 py-1 rounded text-xs">ALGORITMO V.2.1 ACTIVE</span>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="bg-gray-700/50 rounded-xl p-6">
                            <div className="text-gray-400 text-xs uppercase mb-2">Costo Opportunità Generato</div>
                            <div className="text-3xl font-bold text-red-400">-0,00 €</div>
                            <p className="text-gray-400 text-sm mt-2">
                                Quanto il tuo portafoglio ha &quot;perso&quot; rispetto a una gestione benchmark efficiente.
                            </p>
                        </div>
                        <div className="bg-gray-700/50 rounded-xl p-6">
                            <div className="text-gray-400 text-xs uppercase mb-2">Costi Occulti (Spread)</div>
                            <div className="text-3xl font-bold text-red-400">-0,00 €</div>
                            <p className="text-gray-400 text-sm mt-2">
                                Differenza media vs NAV: 0.00%
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
