import Link from 'next/link'

export default function Footer() {
    return (
        <footer className="bg-gray-900 text-white py-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
                    {/* Brand */}
                    <div>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
                                <span className="text-white font-bold text-lg">📊</span>
                            </div>
                            <span className="font-extrabold text-xl">iMieiRendimenti.it</span>
                        </div>
                        <p className="text-gray-400 text-sm leading-relaxed">
                            Analisi indipendente dei tuoi investimenti.<br />
                            Trasparenza. Chiarezza. Controllo.
                        </p>
                    </div>

                    {/* Info */}
                    <div>
                        <h4 className="font-bold text-sm uppercase tracking-wider mb-4">Informazioni</h4>
                        <ul className="space-y-2">
                            <li><Link href="/come-funziona" className="text-gray-400 hover:text-emerald-400 text-sm transition-colors">Come Funziona</Link></li>
                            <li><Link href="/rendimenti" className="text-gray-400 hover:text-emerald-400 text-sm transition-colors">Rendimenti di Mercato</Link></li>
                            <li><Link href="/reati" className="text-gray-400 hover:text-emerald-400 text-sm transition-colors">Attenzione ai Reati</Link></li>
                        </ul>
                    </div>

                    {/* Legal */}
                    <div>
                        <h4 className="font-bold text-sm uppercase tracking-wider mb-4">Legale</h4>
                        <ul className="space-y-2">
                            <li><Link href="/privacy" className="text-gray-400 hover:text-emerald-400 text-sm transition-colors">Privacy Policy</Link></li>
                            <li><Link href="/terms" className="text-gray-400 hover:text-emerald-400 text-sm transition-colors">Termini e Condizioni</Link></li>
                            <li><Link href="/cookies" className="text-gray-400 hover:text-emerald-400 text-sm transition-colors">Cookie Policy</Link></li>
                        </ul>
                    </div>

                    {/* Contact */}
                    <div>
                        <h4 className="font-bold text-sm uppercase tracking-wider mb-4">Contatti</h4>
                        <ul className="space-y-2 text-gray-400 text-sm">
                            <li>📧 info@imieirendimenti.it</li>
                            <li>📞 +39 02 1234 5678</li>
                        </ul>
                    </div>
                </div>

                {/* Copyright */}
                <div className="border-t border-gray-800 pt-8 text-center">
                    <p className="text-gray-500 text-sm">© 2026 iMieiRendimenti.it - Tutti i diritti riservati</p>
                </div>
            </div>
        </footer>
    )
}
