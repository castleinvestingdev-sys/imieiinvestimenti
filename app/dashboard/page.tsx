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

      {/* Premium Header with GREEN HERO DROPZONE */}
      <div className="bg-white border-b border-slate-200 pb-12 pt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Il tuo Caveau Digitale</h1>
            <p className="text-slate-500 mt-2 text-lg">Carica gli Estratti Conto PDF (Dossier e Liquidità) per aggiornare la tua situazione.</p>
          </div>

          {/* HERO DROPZONE - RESTORED GREEN DASHED STYLE */}
          <div
            className="max-w-4xl mx-auto relative group cursor-pointer"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => document.getElementById('file-input')?.click()}
          >
            <div className={`
                      h-40 rounded-[3rem] border-2 border-dashed transition-all duration-300 flex items-center justify-center gap-8 shadow-sm group-hover:shadow-md group-hover:-translate-y-1
                      ${uploading ? 'bg-amber-50 border-amber-400' : 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-400 hover:border-emerald-500 hover:bg-emerald-100/50'}
                  `}>
              {uploading ? (
                <div className="flex items-center gap-4 text-amber-700">
                  <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  <span className="text-xl font-bold">{uploadProgress}</span>
                </div>
              ) : (
                <>
                  <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-200 group-hover:scale-110 transition-transform">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  </div>
                  <div className="text-left">
                    <div className="text-2xl font-black text-emerald-800 tracking-tight">DRAG & DROP</div>
                    <div className="text-emerald-600 font-medium">oppure <span className="underline decoration-2 underline-offset-2">Carica da PC</span></div>
                  </div>
                </>
              )}
            </div>
            <input type="file" id="file-input" hidden accept=".pdf" onChange={handleFileSelect} />
          </div>
        </div>
      </div>

      {/* Error Message */}
      {!uploading && uploadProgress.includes('Errore') && (
        <div className="max-w-xl mx-auto mt-6 text-center bg-red-50 text-red-600 px-4 py-2 rounded-lg border border-red-100 text-sm font-bold">
          {uploadProgress}
        </div>
      )}

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 mt-12 space-y-16">
        {bankGroups.map((group, idx) => {
          const hasDossier = !!group.dossier;
          const hasLiquidity = !!group.liquidity;

          return (
            <div key={idx} className="space-y-4">
              {/* Bank Header */}
              <div className="flex items-center gap-4 pl-2">
                <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center font-bold text-slate-700 text-xl">
                  {group.bankName.charAt(0)}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">{group.bankName}</h2>
                  <div className="flex gap-2 mt-1">
                    {!hasDossier && <span className="text-[10px] bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded uppercase">Manca Dossier</span>}
                    {!hasLiquidity && <span className="text-[10px] bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded uppercase">Manca C/C</span>}
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                {/* --- DOSSIER SECTION --- */}
                {hasDossier ? (
                  <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                      <div className="flex items-center gap-3">
                        <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider">INVESTIMENTI</span>
                        <span className="text-slate-400 font-bold text-sm">|</span>
                        <h3 className="text-lg font-bold text-slate-700">Dossier Titoli <span className="text-slate-400 font-mono ml-2 font-normal">{group.dossier?.identifier}</span></h3>
                      </div>
                      <Link href={`/analisi/${group.dossier?.analyses[0]?.id}`} className="group flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-emerald-600 bg-white border border-slate-200 hover:border-emerald-200 px-4 py-2 rounded-full transition-all">
                        Vedi Ultima Analisi <svg className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                      </Link>
                    </div>
                    <div className="p-8 overflow-x-auto custom-scrollbar">
                      <div className="flex gap-12 min-w-full pb-2">
                        {years.map(year => (
                          <div key={year} className="flex-none">
                            <div className="text-lg font-bold text-slate-300 mb-4">{year}</div>
                            <div className="flex gap-4">
                              {quarters.map((q, i) => {
                                const file = findAnalysis(group.dossier!.analyses, year, q);
                                const isPresent = !!file;
                                const dates = getQuarterDates(year, q)
                                return (
                                  <div
                                    key={i}
                                    onClick={() => isPresent && router.push(`/analisi/${file.id}`)}
                                    className={`
                                                                    relative w-36 h-48 rounded-2xl border-2 flex flex-col items-center justify-between p-4 transition-all duration-200 cursor-pointer group
                                                                    ${isPresent
                                        ? 'bg-white border-emerald-100 shadow-[0_4px_20px_rgba(16,185,129,0.08)] hover:border-emerald-300 hover:shadow-[0_8px_30px_rgba(16,185,129,0.12)] hover:-translate-y-1'
                                        : 'bg-slate-50 border-slate-100 border-dashed hover:border-slate-300 hover:bg-slate-100'}
                                                                `}
                                  >
                                    <div className="text-center w-full">
                                      <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${isPresent ? 'text-emerald-600' : 'text-slate-400'}`}>
                                        {q.split(' - ')[1].split('/')[1] === '3' ? 'Q1' : q.split(' - ')[1].split('/')[1] === '6' ? 'Q2' : q.split(' - ')[1].split('/')[1] === '9' ? 'Q3' : 'Q4'}
                                      </div>
                                      <div className="text-[10px] text-slate-400 font-medium leading-tight">
                                        {dates.start} — {dates.end}
                                      </div>
                                    </div>

                                    {isPresent ? (
                                      <>
                                        <div className="text-center w-full">
                                          <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">Rendimento</div>
                                          <div className="text-xl font-black text-slate-800 tracking-tight">
                                            {(() => {
                                              const val = file.forensic_summary?.performance_pct;
                                              if (val === undefined || val === null) return 'N/D';
                                              const num = Number(val);
                                              return isNaN(num) ? 'N/D' : (num > 0 ? '+' : '') + num.toFixed(2) + '%';
                                            })()}
                                          </div>
                                        </div>
                                        <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white text-sm shadow-md shadow-emerald-200">
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                        </div>
                                      </>
                                    ) : (
                                      <div className="w-full">
                                        <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center text-slate-400 mx-auto mb-3 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                        </div>
                                        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider text-center group-hover:text-emerald-600">Carica PDF</div>
                                      </div>
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
                  <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 p-8 flex flex-col items-center justify-center gap-4 hover:border-emerald-300 hover:bg-emerald-50/10 transition-colors cursor-pointer" onClick={() => document.getElementById('file-input')?.click()}>
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-slate-900">Manca Dossier Titoli {group.bankName}</div>
                      <div className="text-sm text-slate-500">Caricalo ora per completare l&apos;analisi</div>
                    </div>
                  </div>
                )}

                {/* --- LIQUIDITY SECTION --- */}
                {hasLiquidity ? (
                  <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                      <div className="flex items-center gap-3">
                        <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider">LIQUIDITÀ</span>
                        <span className="text-slate-400 font-bold text-sm">|</span>
                        <h3 className="text-lg font-bold text-slate-700">Conto Corrente <span className="text-slate-400 font-mono ml-2 font-normal">{group.liquidity?.identifier}</span></h3>
                      </div>
                      <Link href={`/analisi/${group.liquidity?.analyses[0]?.id}`} className="group flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-blue-600 bg-white border border-slate-200 hover:border-blue-200 px-4 py-2 rounded-full transition-all">
                        Vedi Saldicontro <svg className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                      </Link>
                    </div>
                    <div className="p-8 overflow-x-auto custom-scrollbar">
                      <div className="flex gap-12 min-w-full pb-2">
                        {years.map(year => (
                          <div key={year} className="flex-none">
                            <div className="text-lg font-bold text-slate-300 mb-4">{year}</div>
                            <div className="flex gap-4">
                              {quarters.map((q, i) => {
                                const file = findAnalysis(group.liquidity!.analyses, year, q);
                                const isPresent = !!file;
                                const dates = getQuarterDates(year, q)
                                return (
                                  <div
                                    key={i}
                                    onClick={() => isPresent && router.push(`/analisi/${file.id}`)}
                                    className={`
                                                                    relative w-36 h-48 rounded-2xl border-2 flex flex-col items-center justify-between p-4 transition-all duration-200 cursor-pointer group
                                                                    ${isPresent
                                        ? 'bg-white border-blue-100 shadow-[0_4px_20px_rgba(59,130,246,0.08)] hover:border-blue-300 hover:shadow-[0_8px_30px_rgba(59,130,246,0.12)] hover:-translate-y-1'
                                        : 'bg-slate-50 border-slate-100 border-dashed hover:border-slate-300 hover:bg-slate-100'}
                                                                `}
                                  >
                                    <div className="text-center w-full">
                                      <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${isPresent ? 'text-blue-600' : 'text-slate-400'}`}>
                                        {q.split(' - ')[1].split('/')[1] === '3' ? 'Q1' : q.split(' - ')[1].split('/')[1] === '6' ? 'Q2' : q.split(' - ')[1].split('/')[1] === '9' ? 'Q3' : 'Q4'}
                                      </div>
                                      <div className="text-[10px] text-slate-400 font-medium leading-tight">
                                        {dates.start} — {dates.end}
                                      </div>
                                    </div>

                                    {isPresent ? (
                                      <>
                                        <div className="text-center w-full">
                                          <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">Saldo Medio</div>
                                          <div className="text-xl font-black text-slate-800 tracking-tight">
                                            €{file.portfolio_value && file.portfolio_value < 10000
                                              ? (file.portfolio_value / 1000).toFixed(1) + 'k'
                                              : (file.portfolio_value / 1000).toFixed(0) + 'k'}
                                          </div>
                                        </div>
                                        <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm shadow-md shadow-blue-200">
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                        </div>
                                      </>
                                    ) : (
                                      <div className="w-full">
                                        <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center text-slate-400 mx-auto mb-3 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                        </div>
                                        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider text-center group-hover:text-blue-600">Carica PDF</div>
                                      </div>
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
                  <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 p-8 flex flex-col items-center justify-center gap-4 hover:border-blue-300 hover:bg-blue-50/10 transition-colors cursor-pointer" onClick={() => document.getElementById('file-input')?.click()}>
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-slate-900">Manca Conto Liquidità {group.bankName}</div>
                      <div className="text-sm text-slate-500">I conti correnti sono essenziali per l&apos;analisi dei costi</div>
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
