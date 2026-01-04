import Link from 'next/link'

export default function ComeFunzionaPage() {
    return (
        <div className="max-w-4xl mx-auto px-4 py-16">
            <h1 className="text-4xl font-extrabold text-gray-900 text-center mb-12">Come Funziona</h1>

            <div className="space-y-12">
                {/* Step 1 */}
                <div className="flex gap-8 items-start">
                    <div className="flex-shrink-0 w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center text-2xl font-bold text-white">1</div>
                    <div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Carica i tuoi PDF</h3>
                        <p className="text-gray-600">
                            Scarica i PDF &quot;Dossier Titoli&quot; e &quot;Estratto Conto&quot; dalla tua banca online e caricali sulla nostra piattaforma in pochi click.
                        </p>
                    </div>
                </div>

                {/* Step 2 */}
                <div className="flex gap-8 items-start">
                    <div className="flex-shrink-0 w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center text-2xl font-bold text-white">2</div>
                    <div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Analisi AI</h3>
                        <p className="text-gray-600">
                            Il nostro algoritmo di intelligenza artificiale analizza ogni documento, estraendo automaticamente commissioni, costi nascosti e rendimenti reali.
                        </p>
                    </div>
                </div>

                {/* Step 3 */}
                <div className="flex gap-8 items-start">
                    <div className="flex-shrink-0 w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center text-2xl font-bold text-white">3</div>
                    <div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Report Dettagliato</h3>
                        <p className="text-gray-600">
                            Ricevi un report completo che confronta i tuoi investimenti con i benchmark di mercato, evidenziando opportunità e inefficienze.
                        </p>
                    </div>
                </div>
            </div>

            <div className="text-center mt-16">
                <Link
                    href="/dashboard"
                    className="inline-block bg-emerald-500 hover:bg-emerald-600 text-white px-8 py-4 rounded-full font-bold text-lg transition-colors"
                >
                    INIZIA ORA — È GRATIS
                </Link>
            </div>
        </div>
    )
}
