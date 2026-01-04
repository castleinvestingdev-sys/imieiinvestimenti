export default function RendimentiPage() {
    return (
        <div className="max-w-7xl mx-auto px-4 py-16">
            <h1 className="text-4xl font-extrabold text-gray-900 text-center mb-4">Rendimenti di Mercato</h1>
            <p className="text-gray-600 text-center max-w-2xl mx-auto mb-12">
                Confronta sempre i tuoi investimenti con i rendimenti di mercato per capire se la tua strategia sta funzionando.
            </p>

            {/* Market Cards */}
            <div className="grid md:grid-cols-3 gap-6 mb-16">
                <div className="bg-white rounded-xl shadow-sm p-6 border-t-4 border-emerald-500">
                    <h3 className="text-lg font-bold text-gray-900 mb-2">MSCI World</h3>
                    <p className="text-gray-500 text-sm mb-4">Indice globale azionario</p>
                    <div className="text-3xl font-extrabold text-emerald-500">+15.2%</div>
                    <div className="text-gray-400 text-sm">Ultimo anno</div>
                </div>

                <div className="bg-white rounded-xl shadow-sm p-6 border-t-4 border-blue-500">
                    <h3 className="text-lg font-bold text-gray-900 mb-2">S&P 500</h3>
                    <p className="text-gray-500 text-sm mb-4">Mercato USA</p>
                    <div className="text-3xl font-extrabold text-blue-500">+18.7%</div>
                    <div className="text-gray-400 text-sm">Ultimo anno</div>
                </div>

                <div className="bg-white rounded-xl shadow-sm p-6 border-t-4 border-purple-500">
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Euro Stoxx 50</h3>
                    <p className="text-gray-500 text-sm mb-4">Mercato Europeo</p>
                    <div className="text-3xl font-extrabold text-purple-500">+8.4%</div>
                    <div className="text-gray-400 text-sm">Ultimo anno</div>
                </div>
            </div>

            {/* Comparison Table */}
            <div className="bg-gray-50 rounded-2xl p-8 mb-16">
                <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">Esempio di Confronto</h2>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="text-left bg-gray-800 text-white">
                                <th className="p-4 rounded-tl-lg">Scenario</th>
                                <th className="p-4">Investimento</th>
                                <th className="p-4">Rendimento</th>
                                <th className="p-4">Dopo 10 anni</th>
                                <th className="p-4 rounded-tr-lg">Guadagno</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="bg-white border-b">
                                <td className="p-4 font-semibold">Il tuo portafoglio</td>
                                <td className="p-4">€100.000</td>
                                <td className="p-4 text-red-500">+4.5%</td>
                                <td className="p-4">€155.297</td>
                                <td className="p-4 text-red-500">+€55.297</td>
                            </tr>
                            <tr className="bg-emerald-50">
                                <td className="p-4 font-semibold">MSCI World (benchmark)</td>
                                <td className="p-4">€100.000</td>
                                <td className="p-4 text-emerald-600">+10.2%</td>
                                <td className="p-4">€264.844</td>
                                <td className="p-4 text-emerald-600">+€164.844</td>
                            </tr>
                            <tr className="bg-red-50">
                                <td className="p-4 font-bold">Differenza (Opportunità Persa)</td>
                                <td className="p-4">-</td>
                                <td className="p-4 text-red-600 font-bold">-5.7%</td>
                                <td className="p-4 text-red-600 font-bold">-€109.547</td>
                                <td className="p-4 text-red-600 font-bold">-€109.547</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
