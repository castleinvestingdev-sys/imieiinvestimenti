export default function ReatiPage() {
    return (
        <div className="max-w-4xl mx-auto px-4 py-16">
            <h1 className="text-4xl font-extrabold text-gray-900 text-center mb-4">Attenzione ai Rebates</h1>
            <p className="text-gray-600 text-center max-w-2xl mx-auto mb-12">
                Scopri come le banche e i consulenti guadagnano dai tuoi investimenti senza che tu lo sappia.
            </p>

            <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded-r-lg mb-8">
                <h2 className="text-xl font-bold text-red-700 mb-2">⚠️ Cosa sono i Rebates?</h2>
                <p className="text-red-700">
                    I rebates sono commissioni che le società di gestione pagano alle banche per collocare i loro prodotti.
                    Questo crea un conflitto di interesse: il consulente potrebbe consigliarti prodotti più costosi
                    perché la banca ci guadagna di più.
                </p>
            </div>

            <div className="space-y-8">
                <div className="bg-white rounded-xl shadow-sm p-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-3">📊 Esempio concreto</h3>
                    <p className="text-gray-600">
                        Un fondo con TER del 2% potrebbe retrocedere l&apos;1% alla banca come rebate.
                        Su un investimento di €100.000, significa €1.000/anno che vanno alla banca, non a te.
                    </p>
                </div>

                <div className="bg-white rounded-xl shadow-sm p-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-3">🔍 Come proteggersi</h3>
                    <ul className="list-disc list-inside text-gray-600 space-y-2">
                        <li>Chiedi sempre la trasparenza sui costi totali</li>
                        <li>Confronta con ETF equivalenti a basso costo</li>
                        <li>Usa strumenti indipendenti come iMieiRendimenti.it</li>
                        <li>Valuta consulenti indipendenti (fee-only)</li>
                    </ul>
                </div>

                <div className="bg-white rounded-xl shadow-sm p-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-3">⚖️ Aspetti legali</h3>
                    <p className="text-gray-600">
                        La normativa MiFID II obbliga le banche a dichiarare i rebates, ma spesso queste informazioni
                        sono nascoste in documenti complessi. Il nostro servizio li estrae automaticamente dai tuoi estratti conto.
                    </p>
                </div>
            </div>
        </div>
    )
}
