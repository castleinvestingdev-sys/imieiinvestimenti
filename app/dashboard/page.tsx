'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'

interface Analysis {
    id: string
    bank_name: string
    account_type: string
    period_start: string
    period_end: string
    portfolio_value: number
    created_at: string
    benchmark_comparison: string
}

export default function DashboardPage() {
    const [user, setUser] = useState<User | null>(null)
    const [analyses, setAnalyses] = useState<Analysis[]>([])
    const [loading, setLoading] = useState(true)
    const [uploading, setUploading] = useState(false)
    const [uploadProgress, setUploadProgress] = useState('')
    const router = useRouter()
    const supabase = createClient()

    const fetchAnalyses = useCallback(async (userId: string) => {
        const { data, error } = await supabase
            .from('analyses')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })

        if (error) {
            console.error('Error fetching analyses:', error)
            return
        }

        setAnalyses(data || [])
    }, [supabase])

    useEffect(() => {
        const checkAuth = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                router.push('/login')
                return
            }
            setUser(user)
            await fetchAnalyses(user.id)
            setLoading(false)
        }
        checkAuth()
    }, [supabase.auth, router, fetchAnalyses])

    const handleFileUpload = async (file: File) => {
        if (!user || file.type !== 'application/pdf') {
            alert('Per favore carica un file PDF')
            return
        }

        setUploading(true)
        setUploadProgress('Estrazione testo...')

        try {
            // Send to our secure API route
            const formData = new FormData()
            formData.append('file', file)
            formData.append('userId', user.id)

            const response = await fetch('/api/parse-pdf', {
                method: 'POST',
                body: formData,
            })

            const result = await response.json()

            if (result.success) {
                setUploadProgress('✓ Elaborato con successo!')
                await fetchAnalyses(user.id)
                setTimeout(() => {
                    setUploading(false)
                    setUploadProgress('')
                }, 1500)
            } else {
                setUploadProgress(`Errore: ${result.error}`)
                setTimeout(() => {
                    setUploading(false)
                    setUploadProgress('')
                }, 3000)
            }
        } catch (error) {
            console.error('Upload error:', error)
            setUploadProgress('Errore durante il caricamento')
            setTimeout(() => {
                setUploading(false)
                setUploadProgress('')
            }, 3000)
        }
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        const files = e.dataTransfer.files
        if (files.length > 0) {
            handleFileUpload(files[0])
        }
    }

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (files && files.length > 0) {
            handleFileUpload(files[0])
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-gray-200 border-t-emerald-500 rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600">Caricamento dashboard...</p>
                </div>
            </div>
        )
    }

    // Group analyses by account
    const grouped = analyses.reduce((acc, a) => {
        const type = a.account_type || 'DOSSIER'
        if (!acc[type]) acc[type] = []
        acc[type].push(a)
        return acc
    }, {} as Record<string, Analysis[]>)

    const totalConti = Object.keys(grouped).length
    const totalEstratti = analyses.length

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
            {/* Upload Section */}
            <section className="bg-white border-b border-gray-100 py-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <h1 className="text-3xl font-extrabold text-gray-900 mb-2">
                        Carica i PDF &quot;Estratto Conto&quot;
                    </h1>
                    <p className="text-gray-600 mb-6">
                        Dossier Titoli e Conto Corrente — li trovi nella sezione documenti del tuo homebanking.
                    </p>

                    {/* Drop Zone */}
                    <div
                        onDrop={handleDrop}
                        onDragOver={(e) => e.preventDefault()}
                        className="border-3 border-dashed border-emerald-400 rounded-full py-8 px-12 flex items-center justify-center gap-8 bg-gradient-to-r from-white to-gray-50 hover:from-emerald-50 hover:to-white transition-all cursor-pointer"
                        onClick={() => document.getElementById('file-input')?.click()}
                    >
                        <div className="w-14 h-14 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/30">
                            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V6M5 12l7-7 7 7" />
                            </svg>
                        </div>
                        <span className="font-black text-xl text-gray-800">DRAG & DROP</span>
                        <span className="text-gray-400">oppure</span>
                        <button className="bg-gray-700 hover:bg-gray-800 text-white px-6 py-3 rounded-full font-bold text-sm transition-colors">
                            Carica da PC
                        </button>
                        <input
                            id="file-input"
                            type="file"
                            accept=".pdf"
                            onChange={handleFileSelect}
                            className="hidden"
                        />
                    </div>

                    {uploading && (
                        <div className="mt-4 flex items-center gap-2 text-emerald-600 font-semibold">
                            <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse"></div>
                            {uploadProgress}
                        </div>
                    )}
                </div>
            </section>

            {/* Timeline Section */}
            <section className="py-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <h2 className="text-2xl font-extrabold text-gray-900 mb-8 flex items-center gap-3">
                        I tuoi Conti
                        <span className="bg-emerald-500 text-white px-3 py-1 rounded-full text-sm font-bold">{totalConti}</span>
                        e Estratti Conto
                        <span className="bg-emerald-500 text-white px-3 py-1 rounded-full text-sm font-bold">{totalEstratti}</span>
                    </h2>

                    {totalConti === 0 ? (
                        <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
                            <div className="text-6xl mb-4">📊</div>
                            <h3 className="text-xl font-bold text-gray-900 mb-2">Nessun estratto conto caricato</h3>
                            <p className="text-gray-600">Carica il tuo primo PDF per iniziare l&apos;analisi forense</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {Object.entries(grouped).map(([type, items]) => (
                                <div key={type} className="bg-white rounded-2xl shadow-lg p-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <span className="inline-block bg-gray-800 text-white px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-2">
                                                {type === 'DOSSIER' ? 'TITOLI' : 'LIQUIDITÀ'}
                                            </span>
                                            <div className="text-sm text-gray-600">
                                                <strong>Banca:</strong> {items[0]?.bank_name || 'N/D'}
                                            </div>
                                        </div>
                                        <Link
                                            href={`/analisi/${items[0]?.id}`}
                                            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-5 py-2 rounded-full font-bold text-sm flex items-center gap-2 transition-colors"
                                        >
                                            VEDI ANALISI COMPLETA
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </Link>
                                    </div>

                                    {/* Documents list */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        {items.map((analysis) => (
                                            <Link
                                                key={analysis.id}
                                                href={`/analisi/${analysis.id}`}
                                                className="p-4 bg-emerald-50 border-2 border-emerald-200 rounded-xl hover:border-emerald-400 transition-colors group"
                                            >
                                                <div className="text-sm font-semibold text-gray-700 mb-1">
                                                    {analysis.period_end ? new Date(analysis.period_end).toLocaleDateString('it-IT') : 'N/D'}
                                                </div>
                                                <div className="text-lg font-bold text-emerald-600">
                                                    €{(analysis.portfolio_value || 0).toLocaleString('it-IT')}
                                                </div>
                                                <div className="absolute bottom-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    ✓
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </section>
        </div>
    )
}
