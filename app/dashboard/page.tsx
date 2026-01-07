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
  holdings?: any[]
  transactions?: any[]
  dividends?: any[]
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
  const [inspectorData, setInspectorData] = useState<Analysis | null>(null)
  const router = useRouter()
  const supabase = createClient()

  // Multi-file upload state
  interface UploadingFile {
    id: string;
    name: string;
    status: 'queued' | 'uploading' | 'analyzing' | 'done' | 'error';
    progress: number;
    error?: string;
  }
  const [uploadQueue, setUploadQueue] = useState<UploadingFile[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const fileQueueRef = useRef<File[]>([])

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

  // Process upload queue
  const processQueue = useCallback(async () => {
    if (!user || isProcessing || fileQueueRef.current.length === 0) return

    setIsProcessing(true)

    while (fileQueueRef.current.length > 0) {
      const file = fileQueueRef.current.shift()!
      const fileId = `${file.name}-${Date.now()}`

      // Update status to uploading
      setUploadQueue(prev => prev.map(f =>
        f.id === fileId ? { ...f, status: 'uploading' as const, progress: 10 } : f
      ))

      try {
        // Simulate upload progress
        const progressInterval = setInterval(() => {
          setUploadQueue(prev => prev.map(f => {
            if (f.id === fileId && f.status === 'uploading') {
              const newProgress = Math.min(40, f.progress + 5)
              return { ...f, progress: newProgress }
            }
            return f
          }))
        }, 200)

        // Update to analyzing
        setTimeout(() => {
          setUploadQueue(prev => prev.map(f =>
            f.id === fileId ? { ...f, status: 'analyzing' as const, progress: 50 } : f
          ))
        }, 800)

        const formData = new FormData()
        formData.append('file', file)
        formData.append('userId', user.id)

        const response = await fetch('/api/parse-pdf', {
          method: 'POST',
          body: formData,
        })

        clearInterval(progressInterval)
        const result = await response.json()

        if (result.success) {
          setUploadQueue(prev => prev.map(f =>
            f.id === fileId ? { ...f, status: 'done' as const, progress: 100 } : f
          ))
          await fetchAnalyses(user.id)
        } else {
          setUploadQueue(prev => prev.map(f =>
            f.id === fileId ? { ...f, status: 'error' as const, progress: 0, error: result.error } : f
          ))
        }
      } catch (error: any) {
        setUploadQueue(prev => prev.map(f =>
          f.id === fileId ? { ...f, status: 'error' as const, progress: 0, error: error.message } : f
        ))
      }
    }

    setIsProcessing(false)

    // Clear completed files after 3 seconds
    setTimeout(() => {
      setUploadQueue(prev => prev.filter(f => f.status !== 'done'))
    }, 3000)
  }, [user, isProcessing, fetchAnalyses])

  // Add files to queue
  const addFilesToQueue = useCallback((files: FileList | File[]) => {
    const newFiles: UploadingFile[] = []
    const filesToProcess: File[] = []

    Array.from(files).forEach(file => {
      if (file.type === 'application/pdf') {
        const fileId = `${file.name}-${Date.now()}`
        newFiles.push({
          id: fileId,
          name: file.name,
          status: 'queued',
          progress: 0
        })
        filesToProcess.push(file)
      }
    })

    if (newFiles.length === 0) {
      alert('Per favore carica solo file PDF')
      return
    }

    setUploadQueue(prev => [...prev, ...newFiles])
    fileQueueRef.current.push(...filesToProcess)

    // Start processing
    setTimeout(() => processQueue(), 100)
  }, [processQueue])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const files = e.dataTransfer.files
    if (files.length > 0) {
      addFilesToQueue(files)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      addFilesToQueue(files)
    }
    // Reset input to allow selecting same files again
    e.target.value = ''
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

  // --- 1. Normalizzazione Banche (Clustering) ---
  const allRawBanks = Array.from(new Set(analyses.map(a => a.bank_name?.trim() || 'Banca Sconosciuta')));
  const bankClusterMap: Record<string, string> = {};

  // Utility per normalizzare i nomi delle banche (rimuove spazi, accenti e ordina le parole)
  const getBankKey = (name: string) => name.toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Rimuove accenti
    .replace(/[^A-Z0-9 ]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .sort()
    .join(' ');

  allRawBanks.sort((a, b) => b.length - a.length);
  allRawBanks.forEach(bank => {
    if (!bankClusterMap[bank]) {
      const bankKey = getBankKey(bank);
      const clusterHead = allRawBanks.find(other => {
        if (other === bank) return false;
        const otherKey = getBankKey(other);
        return bankKey.includes(otherKey) || otherKey.includes(bankKey) || bankKey === otherKey;
      }) || bank;
      bankClusterMap[bank] = clusterHead;
    }
  });

  // --- 2. Identificazione Connessioni e Normalizzazione Account ---
  // Estrae solo cifre per confronti numerici
  const extractNumericCore = (acc: string) => acc?.replace(/\D/g, '') || '';
  const normalizeAcc = (acc: string) => acc?.replace(/[^a-zA-Z0-9]/g, '').replace(/^0+/, '').toUpperCase() || 'ND';

  // Mappa ogni account al suo settlement e alla banca raw
  const accountMetaMap = analyses.reduce((acc, a) => {
    const rawAccNum = a.benchmark_comparison || 'N/D';
    const normAcc = normalizeAcc(rawAccNum);
    const rawBank = a.bank_name?.trim() || 'Banca Sconosciuta';
    const bank = bankClusterMap[rawBank] || rawBank;
    const rawSettlement = a.costs_breakdown?.settlementAccount as string || '';
    const settlementAcc = normalizeAcc(rawSettlement);

    if (!acc[normAcc]) {
      acc[normAcc] = {
        bankName: bank,
        connections: new Set<string>(),
        rawIdentifier: rawAccNum,
        numericCore: extractNumericCore(rawAccNum),
        settlementNumericCore: extractNumericCore(rawSettlement)
      };
    }
    if (settlementAcc && settlementAcc !== 'ND') acc[normAcc].connections.add(settlementAcc);
    return acc
  }, {} as Record<string, { bankName: string; connections: Set<string>; rawIdentifier: string; numericCore: string; settlementNumericCore: string }>);

  // Fuzzy linking: connette account tramite suffisso numerico del settlement (ultimi 8 caratteri)
  const normKeys = Object.keys(accountMetaMap);
  normKeys.forEach(normKey => {
    const meta = accountMetaMap[normKey];
    const settlementCore = meta.settlementNumericCore;

    if (settlementCore.length >= 8) {
      const settlementSuffix = settlementCore.slice(-8);

      normKeys.forEach(otherKey => {
        if (otherKey === normKey) return;
        const otherMeta = accountMetaMap[otherKey];
        const otherCore = otherMeta.numericCore;

        if (otherCore.length >= 8) {
          const otherSuffix = otherCore.slice(-8);
          // Match se gli ultimi 8 caratteri coincidono
          if (settlementSuffix === otherSuffix) {
            meta.connections.add(otherKey);
          }
        }
      });
    }
  });

  // --- 3. Costruzione Union-Find per collegare account transitivamente ---
  const parent: Record<string, string> = {};
  const find = (x: string): string => {
    if (!parent[x]) parent[x] = x;
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  };
  const union = (a: string, b: string) => {
    const pa = find(a), pb = find(b);
    if (pa !== pb) parent[pa] = pb;
  };

  // Unisci tutti gli account connessi
  normKeys.forEach(k => {
    accountMetaMap[k].connections.forEach(conn => {
      if (accountMetaMap[conn]) union(k, conn);
    });
  });

  // --- 4. Risoluzione Nomi Banche Finali (basata su Union-Find) ---
  const clusterBankMap: Record<string, string> = {};
  normKeys.forEach(k => {
    const root = find(k);
    if (!clusterBankMap[root]) {
      clusterBankMap[root] = accountMetaMap[k].bankName;
    }
  });
  const finalBankMap: Record<string, string> = {};
  normKeys.forEach(k => {
    finalBankMap[k] = clusterBankMap[find(k)];
  });

  // --- 4. Raggruppamento Finale ---
  const bankGroupsMap = analyses.reduce((acc, a) => {
    const rawAccNum = a.benchmark_comparison || 'N/D';
    const normAcc = normalizeAcc(rawAccNum);
    const bankName = finalBankMap[normAcc] || bankClusterMap[a.bank_name?.trim() || ''] || 'Banca Sconosciuta';
    const isLiquidity = a.account_type === 'LIQUIDITY';

    if (!acc[bankName]) acc[bankName] = { bankName, dossiers: [], liquidityAccounts: [] };

    const targetList = isLiquidity ? acc[bankName].liquidityAccounts : acc[bankName].dossiers;
    // Raggruppa per normAcc per unificare record che differiscono solo per zeri iniziali
    let group = targetList.find(g => normalizeAcc(g.identifier) === normAcc);
    if (!group) {
      group = { identifier: rawAccNum, analyses: [] };
      targetList.push(group);
    }
    group.analyses.push(a);
    return acc;
  }, {} as Record<string, BankGroup>);

  const bankGroups = Object.values(bankGroupsMap);

  const allYears = analyses.map(a => a.period_end ? new Date(a.period_end).getFullYear() : null).filter(Boolean) as number[]
  const minYear = allYears.length > 0 ? Math.min(...allYears) : new Date().getFullYear() - 1
  const currentYear = new Date().getFullYear()
  const years: number[] = []
  for (let y = minYear; y <= currentYear; y++) years.push(y)

  const quarters = ['Q1', 'Q2', 'Q3', 'Q4']

  const findAnalysis = (entries: Analysis[], year: number, q: string) => {
    return entries.find(a => {
      if (a.period_end) {
        const date = new Date(a.period_end)
        const qIndex = parseInt(q.replace('Q', ''))
        const targetMonth = qIndex * 3
        return date.getFullYear() === year && (date.getMonth() + 1 >= targetMonth - 2 && date.getMonth() + 1 <= targetMonth)
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
    return { start: fmt(new Date(year, startMonth - 1, 0)), end: fmt(endDate) }
  }

  const renderVal = (val: any, isCurrency = false) => {
    if (val === 'non trovato' || val === null || val === undefined) {
      return <span className={styles.missingValue}>non trovato</span>
    }
    if (val === 'da calcolare') {
      return <span className={styles.calcValue}>da calcolare</span>
    }
    const displayVal = isCurrency && typeof val === 'number'
      ? `€${val.toLocaleString('it-IT')}`
      : val;
    return <span className={styles.foundValue}>{displayVal}</span>
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
            <input type="file" id="file-input" hidden accept=".pdf" multiple onChange={handleFileSelect} />
          </div>

          {/* Upload Queue */}
          {uploadQueue.length > 0 && (
            <div style={{ width: '100%', maxWidth: '600px', margin: '1.5rem auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {uploadQueue.map(file => (
                <div key={file.id} style={{
                  background: 'white',
                  borderRadius: '12px',
                  padding: '16px 20px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  border: '1px solid #e2e8f0'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '1.2rem' }}>
                        {file.status === 'queued' && '⏳'}
                        {file.status === 'uploading' && '📤'}
                        {file.status === 'analyzing' && '🧠'}
                        {file.status === 'done' && '✅'}
                        {file.status === 'error' && '❌'}
                      </span>
                      <span style={{
                        fontWeight: 700,
                        color: '#0f172a',
                        fontSize: '0.9rem',
                        maxWidth: '300px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {file.name}
                      </span>
                    </div>
                    <span style={{
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      color: file.status === 'done' ? '#10b981' : file.status === 'error' ? '#ef4444' : '#64748b'
                    }}>
                      {file.status === 'queued' && 'In coda...'}
                      {file.status === 'uploading' && `${file.progress}%`}
                      {file.status === 'analyzing' && 'Analisi AI...'}
                      {file.status === 'done' && 'Completato!'}
                      {file.status === 'error' && 'Errore'}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div style={{
                    width: '100%',
                    height: '8px',
                    background: '#e2e8f0',
                    borderRadius: '4px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${file.progress}%`,
                      height: '100%',
                      background: file.status === 'error' ? '#ef4444' :
                        file.status === 'done' ? '#10b981' :
                          'linear-gradient(90deg, #10b981, #34d399)',
                      borderRadius: '4px',
                      transition: 'width 0.3s ease'
                    }} />
                  </div>

                  {/* Error message */}
                  {file.status === 'error' && file.error && (
                    <p style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '8px', marginBottom: 0 }}>
                      {file.error}
                    </p>
                  )}
                </div>
              ))}
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
                                            <div className={styles.tileActions}>
                                              <button className={styles.tileInpectBtn} onClick={(e) => { e.stopPropagation(); setInspectorData(file); }}>🔍 DATA</button>
                                            </div>
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
                                            <div className={styles.tileActions}>
                                              <button className={styles.tileInpectBtn} onClick={(e) => { e.stopPropagation(); setInspectorData(file); }}>🔍 DATA</button>
                                            </div>
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
              <div>
                <h3>Dati Estratti: {inspectorData.bank_name}</h3>
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>Periodo: {new Date(inspectorData.period_start).toLocaleDateString()} - {new Date(inspectorData.period_end).toLocaleDateString()}</p>
              </div>
              <button className={styles.closeBtn} onClick={() => setInspectorData(null)}>×</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.infoGrid}>
                <div className={styles.infoItem}><strong>Banca</strong> {renderVal(inspectorData.bank_name)}</div>
                <div className={styles.infoItem}><strong>Account</strong> {renderVal(inspectorData.benchmark_comparison)}</div>
                <div className={styles.infoItem}><strong>Settlement</strong> {renderVal(inspectorData.costs_breakdown?.settlementAccount)}</div>
              </div>

              <div className={styles.inspectorSection}>
                <h4>Portafoglio Finale</h4>
                <table className={styles.inspectorTable}>
                  <thead><tr><th>ISIN</th><th>Ticker</th><th>Quantità</th><th>Valore</th></tr></thead>
                  <tbody>
                    {inspectorData.holdings?.map((h: any, i: number) => (
                      <tr key={i}>
                        <td>{renderVal(h.isin)}</td>
                        <td>{renderVal(h.ticker)}</td>
                        <td>{renderVal(h.quantity)}</td>
                        <td>{renderVal(h.marketValue, true)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className={styles.inspectorSection}>
                <h4>Movimenti del Periodo</h4>
                <table className={styles.inspectorTable}>
                  <thead><tr><th>Data</th><th>Tipo</th><th>ISIN</th><th>Quantità</th><th>Valore</th></tr></thead>
                  <tbody>
                    {inspectorData.transactions?.map((t: any, i: number) => (
                      <tr key={i}>
                        <td>{renderVal(t.date)}</td>
                        <td>{renderVal(t.type)}</td>
                        <td>{renderVal(t.isin)}</td>
                        <td>{renderVal(t.quantity)}</td>
                        <td>{renderVal(t.exchangeValue, true)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
