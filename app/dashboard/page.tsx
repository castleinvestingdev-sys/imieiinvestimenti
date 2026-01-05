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
  const scrollRef = useRef<HTMLDivElement>(null)

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
      return false
    })
  }

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
        <h2 className={styles.sectionTitle}>
          I tuoi Conti ({bankGroups.length}) e Estratti Conto ({analyses.length})
        </h2>

        {bankGroups.length === 0 ? (
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

                {/* DOSSIER SECTION */}
                {hasDossier && (
                  <div className={styles.accountRow}>
                    <div className={styles.accountHeader}>
                      <div className={styles.accountTitleInfo}>
                        <span className={styles.accBadge}>Dossier Titoli</span>
                        <div className={styles.accDetailsText}>
                          Banca: <strong>{group.bankName}</strong><br />
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
                  <div className={styles.accountRow} style={{ marginTop: hasDossier ? '4rem' : '0' }}>
                    <div className={styles.accountHeader}>
                      <div className={styles.accountTitleInfo}>
                        <span className={`${styles.accBadge}`} style={{ background: 'rgba(16, 185, 129, 0.08)', color: '#10b981' }}>LIQUIDITÀ</span>
                        <div className={styles.accDetailsText}>
                          Banca: <strong>{group.bankName}</strong><br />
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

              </div>
            )
          })
        )}
      </section>
    </main>
  )
}
