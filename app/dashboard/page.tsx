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
  dossierNumber?: string // Add new fields for display logic
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
        }, 4000)
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

  // --- LOGIC: Group by Bank -> Group by Type ---
  // Helper to normalize bank names for grouping (simple version)
  const normalizeBank = (name: string) => name?.trim() || 'Banca Sconosciuta'

  const bankGroupsMap = analyses.reduce((acc, a) => {
    const bank = normalizeBank(a.bank_name)
    const type = a.account_type === 'LIQUIDITY' ? 'liquidity' : 'dossier'

    if (!acc[bank]) acc[bank] = { bankName: bank }

    if (!acc[bank][type]) {
      acc[bank][type] = { identifier: a.benchmark_comparison || 'N/D', analyses: [] }
    }

    // Add to collection
    acc[bank][type]!.analyses.push(a)
    // Update identifier if we find a better one (e.g. from a newer file)
    if (a.benchmark_comparison && a.benchmark_comparison !== 'N/D') {
      acc[bank][type]!.identifier = a.benchmark_comparison
    }

    return acc
  }, {} as Record<string, BankGroup>)

  const bankGroups = Object.values(bankGroupsMap)

  // Calculate years based on analyses or default to current year scope
  let minYear = new Date().getFullYear() - 1
  let maxYear = new Date().getFullYear()

  if (analyses.length > 0) {
    // Adjust range based on data
    // ... (simplified for now to fixed year range for UI consistency)
    minYear = 2023
    maxYear = 2025 // Show future/current
  }

  const years = [2023, 2024, 2025]
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4']

  // Helper specific for finding by Period
  const findAnalysis = (entries: Analysis[], year: number, q: string) => {
    return entries.find(a => {
      // Using logic from before
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

  // --- UI HELPERS ---
  const getQuarterDates = (year: number, q: string) => {
    const qIndex = parseInt(q.replace('Q', ''))
    const endMonth = qIndex * 3
    const startMonth = endMonth - 2
    // End of Quarter
    const endDate = new Date(year, endMonth - 1 + 1, 0) // last day
    const startDate = new Date(year, startMonth - 1, 1)

    // Previous quarter end (for start date display logic from screenshot)
    // Screenshot shows: "31.12.2022" -> Arrow -> "31.03.2023" for Q1 2023
    const prevQEnd = new Date(year, startMonth - 1, 0)

    const fmt = (d: Date) => d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })

    return {
      start: fmt(prevQEnd), // "31.12.2022"
      end: fmt(endDate)     // "31.03.2023"
    }
  }

  return (
    <>
      <style jsx>{`
        .dash-wrapper {
          min-height: 100vh;
          background: #F3F4F6; /* Light grey bg */
          padding-bottom: 4rem;
        }
        .dash-hero {
          background: linear-gradient(180deg, #FFFFFF 0%, #FAFAFA 100%);
          padding: 3rem 0;
          border-bottom: 1px solid #E5E7EB;
        }
        .dash-hero-inner {
          max-width: 1400px;
          margin: 0 auto;
          padding: 0 2rem;
        }
        .dash-welcome h1 {
          font-size: 2.2rem;
          font-weight: 800;
          color: #111827;
          margin-bottom: 0.5rem;
          letter-spacing: -0.02em;
        }
        .dash-welcome p a {
          color: #00C853;
          font-weight: 600;
          text-decoration: underline;
        }
        .dash-section-title {
          font-size: 1.8rem;
          font-weight: 800;
          color: #111827;
          margin-bottom: 2rem;
          margin-top: 3rem;
          display: flex;
          align-items: center;
          gap: 0.8rem;
        }
        .dash-group-container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 0 2rem;
        }
        
        /* Bank Card Group */
        .bank-group-block {
            background: #FFFFFF;
            border-radius: 20px;
            padding: 2.5rem;
            margin-bottom: 2rem;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        
        .account-row {
            margin-bottom: 3rem;
        }
        .account-row:last-child {
            margin-bottom: 0;
        }
        
        .account-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            margin-bottom: 1.5rem;
        }
        .account-title {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .acc-type-badge {
            font-size: 0.9rem;
            font-weight: 900;
            text-transform: uppercase;
            color: #111827;
            letter-spacing: 0.5px;
        }
        .acc-details {
            font-size: 0.95rem;
            color: #4B5563;
        }
        .acc-details strong {
            color: #111827;
            font-weight: 700;
        }
        
        .btn-see-analysis {
            background: #F3F4F6;
            color: #1F2937;
            font-size: 0.8rem;
            font-weight: 700;
            padding: 0.6rem 1.2rem;
            border-radius: 99px;
            display: flex;
            align-items: center;
            gap: 6px;
            text-transform: uppercase;
            text-decoration: none;
            transition: background 0.2s;
        }
        .btn-see-analysis:hover {
            background: #E5E7EB;
        }

        /* Grid */
        .timeline-grid {
            display: flex;
            gap: 3rem; /* Spacing between years */
            overflow-x: auto;
            padding-bottom: 10px;
        }
        .year-block {
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }
        .year-label {
            font-size: 1rem;
            font-weight: 700;
            color: #111827;
        }
        .quarters {
            display: flex;
            gap: 0.8rem;
        }

        /* Tile Styling */
        .tile {
            width: 110px;
            height: 140px;
            border-radius: 12px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: space-between;
            padding: 0.8rem 0.5rem;
            position: relative;
            transition: transform 0.2s;
        }
        .tile:hover {
            transform: translateY(-2px);
        }
        
        /* Present State */
        .tile.present {
            background: #DCFCE7; /* Light Green */
        }
        .tile.present .dates {
            font-size: 0.7rem;
            font-weight: 700;
            color: #166534;
            text-align: center;
            line-height: 1.3;
        }
        .tile.present .arrow-icon {
            font-size: 1rem;
            color: #16A34A;
        }
        .tile.present .value-label {
            font-size: 0.65rem;
            color: #16A34A;
            opacity: 0.8;
            font-weight: 500;
            font-style: italic;
        }
        .tile.present .value-data {
            font-size: 0.9rem;
            font-weight: 800;
            color: #15803D; /* Green text */
        }
        .tile.present .check-icon {
            position: absolute;
            bottom: 6px;
            right: 6px;
            width: 20px;
            height: 20px;
            background: #22C55E;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 12px;
            font-weight: bold;
        }

        /* Absent State */
        .tile.absent {
            background: #F9FAFB;
            border: 1px solid #E5E7EB;
        }
        .tile.absent .dates {
             font-size: 0.7rem;
            font-weight: 600;
            color: #6B7280;
            text-align: center;
            line-height: 1.3;
        }
        .tile.absent .arrow-icon {
             font-size: 1rem;
             color: #9CA3AF;
        }
        .tile.absent .status-text {
            color: #EF4444; /* Red for ASSENTE per screenshot */
            font-weight: 800;
            font-size: 0.75rem;
            text-transform: uppercase;
        }
        .tile.absent .upload-btn {
            background: #E5E7EB;
            color: #6B7280;
            border: none;
            border-radius: 12px;
            padding: 4px 12px;
            font-size: 0.65rem;
            font-weight: 700;
            cursor: pointer;
        }
        .tile.absent .upload-btn:hover {
            background: #D1D5DB;
        }
        
        /* Dropzone Override */
        .dash-dropzone {
          height: 90px;
          background: linear-gradient(90deg, #ECFDF5 0%, #D1FAE5 100%);
          border: 2px dashed #10B981;
          border-radius: 99px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 2rem;
          cursor: pointer;
          margin-top: 1rem;
        }
        .dash-drop-icon-sm {
           background: #10B981;
           border-radius: 50%;
           width: 40px;
           height: 40px;
           display: flex;
           align-items: center;
           justify-content: center;
           color: white;
           font-weight: bold;
        }

        .missing-account-alert {
            margin-top: 1rem;
            background: #FFFBEB;
            border: 1px solid #FCD34D;
            border-radius: 12px;
            padding: 1rem;
            display: flex;
            align-items: center;
            gap: 1rem;
        }
        .alert-text {
            font-size: 0.9rem;
            color: #92400E;
            font-weight: 500;
        }
        .alert-btn {
            background: #F59E0B;
            color: white;
            font-weight: 700;
            font-size: 0.85rem;
            padding: 0.5rem 1rem;
            border-radius: 8px;
            border: none;
            cursor: pointer;
        }
      `}</style>

      <div className="dash-wrapper">
        {/* HERO UPLOAD SECTION */}
        <section className="dash-hero">
          <div className="dash-hero-inner">
            <div className="dash-welcome">
              <h1>Carica i PDF &quot;Estratto Conto&quot; del Dossier Titoli e Conto corrente</h1>
              <p style={{ color: '#6B7280' }}>
                Non li trovi? Puoi scaricarli dall&apos;<a href="#">Homebanking</a>, la banca è tenuta a darteli per legge. Li trovi nella sezione documenti.
              </p>
            </div>

            <div
              className="dash-dropzone"
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => document.getElementById('file-input')?.click()}
            >
              <div className="dash-drop-icon-sm">
                ↑
              </div>
              <span style={{ fontWeight: 800, fontSize: '1.2rem', color: '#064E3B' }}>DRAG & DROP</span>
              <span style={{ color: '#6EE7B7', fontWeight: 600 }}>oppure</span>
              <button style={{
                background: '#1F2937', color: 'white', fontWeight: 700, padding: '0.6rem 1.5rem', borderRadius: '50px', border: 'none', cursor: 'pointer'
              }}>CARICA DA PC</button>
              <input type="file" id="file-input" hidden accept=".pdf" onChange={handleFileSelect} />
            </div>

            {uploading && (
              <div className="dash-status">
                <span style={{ color: uploadProgress.includes('✓') ? '#059669' : '#D97706', fontWeight: 700 }}>{uploadProgress}</span>
              </div>
            )}
            {/* Display generic error if db insert failed (from previous steps) */}
            {analyses.length === 0 && !uploading && uploadProgress.includes('Errore') && (
              <div style={{ color: 'red', marginTop: '10px', fontSize: '0.9rem' }}>{uploadProgress}</div>
            )}
          </div>
        </section>

        <div className="dash-group-container">
          <h2 className="dash-section-title">
            I tuoi Conti ({bankGroups.length}) e Estratti Conto ({analyses.length})
          </h2>

          {bankGroups.length === 0 ? (
            <div className="dash-empty">
              <h3>Nessun estratto conto caricato</h3>
              <p>Carica il tuo primo PDF per iniziare.</p>
            </div>
          ) : (
            bankGroups.map((group, idx) => {
              const hasDossier = !!group.dossier;
              const hasLiquidity = !!group.liquidity;

              return (
                <div key={idx} className="bank-group-block">

                  {/* --- 1. DOSSIER ROW --- */}
                  {hasDossier && (
                    <div className="account-row">
                      <div className="account-header">
                        <div className="account-title">
                          <span className="acc-type-badge">TITOLI</span>
                          <div className="acc-details">
                            Banca: <strong>{group.bankName}</strong><br />
                            Dossier Titoli: {group.dossier?.identifier}<br />
                            Rendicontazione: Trimestrale
                          </div>
                        </div>
                        {/* Only link to first analysis for now */}
                        <Link href={`/analisi/${group.dossier?.analyses[0]?.id}`} className="btn-see-analysis">
                          VEDI ANALISI COMPLETA →
                        </Link>
                      </div>

                      {/* GRID */}
                      <div className="timeline-grid">
                        {years.map(year => (
                          <div key={year} className="year-block">
                            <div className="year-label">{year}</div>
                            <div className="quarters">
                              {quarters.map(q => {
                                const file = findAnalysis(group.dossier!.analyses, year, q);
                                const isPresent = !!file;
                                const dates = getQuarterDates(year, q);

                                return (
                                  <div key={q} className={`tile ${isPresent ? 'present' : 'absent'}`}
                                    onClick={() => isPresent && router.push(`/analisi/${file.id}`)}>

                                    <div className="dates">
                                      {dates.start}<br />
                                      <span className="arrow-icon">↓</span><br />
                                      {dates.end}
                                    </div>

                                    {isPresent ? (
                                      <>
                                        <div style={{ textAlign: 'center' }}>
                                          <span className="value-label">Rendimento:</span>
                                          <div className="value-data" style={{ color: '#EAB308' }}>
                                            Data Mock
                                            {/* In reality use forensic_summary or calculated yield */}
                                          </div>
                                        </div>
                                        <div className="check-icon">✓</div>
                                      </>
                                    ) : (
                                      <>
                                        <div className="status-text">ASSENTE</div>
                                        <button className="upload-btn" onClick={(e) => {
                                          e.stopPropagation();
                                          document.getElementById('file-input')?.click();
                                        }}>Carica +</button>
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
                  )}

                  {/* --- CROSS-CHECK ALERT: MISSING DOSSIER --- */}
                  {hasLiquidity && !hasDossier && (
                    <div className="missing-account-alert">
                      <div className="alert-text">
                        Hai caricato la Liquidità per <strong>{group.bankName}</strong>, ma manca il <strong>Dossier Titoli</strong>.
                      </div>
                      <button className="alert-btn" onClick={() => document.getElementById('file-input')?.click()}>
                        Carica Dossier
                      </button>
                    </div>
                  )}


                  {/* --- 2. LIQUIDITY ROW --- */}
                  {hasLiquidity && (
                    <div className="account-row" style={{ marginTop: hasDossier ? '3rem' : '0' }}>
                      <div className="account-header">
                        <div className="account-title">
                          <span className="acc-type-badge">LIQUIDITÀ</span>
                          <div className="acc-details">
                            Banca: <strong>{group.bankName}</strong><br />
                            Conto corrente: {group.liquidity?.identifier}<br />
                            Rendicontazione: Trimestrale
                          </div>
                        </div>
                        <Link href={`/analisi/${group.liquidity?.analyses[0]?.id}`} className="btn-see-analysis">
                          VEDI ANALISI COMPLETA →
                        </Link>
                      </div>

                      {/* GRID (Identical logic, different styling if needed, but keeping consistent) */}
                      <div className="timeline-grid">
                        {years.map(year => (
                          <div key={year} className="year-block">
                            <div className="year-label">{year}</div>
                            <div className="quarters">
                              {quarters.map(q => {
                                const file = findAnalysis(group.liquidity!.analyses, year, q);
                                const isPresent = !!file;
                                const dates = getQuarterDates(year, q);

                                return (
                                  <div key={q} className={`tile ${isPresent ? 'present' : 'absent'}`}
                                    onClick={() => isPresent && router.push(`/analisi/${file.id}`)}>

                                    <div className="dates">
                                      {dates.start}<br />
                                      <span className="arrow-icon">↓</span><br />
                                      {dates.end}
                                    </div>

                                    {isPresent ? (
                                      <>
                                        <div style={{ textAlign: 'center' }}>
                                          <span className="value-label">Saldo:</span>
                                          <div className="value-data">
                                            €{(file.portfolio_value || 0).toLocaleString('it-IT', { notation: 'compact' })}
                                          </div>
                                        </div>
                                        <div className="check-icon">✓</div>
                                      </>
                                    ) : (
                                      <>
                                        <div className="status-text">ASSENTE</div>
                                        <button className="upload-btn" onClick={(e) => {
                                          e.stopPropagation();
                                          document.getElementById('file-input')?.click();
                                        }}>Carica +</button>
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
                  )}

                  {/* --- CROSS-CHECK ALERT: MISSING LIQUIDITY --- */}
                  {hasDossier && !hasLiquidity && (
                    <div className="missing-account-alert" style={{ marginTop: '2rem' }}>
                      <div className="alert-text">
                        Hai caricato il Dossier per <strong>{group.bankName}</strong>. Di solito c&apos;è sempre un <strong>Conto Corrente</strong> associato per la liquidità.
                      </div>
                      <button className="alert-btn" onClick={() => document.getElementById('file-input')?.click()}>
                        Carica Liquidità
                      </button>
                    </div>
                  )}

                </div>
              )
            })
          )}
        </div>
      </div>
    </>
  )
}
