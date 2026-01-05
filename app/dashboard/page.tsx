'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'

interface Analysis {
  id: string
  document_id: string
  bank_name: string
  account_type: string
  period_start: string
  period_end: string
  portfolio_value: number
  year?: number
  quarter?: string
  dossierNumber?: string
  benchmark_comparison: string
  forensic_summary?: {
    performance_pct?: string
  }
}

type BankGroup = {
  bankName: string;
  dossier?: { identifier: string; analyses: Analysis[] };
  liquidity?: { identifier: string; analyses: Analysis[] };
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
    setUploadProgress('Analisi in corso...')

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('userId', user.id)

      const response = await fetch('/api/parse-pdf', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (result.success) {
        setUploadProgress('✓ Documento Analizzato')
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
        }, 4000)
      }
    } catch (error) {
      console.error('Upload error:', error)
      setUploadProgress('Errore di connessione')
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

  // --- Grouping Logic ---
  const normalizeBank = (name: string) => name?.trim() || 'Banca Sconosciuta'

  const bankGroupsMap = analyses.reduce((acc, a) => {
    const bank = normalizeBank(a.bank_name)
    const type = a.account_type === 'LIQUIDITY' ? 'liquidity' : 'dossier'

    if (!acc[bank]) acc[bank] = { bankName: bank }
    if (!acc[bank][type]) {
      acc[bank][type] = { identifier: a.benchmark_comparison || 'N/D', analyses: [] }
    }
    acc[bank][type]!.analyses.push(a)
    if (a.benchmark_comparison && a.benchmark_comparison !== 'N/D') {
      acc[bank][type]!.identifier = a.benchmark_comparison
    }
    return acc
  }, {} as Record<string, BankGroup>)

  const bankGroups = Object.values(bankGroupsMap)

  // Determine global stats for header
  const totalPortfolioValue = analyses.reduce((acc, curr) => {
    // Logic to avoid double counting: take latest value per account
    return acc // Simplified for now
  }, 0)


  // --- Helper for Quarters ---
  const years = [2023, 2024, 2025]
  const quarters = ['1/1 - 31/3', '1/4 - 30/6', '1/7 - 30/9', '1/10 - 31/12']

  const getQuarterDates = (year: number, quarterStr: string) => {
    const [start, end] = quarterStr.split(' - ')
    return { start: `${start}/${year}`, end: `${end}/${year}` }
  }

  // Simple date matcher
  const findAnalysis = (list: Analysis[], year: number, q: string) => {
    return list.find(a => {
      if (!a.period_end) return false
      const date = new Date(a.period_end)
      const y = date.getFullYear()
      if (y !== year) return false
      const m = date.getMonth() + 1 // 1-12
      if (q.includes('31/3') && m <= 3) return true
      if (q.includes('30/6') && m > 3 && m <= 6) return true
      if (q.includes('30/9') && m > 6 && m <= 9) return true
      if (q.includes('31/12') && m > 9) return true
      return false
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
          <p className="text-slate-500 font-medium animate-pulse">Caricamento...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">

      {/* Premium Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Il tuo Caveau Digitale</h1>
              <p className="text-slate-500 mt-2">Gestisci, analizza e monitora tutti i tuoi investimenti bancari in un unico posto sicuro.</p>
            </div>
            <div className="flex gap-4">
              <div
                className="group relative overflow-hidden bg-slate-900 hover:bg-emerald-600 transition-colors text-white px-6 py-3 rounded-full font-bold shadow-lg shadow-slate-900/20 cursor-pointer flex items-center gap-3"
                onClick={() => document.getElementById('file-input')?.click()}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                <span>Carica Nuovo PDF</span>
                {uploading && (
                  <div className="absolute inset-0 bg-emerald-600 flex items-center justify-center">
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  </div>
                )}
              </div>
              <input type="file" id="file-input" hidden accept=".pdf" onChange={handleFileSelect} />
            </div>
          </div>
        </div>
      </header>

      {uploading && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex items-center gap-3 text-emerald-800">
            <svg className="w-5 h-5 animate-spin text-emerald-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            <span className="font-semibold">{uploadProgress}</span>
          </div>
        </div>
      )}

      {!uploading && analyses.length === 0 && (
        <div className="max-w-2xl mx-auto mt-12 px-4">
          <div
            className="border-2 border-dashed border-slate-300 rounded-3xl p-12 text-center hover:border-emerald-500 hover:bg-emerald-50/50 transition-all cursor-pointer group"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => document.getElementById('file-input')?.click()}
          >
            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:bg-emerald-100 transition-colors">
              <svg className="w-10 h-10 text-slate-400 group-hover:text-emerald-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">Trascina qui il tuo primo estratto conto</h3>
            <p className="text-slate-500 mb-6">Supportiamo solo PDF originali bancari.<br />Li trovi nel tuo home banking sotto &quot;Estratti Conto&quot;.</p>
            <button className="bg-white border border-slate-200 text-slate-700 font-bold py-2 px-6 rounded-full hover:bg-slate-50 transition-colors shadow-sm">
              Seleziona File dal PC
            </button>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 space-y-12">
        {bankGroups.map((group, idx) => {
          const hasDossier = !!group.dossier;
          const hasLiquidity = !!group.liquidity;

          return (
            <div key={idx} className="space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-200">
                <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 shadow-sm flex items-center justify-center font-bold text-slate-700 text-lg">
                  {group.bankName.charAt(0)}
                </div>
                <h2 className="text-2xl font-bold text-slate-900">{group.bankName}</h2>
                {hasDossier && !hasLiquidity && (
                  <span className="ml-auto bg-amber-50 text-amber-700 border border-amber-100 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2">
                    ⚠️ Manca Conto Liquidità
                  </span>
                )}
                {hasLiquidity && !hasDossier && (
                  <span className="ml-auto bg-amber-50 text-amber-700 border border-amber-100 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2">
                    ⚠️ Manca Dossier Titoli
                  </span>
                )}
              </div>

              <div className="space-y-8">
                {/* --- DOSSIER SECTION --- */}
                {hasDossier ? (
                  <div className="bg-white rounded-2xl shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-slate-100 overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50/[0.3]">
                      <div>
                        <div className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">Investimenti</div>
                        <h3 className="text-lg font-bold text-slate-900">Dossier Titoli</h3>
                        <p className="text-sm text-slate-500 font-mono mt-1">{group.dossier?.identifier}</p>
                      </div>
                      <Link href={`/analisi/${group.dossier?.analyses[0]?.id}`} className="text-xs font-bold text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-1">
                        ANALISI RECENTE <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                      </Link>
                    </div>
                    <div className="p-6 overflow-x-auto custom-scrollbar">
                      <div className="flex gap-8 min-w-full pb-4">
                        {years.map(year => (
                          <div key={year} className="flex-none">
                            <div className="text-sm font-bold text-slate-400 mb-4 sticky left-0">{year}</div>
                            <div className="flex gap-3">
                              {quarters.map((q, i) => {
                                const file = findAnalysis(group.dossier!.analyses, year, q);
                                const isPresent = !!file;
                                const dates = getQuarterDates(year, q)
                                return (
                                  <div
                                    key={i}
                                    onClick={() => isPresent && router.push(`/analisi/${file.id}`)}
                                    className={`
                                                                    relative p-4 rounded-xl border flex flex-col items-center justify-between gap-3 transition-all cursor-pointer w-32 h-40 group
                                                                    ${isPresent
                                        ? 'bg-emerald-50 border-emerald-100 hover:shadow-lg hover:-translate-y-1'
                                        : 'bg-slate-50 border-slate-100 hover:bg-slate-100 opacity-60 hover:opacity-100 border-dashed'}
                                                                `}
                                  >
                                    <div className="text-[10px] uppercase font-bold text-slate-400 text-center leading-tight">
                                      {dates.start}
                                      <br />↓<br />
                                      {dates.end}
                                    </div>

                                    {isPresent ? (
                                      <>
                                        <div className="text-center">
                                          <div className="text-[10px] text-slate-500 font-medium">Rendimento</div>
                                          <div className="text-sm font-bold text-emerald-700">
                                            {file.forensic_summary?.performance_pct || 'N/D'}
                                          </div>
                                        </div>
                                        <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center text-white text-xs shadow-md">✓</div>
                                      </>
                                    ) : (
                                      <>
                                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Assente</div>
                                        <button className="w-full py-1 text-[10px] bg-white border border-slate-200 rounded-full font-bold text-slate-600 group-hover:bg-emerald-600 group-hover:text-white group-hover:border-emerald-600 transition-colors">
                                          CARICA +
                                        </button>
                                      </>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  // Empty State for Dossier
                  <div
                    className="border-2 border-dashed border-slate-200 rounded-2xl p-8 flex flex-col items-center justify-center text-center hover:bg-slate-50 transition-colors cursor-pointer opacity-70 hover:opacity-100 h-40"
                    onClick={() => document.getElementById('file-input')?.click()}
                  >
                    <div className="flex items-center gap-3 text-slate-400">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                      <h3 className="font-bold text-slate-900">Carica Dossier Titoli</h3>
                    </div>
                  </div>
                )}

                {/* --- LIQUIDITY SECTION --- */}
                {hasLiquidity ? (
                  <div className="bg-white rounded-2xl shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-slate-100 overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50/[0.3]">
                      <div>
                        <div className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">Liquidità</div>
                        <h3 className="text-lg font-bold text-slate-900">Conto Corrente</h3>
                        <p className="text-sm text-slate-500 font-mono mt-1">{group.liquidity?.identifier}</p>
                      </div>
                      <Link href={`/analisi/${group.liquidity?.analyses[0]?.id}`} className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1">
                        VEDI SALDO <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                      </Link>
                    </div>
                    <div className="p-6 overflow-x-auto custom-scrollbar">
                      <div className="flex gap-8 min-w-full pb-4">
                        {years.map(year => (
                          <div key={year} className="flex-none">
                            <div className="text-sm font-bold text-slate-400 mb-4 sticky left-0">{year}</div>
                            <div className="flex gap-3">
                              {quarters.map((q, i) => {
                                const file = findAnalysis(group.liquidity!.analyses, year, q);
                                const isPresent = !!file;
                                const dates = getQuarterDates(year, q)
                                return (
                                  <div
                                    key={i}
                                    onClick={() => isPresent && router.push(`/analisi/${file.id}`)}
                                    className={`
                                                                    relative p-4 rounded-xl border flex flex-col items-center justify-between gap-3 transition-all cursor-pointer w-32 h-40 group
                                                                    ${isPresent
                                        ? 'bg-blue-50 border-blue-100 hover:shadow-lg hover:-translate-y-1'
                                        : 'bg-slate-50 border-slate-100 hover:bg-slate-100 opacity-60 hover:opacity-100 border-dashed'}
                                                                `}
                                  >
                                    <div className="text-[10px] uppercase font-bold text-slate-400 text-center leading-tight">
                                      {dates.start}
                                      <br />↓<br />
                                      {dates.end}
                                    </div>

                                    {isPresent ? (
                                      <>
                                        <div className="text-center">
                                          <div className="text-[10px] text-slate-500 font-medium">Saldo Medio</div>
                                          <div className="text-sm font-bold text-blue-700">
                                            €{file.portfolio_value && file.portfolio_value < 10000
                                              ? (file.portfolio_value / 1000).toFixed(1) + 'k'
                                              : (file.portfolio_value / 1000).toFixed(0) + 'k'}
                                          </div>
                                        </div>
                                        <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs shadow-md">✓</div>
                                      </>
                                    ) : (
                                      <>
                                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Assente</div>
                                        <button className="w-full py-1 text-[10px] bg-white border border-slate-200 rounded-full font-bold text-slate-600 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 transition-colors">
                                          CARICA +
                                        </button>
                                      </>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  // Empty State for Liquidity
                  <div
                    className="border-2 border-dashed border-slate-200 rounded-2xl p-8 flex flex-col items-center justify-center text-center hover:bg-slate-50 transition-colors cursor-pointer opacity-70 hover:opacity-100 h-40"
                    onClick={() => document.getElementById('file-input')?.click()}
                  >
                    <div className="flex items-center gap-3 text-slate-400">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                      <h3 className="font-bold text-slate-900">Carica Conto Liquidità</h3>
                    </div>
                  </div>
                )}

              </div>
            </div>
          )
        })}
      </main>
    </div>
  )
}
