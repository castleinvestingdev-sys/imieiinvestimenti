'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

export default function Header() {
    const pathname = usePathname()
    const [user, setUser] = useState<User | null>(null)
    const [menuOpen, setMenuOpen] = useState(false)
    const supabase = createClient()

    useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => {
            setUser(user)
        })

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null)
        })

        return () => subscription.unsubscribe()
    }, [supabase.auth])

    const handleLogout = async () => {
        await supabase.auth.signOut()
        window.location.href = '/'
    }

    return (
        <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <nav className="flex items-center justify-between h-16">
                    {/* Logo */}
                    <Link href="/" className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
                            <span className="text-white font-bold">📊</span>
                        </div>
                        <span className="font-extrabold text-xl text-gray-900 hidden sm:block">
                            iMieiRendimenti
                        </span>
                    </Link>

                    {/* Desktop Nav */}
                    <div className="hidden md:flex items-center gap-6">
                        <Link
                            href="/come-funziona"
                            className={`text-sm font-semibold ${pathname === '/come-funziona' ? 'text-emerald-600' : 'text-gray-600 hover:text-gray-900'}`}
                        >
                            COME FUNZIONA
                        </Link>
                        <Link
                            href="/rendimenti"
                            className={`text-sm font-semibold ${pathname === '/rendimenti' ? 'text-emerald-600' : 'text-gray-600 hover:text-gray-900'}`}
                        >
                            RENDIMENTI
                        </Link>
                        <Link
                            href="/reati"
                            className={`text-sm font-semibold ${pathname === '/reati' ? 'text-emerald-600' : 'text-gray-600 hover:text-gray-900'}`}
                        >
                            ATTENZIONE AI REBATES
                        </Link>
                    </div>

                    {/* CTA / Auth */}
                    <div className="flex items-center gap-3">
                        {user ? (
                            <>
                                <Link
                                    href="/dashboard"
                                    className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-full text-sm font-bold transition-colors"
                                >
                                    DASHBOARD
                                </Link>
                                <button
                                    onClick={handleLogout}
                                    className="text-sm font-semibold text-gray-600 hover:text-gray-900"
                                >
                                    Esci
                                </button>
                            </>
                        ) : (
                            <>
                                <Link
                                    href="/dashboard"
                                    className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-full text-sm font-bold transition-colors"
                                >
                                    PROVALO ORA
                                </Link>
                                <Link
                                    href="/login"
                                    className="text-sm font-semibold text-gray-600 hover:text-gray-900"
                                >
                                    ACCEDI
                                </Link>
                            </>
                        )}

                        {/* Mobile menu button */}
                        <button
                            onClick={() => setMenuOpen(!menuOpen)}
                            className="md:hidden p-2"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                {menuOpen ? (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                ) : (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                )}
                            </svg>
                        </button>
                    </div>
                </nav>

                {/* Mobile menu */}
                {menuOpen && (
                    <div className="md:hidden py-4 border-t border-gray-100">
                        <Link href="/come-funziona" className="block py-2 text-gray-600 hover:text-gray-900">Come Funziona</Link>
                        <Link href="/rendimenti" className="block py-2 text-gray-600 hover:text-gray-900">Rendimenti</Link>
                        <Link href="/reati" className="block py-2 text-gray-600 hover:text-gray-900">Attenzione ai Rebates</Link>
                    </div>
                )}
            </div>
        </header>
    )
}
