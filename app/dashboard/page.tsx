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
  costs_breakdown?: any
  forensic_summary?: {
    performance_pct?: string
  }
}

type AccountGroup = { identifier: string; analyses: Analysis[] };

type BankGroup = {
  bankName: string;
  dossiers: AccountGroup[];
  liquidityAccounts: AccountGroup[];
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null)
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [trashedAnalyses, setTrashedAnalyses] = useState<Analysis[]>([])
  const [showTrash, setShowTrash] = useState(false)
  const [loading, setLoading] = useState(true)
  const [uploadPercent, setUploadPercent] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [inspectorData, setInspectorData] = useState<Analysis | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const fetchAnalyses = useCallback(async (userId: string) => {
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
    setUploadPercent(5)

    const progressInterval = setInterval(() => {
      setUploadPercent(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval)
          return 90
        }
        const increment = Math.max(1, (95 - prev) / 15)
        return Math.min(90, prev + increment)
      })
    }, 400)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('userId', user.id)

      const response = await fetch('/api/parse-pdf', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()
      clearInterval(progressInterval)

      if (result.success) {
        setUploadPercent(100)
        setUploadProgress('✓ Analisi completata!')
        await fetchAnalyses(user.id)
        setTimeout(() => {
          setUploading(false)
          setUploadProgress('')
          setUploadPercent(0)
        }, 1500)
      } else {
        setUploadProgress(`Errore: ${result.error}`)
        setUploadPercent(0)
        setTimeout(() => {
          setUploading(false)
          setUploadProgress('')
        }, 5000)
      }
    } catch (error) {
      clearInterval(progressInterval)
      console.error('Upload error:', error)
      setUploadProgress('Errore durante il caricamento')
      setUploadPercent(0)
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

  const scrollTimeline = (direction: 'left' | 'right', element: HTMLDivElement | null) => {
    if (element) {
      const { scrollLeft } = element
      const scrollTo = direction === 'left' ? scrollLeft - 300 : scrollLeft + 300
      element.scrollTo({ left: scrollTo, behavior: 'smooth' })
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

  // 1. Identify unique accounts and connections with normalization
  const accountMetaMap = analyses.reduce((acc, a) => {
    const rawAccNum = a.benchmark_comparison || 'N/D'
    const accNum = rawAccNum.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    const bank = a.bank_name?.trim() || 'Banca Sconosciuta'
    const settlementAcc = (a.costs_breakdown?.settlementAccount as string)?.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()

    if (!acc[accNum]) {
      acc[accNum] = {
        bankName: bank,
        connections: new Set<string>(),
        type: a.account_type,
        originalId: rawAccNum
      }
    }
    if (settlementAcc) {
      acc[accNum].connections.add(settlementAcc)
    }
    return acc
  }, {} as Record<string, { bankName: string; connections: Set<string>; type: string; originalId: string }>)

  // Fuzzy linking: if a dossier mentions an IBAN that contains or is contained in an account number
  const normalizedKeys = Object.keys(accountMetaMap)
  normalizedKeys.forEach(accNum => {
    const meta = accountMetaMap[accNum]
    meta.connections.forEach(conn => {
      if (!accountMetaMap[conn]) {
        const match = normalizedKeys.find(k => k.length > 5 && (conn.includes(k) || k.includes(conn)))
        if (match && match !== accNum) {
          meta.connections.add(match)
        }
      }
    })
  })

  // 2. Resolve Bank Names
  const bankNormalizationMap: Record<string, string> = {}
  normalizedKeys.forEach(accNum => {
    const meta = accountMetaMap[accNum]
    if (!bankNormalizationMap[accNum]) {
      bankNormalizationMap[accNum] = meta.bankName
    }
    meta.connections.forEach(conn => {
      bankNormalizationMap[conn] = meta.bankName
    })
  })

  // 3. Final Grouping
  const bankGroupsMap = analyses.reduce((acc, a) => {
    const rawAccNum = a.benchmark_comparison || 'N/D'
    const accNum = rawAccNum.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    const bankIdentifier = bankNormalizationMap[accNum] || a.bank_name?.trim() || 'Banca Sconosciuta'
    const isLiquidity = a.account_type === 'LIQUIDITY'

    if (!acc[bankIdentifier]) {
      acc[bankIdentifier] = { bankName: bankIdentifier, dossiers: [], liquidityAccounts: [] }
    }

    const targetList = isLiquidity ? acc[bankIdentifier].liquidityAccounts : acc[bankIdentifier].dossiers
    let group = targetList.find(g => g.identifier === rawAccNum)
    if (!group) {
      group = { identifier: rawAccNum, analyses: [] }
      targetList.push(group)
    }
    group.analyses.push(a)

    return acc
  }, {} as Record<string, BankGroup>)

  const bankGroups = Object.values(bankGroupsMap)

  const allYears = analyses.map(a => a.period_end ? new Date(a.period_end).getFullYear() : null).filter(Boolean) as number[]
  const minYear = allYears.length > 0 ? Math.min(...allYears) : new Date().getFullYear() - 1
  const currentYear = new Date().getFullYear()
  const years: number[] = []
  for (let y = minYear; y <= currentYear; y++) {
    years.push(y)
  }

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
      return false
    })
  }

  const getQuarterDates = (year: number, q: string) => {
    const qIndex = parseInt(q.replace('Q', ''))
    const endMonth = qIndex * 3
    const startMonth = endMonth - 2
    const endDate = new Date(year, endMonth, 0)
    const fmt = (d: Date) => d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const prevQEnd = new Date(year, startMonth - 1, 0)
    return {
      start: fmt(prevQEnd),
      end: fmt(endDate)
    }
  }

  return (
    <main className={styles.dashWrapper}>
      <div className={styles.heroBackground} />

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
            <div className={styles.dashStatus} style={{ width: '100%', maxWidth: '500px', margin: '1rem auto' }}>
              <div className={styles.progressStatus}>
                <span style={{ color: uploadProgress.includes('✓') ? '#10b981' : '#f59e0b', fontWeight: 800, fontSize: '0.9rem' }}>
                  {uploadProgress}
                </span>
                <span className={styles.progressPercentage}>
                  {Math.round(uploadPercent)}%
                </span>
              </div>
              <div className={styles.progressContainer}>
                <div
                  className={styles.progressBar}
                  style={{ width: `${uploadPercent}%` }}
                />
              </div>
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
            return (
              <div key={idx} className={styles.bankGroupBlock}>
                <div className={styles.bankHeader}>
                  <div className={styles.bankLogo}>
                    {group.bankName.charAt(0).toUpperCase()}
                  </div>
                  <div className={styles.bankInfo}>
                    <h3 className={styles.bankName}>{group.bankName}</h3>
                    <div className={styles.bankSubtitle}>
                      {group.dossiers.length} Dossier Titoli | {group.liquidityAccounts.length} Conti Correnti
                    </div>
                  </div>
                </div>

                <div className={styles.accountsContainer}>
                  {/* Multiple Dossiers per Bank */}
                  {group.dossiers.map((dossier, dIdx) => (
                    <div key={`dossier-${dIdx}`} className={styles.accountSection}>
                      <div className={styles.accountHeader}>
                        <div className={styles.accountTitleInfo}>
                          <span className={styles.accBadge}>Dossier Titoli</span>
                          <div className={styles.accDetailsText}>
                            Codice Dossier: <strong>{dossier.identifier}</strong><br />
                            Rendicontazione: <strong>Trimestrale</strong>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <button
                            onClick={() => setInspectorData(dossier.analyses[0])}
                            style={{
                              padding: '8px 12px',
                              borderRadius: '8px',
                              border: '1px solid #64748b',
                              background: 'transparent',
                              color: '#64748b',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            🔍 DATI PDF
                          </button>
                          <Link href={`/analisi/${dossier.analyses[0]?.id}`} className={styles.btnAnalysisPremium}>
                            VEDI ANALISI <span>→</span>
                          </Link>
                          <button
                            onClick={async () => {
                              if (!window.confirm(`Vuoi spostare nel cestino il Dossier ${dossier.identifier}?`)) return;
                              for (const a of dossier.analyses) await handleDelete(a.id);
                            }}
                            className={styles.deleteSectionBtn}
                            style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: 'none', padding: '8px', borderRadius: '8px', cursor: 'pointer' }}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>

                      <div className={styles.timelineNavigation}>
                        <div className={styles.scrollIndicator + ' ' + styles.leftIndicator}
                          onClick={(e) => {
                            const grid = e.currentTarget.nextElementSibling as HTMLDivElement;
                            scrollTimeline('left', grid);
                          }}>←</div>
                        <div className={styles.timelineGrid}>
                          {years.map(year => {
                            const visibleQuarters = quarters.filter(q => {
                              const qIndex = parseInt(q.replace('Q', ''))
                              const quarterEndDate = new Date(year, qIndex * 3, 0)
                              return quarterEndDate <= new Date()
                            })
                            if (visibleQuarters.length === 0) return null
                            return (
                              <div key={year} className={styles.yearBlock}>
                                <div className={styles.yearLabelPremium}>{year}</div>
                                <div className={styles.quartersRow}>
                                  {visibleQuarters.map(q => {
                                    const file = findAnalysis(dossier.analyses, year, q);
                                    const isPresent = !!file;
                                    const dates = getQuarterDates(year, q);
                                    return (
                                      <div key={q} className={`${styles.tilePremium} ${isPresent ? styles.present : styles.absent}`}
                                        onClick={() => isPresent && router.push(`/analisi/${file.id}`)}>
                                        <div className={styles.tileDates}>{dates.start}<br /><span className={styles.arrowIconSmall}>↓</span>{dates.end}</div>
                                        {isPresent ? (
                                          <div className={styles.valueContainer}>
                                            <span className={styles.valueLabelSmall}>Rendimento</span>
                                            <div className={styles.valueDataLarge}>{file.forensic_summary?.performance_pct || 'N/D'}</div>
                                            <div className={styles.checkBadge}>✓</div>
                                          </div>
                                        ) : (
                                          <div className={styles.uploadCircleBtn} onClick={(e) => { e.stopPropagation(); document.getElementById('file-input')?.click(); }}>+</div>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                        <div className={styles.scrollIndicator + ' ' + styles.rightIndicator}
                          onClick={(e) => {
                            const grid = e.currentTarget.previousElementSibling as HTMLDivElement;
                            scrollTimeline('right', grid);
                          }}>→</div>
                      </div>
                    </div>
                  ))}

                  {/* Multiple Liquidity Accounts per Bank */}
                  {group.liquidityAccounts.map((liquidity, lIdx) => (
                    <div key={`liquidity-${lIdx}`} className={styles.accountSection}>
                      <div className={styles.accountHeader}>
                        <div className={styles.accountTitleInfo}>
                          <span className={styles.accBadge} style={{ background: 'rgba(59,130,246,0.08)', color: '#3b82f6' }}>LIQUIDITÀ</span>
                          <div className={styles.accDetailsText}>
                            Conto corrente: <strong>{liquidity.identifier}</strong><br />
                            Rendicontazione: <strong>Trimestrale</strong>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <button
                            onClick={() => setInspectorData(liquidity.analyses[0])}
                            style={{
                              padding: '8px 12px',
                              borderRadius: '8px',
                              border: '1px solid #64748b',
                              background: 'transparent',
                              color: '#64748b',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            🔍 DATI PDF
                          </button>
                          <Link href={`/analisi/${liquidity.analyses[0]?.id}`} className={styles.btnAnalysisPremium}>
                            VEDI ANALISI <span>→</span>
                          </Link>
                          <button
                            onClick={async () => {
                              if (!window.confirm(`Vuoi spostare nel cestino il Conto ${liquidity.identifier}?`)) return;
                              for (const a of liquidity.analyses) await handleDelete(a.id);
                            }}
                            style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: 'none', padding: '8px', borderRadius: '8px', cursor: 'pointer' }}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>

                      <div className={styles.timelineNavigation}>
                        <div className={styles.timelineGrid}>
                          {years.map(year => {
                            const visibleQuarters = quarters.filter(q => {
                              const qIndex = parseInt(q.replace('Q', ''))
                              const quarterEndDate = new Date(year, qIndex * 3, 0)
                              return quarterEndDate <= new Date()
                            })
                            if (visibleQuarters.length === 0) return null
                            return (
                              <div key={year} className={styles.yearBlock}>
                                <div className={styles.yearLabelPremium}>{year}</div>
                                <div className={styles.quartersRow}>
                                  {visibleQuarters.map(q => {
                                    const file = findAnalysis(liquidity.analyses, year, q);
                                    const isPresent = !!file;
                                    const dates = getQuarterDates(year, q);
                                    return (
                                      <div key={q} className={`${styles.tilePremium} ${isPresent ? styles.present : styles.absent}`}
                                        onClick={() => isPresent && router.push(`/analisi/${file.id}`)}>
                                        <div className={styles.tileDates}>{dates.start}<br /><span className={styles.arrowIconSmall}>↓</span>{dates.end}</div>
                                        {isPresent ? (
                                          <div className={styles.valueContainer}>
                                            <span className={styles.valueLabelSmall}>Saldo</span>
                                            <div className={styles.valueDataLarge}>€{(file.portfolio_value || 0).toLocaleString('it-IT')}</div>
                                            <div className={styles.checkBadge} style={{ background: '#3b82f6' }}>✓</div>
                                          </div>
                                        ) : (
                                          <div className={styles.uploadCircleBtn} onClick={(e) => { e.stopPropagation(); document.getElementById('file-input')?.click(); }}>+</div>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })
        )}
      </section>

      {/* Inspector Modal */}
      {inspectorData && (
        <div className={styles.modalOverlay} onClick={() => setInspectorData(null)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Informazioni Estratte dal PDF</h3>
              <button className={styles.closeBtn} onClick={() => setInspectorData(null)}>×</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.infoGrid}>
                <div className={styles.infoItem}>
                  <strong>Banca:</strong> {inspectorData.bank_name}
                </div>
                <div className={styles.infoItem}>
                  <strong>Tipo:</strong> {inspectorData.account_type}
                </div>
                <div className={styles.infoItem}>
                  <strong>Codice/IBAN:</strong> {inspectorData.benchmark_comparison}
                </div>
                <div className={styles.infoItem}>
                  <strong>Conto Collegato:</strong> {inspectorData.costs_breakdown?.settlementAccount || 'Nessuno'}
                </div>
              </div>
              <pre className={styles.rawJson}>
                {JSON.stringify(inspectorData.costs_breakdown, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
