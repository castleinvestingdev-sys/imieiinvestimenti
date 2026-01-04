import Link from 'next/link'

export default function HomePage() {
  return (
    <>
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-gray-50 to-gray-100 py-20 lg:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-gray-900 mb-6 tracking-tight">
            Scopri la verità sui tuoi
            <span className="text-emerald-500"> investimenti</span>
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-10">
            Carica i tuoi estratti conto bancari e scopri quanto stai davvero pagando
            in commissioni nascoste. Analisi gratuita e indipendente.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/dashboard"
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-8 py-4 rounded-full text-lg font-bold transition-all shadow-lg shadow-emerald-500/30 hover:shadow-xl hover:scale-105"
            >
              INIZIA L'ANALISI GRATUITA
            </Link>
            <Link
              href="/come-funziona"
              className="bg-white hover:bg-gray-50 text-gray-900 px-8 py-4 rounded-full text-lg font-bold transition-all border-2 border-gray-200"
            >
              Come Funziona
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-extrabold text-center text-gray-900 mb-16">
            Perché iMieiRendimenti?
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="text-center p-8 rounded-2xl bg-gray-50 hover:bg-emerald-50 transition-colors">
              <div className="text-5xl mb-4">🔍</div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Trasparenza Totale</h3>
              <p className="text-gray-600">
                Scopri tutte le commissioni nascoste che la tua banca non ti dice.
                Spread, TER, costi di gestione.
              </p>
            </div>
            {/* Feature 2 */}
            <div className="text-center p-8 rounded-2xl bg-gray-50 hover:bg-emerald-50 transition-colors">
              <div className="text-5xl mb-4">📊</div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Confronto Benchmark</h3>
              <p className="text-gray-600">
                Compara i tuoi rendimenti con il mercato. Scopri se avresti guadagnato
                di più con un semplice ETF.
              </p>
            </div>
            {/* Feature 3 */}
            <div className="text-center p-8 rounded-2xl bg-gray-50 hover:bg-emerald-50 transition-colors">
              <div className="text-5xl mb-4">🛡️</div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">100% Indipendente</h3>
              <p className="text-gray-600">
                Non vendiamo prodotti finanziari. Il nostro unico interesse è
                mostrarti la verità sui tuoi investimenti.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-4xl font-extrabold text-emerald-400 mb-2">€2.5M+</div>
              <div className="text-gray-400">Costi Nascosti Scoperti</div>
            </div>
            <div>
              <div className="text-4xl font-extrabold text-emerald-400 mb-2">15.000+</div>
              <div className="text-gray-400">Documenti Analizzati</div>
            </div>
            <div>
              <div className="text-4xl font-extrabold text-emerald-400 mb-2">8.500+</div>
              <div className="text-gray-400">Utenti Attivi</div>
            </div>
            <div>
              <div className="text-4xl font-extrabold text-emerald-400 mb-2">4.9/5</div>
              <div className="text-gray-400">Valutazione Media</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-emerald-500">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-6">
            Pronto a scoprire la verità?
          </h2>
          <p className="text-xl text-emerald-100 mb-8">
            Carica il tuo primo documento e inizia l'analisi in meno di 2 minuti.
          </p>
          <Link
            href="/dashboard"
            className="inline-block bg-white hover:bg-gray-100 text-emerald-600 px-10 py-4 rounded-full text-lg font-bold transition-all shadow-lg hover:shadow-xl hover:scale-105"
          >
            INIZIA ORA — È GRATIS
          </Link>
        </div>
      </section>
    </>
  )
}
