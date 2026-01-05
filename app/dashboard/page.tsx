'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import styles from './Dashboard.module.css'

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
  const [trashedAnalyses, setTrashedAnalyses] = useState<Analysis[]>([])
  const [showTrash, setShowTrash] = useState(false)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const router = useRouter()
  const supabase = createClient()
  const scrollRef = useRef<HTMLDivElement>(null)

  const fetchAnalyses = useCallback(async (userId: string) => {
    // Fetch active analyses
    const { data, error } = await supabase
      .from('analyses')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching analyses:', error)
      return
    }
    setAnalyses(data || [])

    // Fetch trashed analyses
    const { data: trashedData } = await supabase
      .from('analyses')
      .select('*')
      .eq('user_id', userId)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })

    setTrashedAnalyses(trashedData || [])
  }, [supabase])

  const handleDelete = async (analysisId: string) => {
    if (!user) return
    const confirmed = window.confirm('Vuoi spostare questo documento nel cestino?')
    if (!confirmed) return

    const { error } = await supabase
      .from('analyses')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', analysisId)

    if (error) {
      console.error('Error deleting:', error)
      alert('Errore durante l\'eliminazione')
      return
    }

    await fetchAnalyses(user.id)
  }

  const handleRestore = async (analysisId: string) => {
    if (!user) return

    const { error } = await supabase
      .from('analyses')
      .update({ deleted_at: null })
      .eq('id', analysisId)

    if (error) {
      console.error('Error restoring:', error)
      alert('Errore durante il ripristino')
      return
    }

    await fetchAnalyses(user.id)
  }

  const handlePermanentDelete = async (analysisId: string) => {
    if (!user) return
    const confirmed = window.confirm('Vuoi eliminare definitivamente questo documento? Questa azione non può essere annullata.')
    if (!confirmed) return

    const { error } = await supabase
      .from('analyses')
      .delete()
      .eq('id', analysisId)

    if (error) {
      console.error('Error permanent delete:', error)
      alert('Errore durante l\'eliminazione definitiva')
      return
    }

    await fetchAnalyses(user.id)
  }

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

<<<<<<< HEAD
  // --- Grouping Logic ---
=======
  const scrollTimeline = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const { scrollLeft, clientWidth } = scrollRef.current
      const scrollTo = direction === 'left' ? scrollLeft - 300 : scrollLeft + 300
      scrollRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' })
    }
  }

  if (loading) {
    return (
      <div className={styles.dashLoading}>
        <div className={styles.dashLoadingSpinner}></div>
        <p>Caricamento dashboard...</p>
      </div>
    )
  }

>>>>>>> f1c1326cb3492dab7373cb9d400f9e2dc1d5aa63
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
<<<<<<< HEAD

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
=======
  const years = [2023, 2024, 2025]
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4']

  const findAnalysis = (entries: Analysis[], year: number, q: string) => {
    return entries.find(a => {
      if (a.period_end) {
        const date = new Date(a.period_end)
        const aYear = date.getFullYear()
        const aMonth = date.getMonth() + 1
        const qIndex = parseInt(q.replace('Q', ''))
        const targetMonth = qIndex * 3
        return aYear === year && (aMonth >= targetMonth - 2 && aMonth <= targetMonth)
      }
>>>>>>> f1c1326cb3492dab7373cb9d400f9e2dc1d5aa63
      return false
    })
  }

<<<<<<< HEAD
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
=======
  const getQuarterDates = (year: number, q: string) => {
    const qIndex = parseInt(q.replace('Q', ''))
    const endMonth = qIndex * 3
    const startMonth = endMonth - 2
    const endDate = new Date(year, endMonth, 0)
    const startDate = new Date(year, startMonth - 1, 1)
    const prevQEnd = new Date(year, startMonth - 1, 0)
    const fmt = (d: Date) => d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
    return {
      start: fmt(prevQEnd),
      end: fmt(endDate)
    }
  }

  return (
    <main className={styles.dashWrapper}>
      <div className={styles.heroBackground} />

      {/* HEADER SECTION */}
      <header className={styles.dashHero}>
        <div className={styles.dashHeroInner}>
          <div className={styles.dashWelcome}>
            <h1>I Tuoi Investimenti Semplificati</h1>
            <p>
              Carica i PDF &quot;Estratto Conto&quot; per analizzare il tuo portafoglio.
              Se non li trovi, cercali nell&apos;<a href="#">Homebanking</a> nella sezione documenti.
            </p>
          </div>

          <div
            className={styles.dashDropzone}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => document.getElementById('file-input')?.click()}
          >
            <div className={styles.dashDropIconSm}>↑</div>
            <span className={styles.dropLabel}>TRASCINA I DOCUMENTI QUI</span>
            <span className={styles.dropSeparator}>oppure</span>
            <button className={styles.uploadBtnMain}>SFOGLIA I FILE</button>
            <input type="file" id="file-input" hidden accept=".pdf" onChange={handleFileSelect} />
          </div>

          {uploading && (
            <div className={styles.dashStatus}>
              <span style={{ color: uploadProgress.includes('✓') ? '#10b981' : '#f59e0b', fontWeight: 800 }}>
                {uploadProgress}
              </span>
            </div>
          )}
        </div>
      </header>

      <section className={styles.mainContent}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
            {showTrash ? `Cestino (${trashedAnalyses.length})` : `I tuoi Conti (${bankGroups.length}) e Estratti Conto (${analyses.length})`}
          </h2>
          <button
            onClick={() => setShowTrash(!showTrash)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              borderRadius: '50px',
              border: showTrash ? '2px solid #10b981' : '1px solid #e2e8f0',
              background: showTrash ? '#10b981' : 'white',
              color: showTrash ? 'white' : '#64748b',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            🗑️ {showTrash ? 'Torna alla Dashboard' : `Cestino${trashedAnalyses.length > 0 ? ` (${trashedAnalyses.length})` : ''}`}
          </button>
        </div>

        {showTrash ? (
          /* TRASH VIEW */
          trashedAnalyses.length === 0 ? (
            <div className={styles.dashEmpty}>
              <h3>🗑️ Il cestino è vuoto</h3>
              <p>Gli elementi eliminati appariranno qui.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '1rem' }}>
              {trashedAnalyses.map((item) => (
                <div key={item.id} style={{
                  background: 'white',
                  borderRadius: '16px',
                  padding: '1.25rem',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>
                      {item.bank_name} - {item.account_type === 'LIQUIDITY' ? 'Liquidità' : 'Dossier Titoli'}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                      Periodo: {item.period_start ? new Date(item.period_start).toLocaleDateString('it-IT') : 'N/D'} - {item.period_end ? new Date(item.period_end).toLocaleDateString('it-IT') : 'N/D'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => handleRestore(item.id)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: '1px solid #10b981',
                        background: 'white',
                        color: '#10b981',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      ↩️ Ripristina
                    </button>
                    <button
                      onClick={() => handlePermanentDelete(item.id)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: '1px solid #ef4444',
                        background: 'white',
                        color: '#ef4444',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      🗑️ Elimina
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : bankGroups.length === 0 ? (
          <div className={styles.dashEmpty}>
            <h3>Nessun estratto conto caricato</h3>
            <p>Carica il tuo primo PDF per iniziare l&apos;analisi.</p>
          </div>
        ) : (
          bankGroups.map((group, idx) => {
            const hasDossier = !!group.dossier;
            const hasLiquidity = !!group.liquidity;

            return (
              <div key={idx} className={styles.bankGroupBlock}>

                {/* BANK HEADER - Shows the bank name prominently */}
                <div className={styles.bankHeader}>
                  <div className={styles.bankLogo}>
                    {group.bankName.charAt(0).toUpperCase()}
                  </div>
                  <div className={styles.bankInfo}>
                    <h3 className={styles.bankName}>{group.bankName}</h3>
                    <div className={styles.bankSubtitle}>
                      {hasDossier && hasLiquidity ? 'Dossier Titoli + Conto Liquidità' :
                        hasDossier ? 'Solo Dossier Titoli' : 'Solo Conto Liquidità'}
                    </div>
                  </div>

                  {/* Three dots menu */}
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const menu = e.currentTarget.nextElementSibling as HTMLElement;
                        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '8px',
                        borderRadius: '8px',
                        fontSize: '1.25rem',
                        color: '#64748b',
                      }}
                    >
                      ⋮
                    </button>
                    <div
                      style={{
                        display: 'none',
                        position: 'absolute',
                        right: 0,
                        top: '100%',
                        background: 'white',
                        borderRadius: '12px',
                        boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                        border: '1px solid #e2e8f0',
                        padding: '8px',
                        minWidth: '180px',
                        zIndex: 100,
                      }}
                    >
                      <button
                        onClick={async () => {
                          const allIds = [
                            ...(group.dossier?.analyses.map(a => a.id) || []),
                            ...(group.liquidity?.analyses.map(a => a.id) || [])
                          ];
                          if (allIds.length === 0) return;
                          const confirmed = window.confirm(`Vuoi eliminare la sezione "${group.bankName}" e tutti i suoi documenti?`);
                          if (!confirmed) return;
                          for (const id of allIds) {
                            await handleDelete(id);
                          }
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: 'none',
                          background: 'transparent',
                          color: '#ef4444',
                          fontWeight: 600,
                          fontSize: '0.9rem',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#fef2f2'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        🗑️ Elimina sezione
                      </button>
                    </div>
                  </div>
                </div>

                <div className={styles.accountsContainer}>
                  {/* DOSSIER SECTION */}
                  {hasDossier && (
                    <div className={styles.accountSection}>
                      <div className={styles.accountHeader}>
                        <div className={styles.accountTitleInfo}>
                          <span className={styles.accBadge}>Dossier Titoli</span>
                          <div className={styles.accDetailsText}>
                            Codice Dossier: <strong>{group.dossier?.identifier}</strong><br />
                            Rendicontazione: <strong>Trimestrale</strong>
                          </div>
                        </div>
                        <Link href={`/analisi/${group.dossier?.analyses[0]?.id}`} className={styles.btnAnalysisPremium}>
                          VEDI ANALISI COMPLETA <span>→</span>
                        </Link>
                      </div>

                      <div className={styles.timelineNavigation}>
                        <div className={styles.scrollIndicator + ' ' + styles.leftIndicator} onClick={() => scrollTimeline('left')}>←</div>
                        <div className={styles.timelineGrid} ref={scrollRef}>
                          {years.map(year => (
                            <div key={year} className={styles.yearBlock}>
                              <div className={styles.yearLabelPremium}>{year}</div>
                              <div className={styles.quartersRow}>
                                {quarters.map(q => {
                                  const file = findAnalysis(group.dossier!.analyses, year, q);
                                  const isPresent = !!file;
                                  const dates = getQuarterDates(year, q);

                                  return (
                                    <div key={q} className={`${styles.tilePremium} ${isPresent ? styles.present : styles.absent}`}
                                      onClick={() => isPresent && router.push(`/analisi/${file.id}`)}>

                                      <div className={styles.tileDates}>
                                        {dates.start}<br />
                                        <span className={styles.arrowIconSmall}>↓</span>
                                        {dates.end}
                                      </div>

                                      {isPresent ? (
                                        <div className={styles.valueContainer}>
                                          <span className={styles.valueLabelSmall}>Rendimento</span>
                                          <div className={styles.valueDataLarge}>
                                            {file.forensic_summary?.performance_pct || 'N/D'}
                                          </div>
                                          <div className={styles.checkBadge}>✓</div>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleDelete(file.id);
                                            }}
                                            style={{
                                              position: 'absolute',
                                              top: '6px',
                                              left: '6px',
                                              width: '22px',
                                              height: '22px',
                                              borderRadius: '50%',
                                              border: 'none',
                                              background: 'rgba(239, 68, 68, 0.15)',
                                              color: '#ef4444',
                                              fontSize: '14px',
                                              fontWeight: 'bold',
                                              cursor: 'pointer',
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                            }}
                                            title="Elimina documento"
                                            onMouseEnter={(e) => e.currentTarget.style.background = '#ef4444'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'}
                                          >
                                            ×
                                          </button>
                                        </div>
                                      ) : (
                                        <>
                                          <div className={styles.statusIndicator}>ASSENTE</div>
                                          <div className={styles.uploadCircleBtn} onClick={(e) => {
                                            e.stopPropagation();
                                            document.getElementById('file-input')?.click();
                                          }}>+</div>
                                        </>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className={styles.scrollIndicator + ' ' + styles.rightIndicator} onClick={() => scrollTimeline('right')}>→</div>
                      </div>
                    </div>
                  )}

                  {/* ALERT BLOCK */}
                  {hasLiquidity && !hasDossier && (
                    <div className={styles.warningBanner}>
                      <div className={styles.warnContent}>
                        <div className={styles.warnIcon}>⚠️</div>
                        <div className={styles.warnText}>
                          Hai caricato la Liquidità per <strong>{group.bankName}</strong>, ma manca il <strong>Dossier Titoli</strong>.
                        </div>
                      </div>
                      <button className={styles.warnBtn} onClick={() => document.getElementById('file-input')?.click()}>
                        Carica Dossier
                      </button>
                    </div>
                  )}

                  {/* LIQUIDITY SECTION */}
                  {hasLiquidity && (
                    <div className={styles.accountSection}>
                      <div className={styles.accountHeader}>
                        <div className={styles.accountTitleInfo}>
                          <span className={`${styles.accBadge}`} style={{ background: 'rgba(16, 185, 129, 0.08)', color: '#10b981' }}>LIQUIDITÀ</span>
                          <div className={styles.accDetailsText}>
                            Conto corrente: <strong>{group.liquidity?.identifier}</strong><br />
                            Rendicontazione: <strong>Trimestrale</strong>
                          </div>
                        </div>
                        <Link href={`/analisi/${group.liquidity?.analyses[0]?.id}`} className={styles.btnAnalysisPremium}>
                          VEDI ANALISI COMPLETA <span>→</span>
                        </Link>
                      </div>

                      <div className={styles.timelineNavigation}>
                        <div className={styles.timelineGrid}>
                          {years.map(year => (
                            <div key={year} className={styles.yearBlock}>
                              <div className={styles.yearLabelPremium}>{year}</div>
                              <div className={styles.quartersRow}>
                                {quarters.map(q => {
                                  const file = findAnalysis(group.liquidity!.analyses, year, q);
                                  const isPresent = !!file;
                                  const dates = getQuarterDates(year, q);

                                  return (
                                    <div key={q} className={`${styles.tilePremium} ${isPresent ? styles.present : styles.absent}`}
                                      onClick={() => isPresent && router.push(`/analisi/${file.id}`)}>

                                      <div className={styles.tileDates}>
                                        {dates.start}<br />
                                        <span className={styles.arrowIconSmall}>↓</span>
                                        {dates.end}
                                      </div>

                                      {isPresent ? (
                                        <div className={styles.valueContainer}>
                                          <span className={styles.valueLabelSmall}>Saldo</span>
                                          <div className={styles.valueDataLarge}>
                                            €{(file.portfolio_value || 0).toLocaleString('it-IT', { notation: 'standard', minimumFractionDigits: 0 })}
                                          </div>
                                          <div className={styles.checkBadge} style={{ background: '#10b981' }}>✓</div>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleDelete(file.id);
                                            }}
                                            style={{
                                              position: 'absolute',
                                              top: '6px',
                                              left: '6px',
                                              width: '22px',
                                              height: '22px',
                                              borderRadius: '50%',
                                              border: 'none',
                                              background: 'rgba(239, 68, 68, 0.15)',
                                              color: '#ef4444',
                                              fontSize: '14px',
                                              fontWeight: 'bold',
                                              cursor: 'pointer',
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                            }}
                                            title="Elimina documento"
                                            onMouseEnter={(e) => e.currentTarget.style.background = '#ef4444'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'}
                                          >
                                            ×
                                          </button>
                                        </div>
                                      ) : (
                                        <>
                                          <div className={styles.statusIndicator}>ASSENTE</div>
                                          <div className={styles.uploadCircleBtn} onClick={(e) => {
                                            e.stopPropagation();
                                            document.getElementById('file-input')?.click();
                                          }}>+</div>
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
                  )}

                  {/* CROSS-CHECK ALERT: MISSING LIQUIDITY */}
                  {hasDossier && !hasLiquidity && (
                    <div className={styles.warningBanner} style={{ marginTop: '2rem' }}>
                      <div className={styles.warnContent}>
                        <div className={styles.warnIcon}>⚠️</div>
                        <div className={styles.warnText}>
                          Hai caricato il Dossier per <strong>{group.bankName}</strong>. Di solito c&apos;è sempre un <strong>Conto Corrente</strong> associato per la liquidità.
                        </div>
                      </div>
                      <button className={styles.warnBtn} onClick={() => document.getElementById('file-input')?.click()}>
                        Carica Liquidità
                      </button>
                    </div>
                  )}

                </div> {/* END accountsContainer */}
              </div>
            )
          })
        )}
      </section>
    </main>
>>>>>>> f1c1326cb3492dab7373cb9d400f9e2dc1d5aa63
  )
}
