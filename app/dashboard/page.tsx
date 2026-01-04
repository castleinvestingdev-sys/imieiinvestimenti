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
    benchmark_comparison: string
    forensic_summary?: {
        performance_pct?: string
    }
    info?: {
        bankName?: string
        holder?: string
        periodEnd?: string
    }
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
            <div className="dash-loading">
                <div className="dash-loading-spinner"></div>
                <p>Caricamento dashboard...</p>
                <style jsx>{`
          .dash-loading {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 60vh;
            gap: 1.5rem;
          }
          .dash-loading-spinner {
            width: 50px;
            height: 50px;
            border: 4px solid #e2e8f0;
            border-top-color: #00C853;
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
            </div>
        )
    }

    // Calculate years dynamically
    let minYear = new Date().getFullYear()
    let maxYear = new Date().getFullYear()

    analyses.forEach(a => {
        if (a.period_end) {
            const year = new Date(a.period_end).getFullYear()
            if (year < minYear) minYear = year
            if (year > maxYear) maxYear = year
        }
    })

    const years: number[] = []
    for (let y = minYear; y <= maxYear; y++) {
        years.push(y)
    }
    if (years.length === 0) {
        const currentYear = new Date().getFullYear()
        years.push(currentYear - 2, currentYear - 1, currentYear)
    }

    const quarters = ['Q1', 'Q2', 'Q3', 'Q4']

    // Group analyses
    const groups = analyses.reduce((acc, a) => {
        const type = a.account_type || 'DOSSIER'
        if (!acc[type]) acc[type] = []
        acc[type].push(a)
        return acc
    }, {} as Record<string, Analysis[]>)

    const totalConti = Object.keys(groups).length
    const totalEstratti = analyses.length

    const findAnalysis = (entries: Analysis[], year: number, q: string) => {
        return entries.find(a => {
            if (a.year && a.quarter) {
                return a.year === year && a.quarter === q
            }
            if (a.period_end) {
                const date = new Date(a.period_end)
                const aYear = date.getFullYear()
                const aMonth = date.getMonth() + 1
                const qIndex = parseInt(q.replace('Q', ''))
                const targetMonth = qIndex * 3
                return aYear === year && (aMonth >= targetMonth - 2 && aMonth <= targetMonth)
            }
            return false
        })
    }

    return (
        <>
            <style jsx>{`
        .dash-wrapper {
          min-height: 100vh;
          background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
        }
        .dash-hero {
          background: linear-gradient(135deg, #ffffff 0%, #f1f5f9 100%);
          padding: 3.5rem 0 2.5rem;
          border-bottom: 1px solid rgba(0,0,0,0.05);
        }
        .dash-hero-inner {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 2rem;
        }
        .dash-welcome h1 {
          font-size: 2.5rem;
          font-weight: 800;
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin-bottom: 0.5rem;
          letter-spacing: -1px;
        }
        .dash-welcome p {
          font-size: 1.1rem;
          color: #64748b;
        }
        .dash-welcome p a {
          color: #00C853;
          font-weight: 600;
          text-decoration: underline;
        }
        .dash-dropzone {
          height: 130px;
          background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
          border: 3px dashed #00C853;
          border-radius: 70px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 3rem;
          cursor: pointer;
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 20px rgba(0, 200, 83, 0.1);
          margin-top: 2rem;
        }
        .dash-dropzone:hover {
          background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
          border-color: #22c55e;
          transform: scale(1.01);
          box-shadow: 0 8px 30px rgba(0, 200, 83, 0.2);
        }
        .dash-drop-icon {
          width: 60px;
          height: 60px;
          background: linear-gradient(135deg, #00C853 0%, #00E676 100%);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 15px rgba(0, 200, 83, 0.3);
        }
        .dash-drop-text {
          font-weight: 900;
          font-size: 1.4rem;
          letter-spacing: 1px;
          color: #1e293b;
        }
        .dash-drop-sep {
          color: #94a3b8;
          font-weight: 500;
          font-size: 1rem;
        }
        .dash-btn-upload {
          background: linear-gradient(135deg, #475569 0%, #334155 100%);
          color: white;
          padding: 1rem 2.2rem;
          border-radius: 50px;
          font-weight: 700;
          font-size: 0.9rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          box-shadow: 0 4px 15px rgba(0,0,0,0.15);
          border: none;
          cursor: pointer;
        }
        .dash-status {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-weight: 600;
          font-size: 0.95rem;
          color: #00C853;
          margin-top: 1rem;
        }
        .dash-status-dot {
          width: 10px;
          height: 10px;
          background: #00C853;
          border-radius: 50%;
          animation: pulse-dot 2s ease-in-out infinite;
        }
        @keyframes pulse-dot {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.2); opacity: 0.7; }
        }
        .dash-timeline {
          padding: 3rem 0 5rem;
        }
        .dash-timeline-inner {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 2rem;
        }
        .dash-section-title {
          font-size: 2rem;
          font-weight: 800;
          color: #1e293b;
          margin-bottom: 2.5rem;
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .dash-section-title span {
          background: linear-gradient(135deg, #00C853 0%, #00E676 100%);
          color: white;
          padding: 0.3rem 1rem;
          border-radius: 20px;
          font-size: 1rem;
          font-weight: 700;
        }
        .dash-account-card {
          background: white;
          border-radius: 24px;
          padding: 2rem;
          margin-bottom: 2.5rem;
          box-shadow: 0 4px 20px rgba(0,0,0,0.06);
          border: 1px solid rgba(0,0,0,0.04);
        }
        .dash-account-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1.5rem;
          padding-bottom: 1.5rem;
          border-bottom: 1px solid #f1f5f9;
        }
        .dash-account-badge {
          display: inline-block;
          background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
          color: white;
          padding: 0.4rem 1.2rem;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 0.75rem;
        }
        .dash-account-meta {
          font-size: 0.95rem;
          color: #64748b;
          line-height: 1.8;
        }
        .dash-account-meta strong {
          color: #1e293b;
          font-weight: 700;
        }
        .dash-btn-analysis {
          background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
          color: #334155;
          padding: 0.8rem 1.8rem;
          border-radius: 50px;
          font-weight: 700;
          font-size: 0.85rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          text-decoration: none;
        }
        .dash-years-grid {
          display: flex;
          gap: 1.5rem;
          overflow-x: auto;
          padding-bottom: 1rem;
        }
        .dash-year-col {
          flex-shrink: 0;
        }
        .dash-year-label {
          font-weight: 800;
          font-size: 1.1rem;
          color: #1e293b;
          margin-bottom: 1rem;
          padding-left: 0.5rem;
        }
        .dash-quarters-row {
          display: flex;
          gap: 0.75rem;
        }
        .dash-tile {
          width: 120px;
          height: 160px;
          border-radius: 16px;
          padding: 1rem;
          display: flex;
          flex-direction: column;
          position: relative;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          cursor: pointer;
        }
        .dash-tile:hover {
          transform: translateY(-4px);
        }
        .dash-tile.active {
          background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%);
          border: 2px solid #22c55e;
          box-shadow: 0 4px 15px rgba(34, 197, 94, 0.2);
        }
        .dash-tile.absent {
          background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
          border: 2px dashed #cbd5e1;
        }
        .dash-tile-dates {
          text-align: center;
          font-size: 0.8rem;
          font-weight: 700;
          color: #334155;
          line-height: 1.4;
        }
        .dash-tile-footer {
          margin-top: auto;
          text-align: center;
        }
        .dash-tile-label {
          font-size: 0.7rem;
          font-weight: 600;
          color: #64748b;
          display: block;
          margin-bottom: 0.25rem;
        }
        .dash-tile-perf {
          font-size: 1.1rem;
          font-weight: 900;
          color: #16a34a;
        }
        .dash-tile-check {
          position: absolute;
          bottom: -6px;
          right: -6px;
          width: 26px;
          height: 26px;
          background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
          border: 3px solid white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 14px;
          font-weight: bold;
          box-shadow: 0 2px 8px rgba(34, 197, 94, 0.4);
        }
        .dash-empty {
          text-align: center;
          padding: 4rem 2rem;
          background: white;
          border-radius: 24px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.06);
        }
        .dash-empty-icon {
          font-size: 4rem;
          margin-bottom: 1rem;
        }
        .dash-empty h3 {
          font-size: 1.5rem;
          color: #1e293b;
          margin-bottom: 0.5rem;
        }
        .dash-empty p {
          color: #64748b;
        }
      `}</style>

            <div className="dash-wrapper">
                {/* HERO UPLOAD SECTION */}
                <section className="dash-hero">
                    <div className="dash-hero-inner">
                        <div className="dash-welcome">
                            <h1>Carica i PDF &quot;Estratto Conto&quot; del Dossier Titoli e Conto corrente</h1>
                            <p>Non li trovi? Puoi scaricarli dall&apos;<a href="#">Homebanking</a>, la banca è tenuta a darteli per legge. Li trovi nella sezione documenti.</p>
                        </div>

                        <div
                            className="dash-dropzone"
                            onDrop={handleDrop}
                            onDragOver={(e) => e.preventDefault()}
                            onClick={() => document.getElementById('file-input')?.click()}
                        >
                            <div className="dash-drop-icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" width="28" height="28">
                                    <path d="M12 19V6M5 12l7-7 7 7" />
                                </svg>
                            </div>
                            <span className="dash-drop-text">DRAG & DROP</span>
                            <span className="dash-drop-sep">oppure</span>
                            <button className="dash-btn-upload">Carica da PC</button>
                            <input type="file" id="file-input" hidden accept=".pdf" onChange={handleFileSelect} />
                        </div>

                        {uploading && (
                            <div className="dash-status">
                                <div className="dash-status-dot" style={{ background: uploadProgress.includes('✓') ? '#00C853' : '#f97316' }}></div>
                                <span style={{ color: uploadProgress.includes('✓') ? '#00C853' : '#f97316' }}>{uploadProgress}</span>
                            </div>
                        )}
                    </div>
                </section>

                {/* TIMELINE SECTION */}
                <section className="dash-timeline">
                    <div className="dash-timeline-inner">
                        <h2 className="dash-section-title">
                            I tuoi Conti <span>{totalConti}</span> e Estratti Conto <span>{totalEstratti}</span>
                        </h2>

                        {totalConti === 0 ? (
                            <div className="dash-empty">
                                <div className="dash-empty-icon">📊</div>
                                <h3>Nessun estratto conto caricato</h3>
                                <p>Carica il tuo primo PDF per iniziare l&apos;analisi forense dei tuoi investimenti</p>
                            </div>
                        ) : (
                            <>
                                {Object.entries(groups).map(([type, entries]) => (
                                    <div key={type} className="dash-account-card">
                                        <div className="dash-account-header">
                                            <div>
                                                <span className="dash-account-badge">{type === 'DOSSIER' ? 'TITOLI' : 'LIQUIDITÀ'}</span>
                                                <div className="dash-account-meta">
                                                    Banca: <strong>{entries[0]?.bank_name || 'Banca N/D'}</strong>
                                                </div>
                                            </div>
                                            <Link href={`/analisi/${entries[0]?.id}`} className="dash-btn-analysis">
                                                VEDI ANALISI COMPLETA
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path d="M5 12h14M12 5l7 7-7 7" />
                                                </svg>
                                            </Link>
                                        </div>

                                        <div className="dash-years-grid">
                                            {years.map(year => (
                                                <div key={year} className="dash-year-col">
                                                    <div className="dash-year-label">{year}</div>
                                                    <div className="dash-quarters-row">
                                                        {quarters.map(q => {
                                                            const file = findAnalysis(entries, year, q)
                                                            const hasAnalysis = !!file

                                                            return (
                                                                <div
                                                                    key={`${year}-${q}`}
                                                                    className={`dash-tile ${hasAnalysis ? 'active' : 'absent'}`}
                                                                    onClick={() => hasAnalysis && router.push(`/analisi/${file.id}`)}
                                                                >
                                                                    <div className="dash-tile-dates">
                                                                        {q}
                                                                        <br />
                                                                        {hasAnalysis ? (
                                                                            <span style={{ fontSize: '0.7rem', fontWeight: 400, color: '#64748b' }}>
                                                                                {file.period_end ? new Date(file.period_end).toLocaleDateString('it-IT') : ''}
                                                                            </span>
                                                                        ) : (
                                                                            <span style={{ color: '#94a3b8' }}>↓</span>
                                                                        )}
                                                                    </div>

                                                                    <div className="dash-tile-footer">
                                                                        {hasAnalysis ? (
                                                                            <>
                                                                                <span className="dash-tile-label">
                                                                                    {type === 'LIQUIDITY' ? 'Saldo:' : 'Valore:'}
                                                                                </span>
                                                                                <div className="dash-tile-perf" style={{ color: '#1e293b' }}>
                                                                                    €{(file.portfolio_value || 0).toLocaleString('it-IT')}
                                                                                </div>
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <span className="dash-tile-label">Mancante</span>
                                                                                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>ASSENTE</div>
                                                                            </>
                                                                        )}
                                                                    </div>

                                                                    {hasAnalysis && <div className="dash-tile-check">✓</div>}
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                </section>
            </div>
        </>
    )
}
