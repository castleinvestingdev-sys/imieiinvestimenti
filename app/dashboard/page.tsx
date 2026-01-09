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
  const [editingValues, setEditingValues] = useState<any>(null)
  const [isSaving, setIsSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Multi-file upload state
  interface UploadingFile {
    id: string;
    name: string;
    status: 'queued' | 'uploading' | 'analyzing' | 'done' | 'error';
    progress: number;
    error?: string;
    index?: number;
    total?: number;
  }
  const [uploadQueue, setUploadQueue] = useState<UploadingFile[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const fileQueueRef = useRef<{ id: string; file: File }[]>([])
  const totalFilesRef = useRef<number>(0)
  const currentFileIndexRef = useRef<number>(0)
  const dropzoneRef = useRef<HTMLDivElement>(null)
  const batchAccumulatorRef = useRef<File[]>([])
  const batchTimeoutRef = useRef<NodeJS.Timeout | null>(null)



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
    if (inspectorData) {
      setEditingValues(JSON.parse(JSON.stringify(inspectorData.costs_breakdown || {})))
    } else {
      setEditingValues(null)
    }
  }, [inspectorData])

  const handleUpdateValue = (field: string, value: any) => {
    setEditingValues((prev: any) => {
      const currentObj = prev[field]
      const isObj = typeof currentObj === 'object' && currentObj !== null && 'value' in currentObj
      const oldValue = isObj ? currentObj.value : currentObj
      const newValue = isObj ? { ...currentObj, value } : value

      return {
        ...prev,
        [field]: newValue,
        [`${field}_is_modified`]: value !== oldValue
      }
    })
  }

  const handleRestoreValue = (field: string) => {
    if (!inspectorData) return
    // Check for permanent AI backup first, then fallback to current session original
    const originalValue = inspectorData.costs_breakdown?.original_ai_data?.[field] ?? inspectorData.costs_breakdown?.[field]
    setEditingValues((prev: any) => ({
      ...prev,
      [field]: originalValue,
      [`${field}_is_modified`]: false
    }))
  }

  const handleSaveInspector = async () => {
    if (!user || !inspectorData || !editingValues) return
    setIsSaving(true)

    try {
      // Calculate new totals if balances changed
      const updatedData = { ...editingValues }

      const { error } = await supabase
        .from('analyses')
        .update({
          costs_breakdown: updatedData,
          portfolio_value: typeof updatedData.final_balance === 'object'
            ? updatedData.final_balance.value
            : (typeof updatedData.final_balance === 'number' ? updatedData.final_balance : inspectorData.portfolio_value)
        })
        .eq('id', inspectorData.id)

      if (error) throw error

      await fetchAnalyses(user.id)
      setInspectorData(prev => prev ? { ...prev, costs_breakdown: updatedData } : null)
      alert('Dati aggiornati con successo')
    } catch (err: any) {
      console.error('Error saving inspector data:', err)
      alert('Errore durante il salvataggio: ' + err.message)
    } finally {
      setIsSaving(false)
    }
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

    console.log('--- START PROCESS QUEUE ---')
    console.log('Files in queue:', fileQueueRef.current.length)
    setIsProcessing(true)

    // We only reset index if the queue was totally empty for a while
    // Otherwise we keep incrementing to provide a "session" feel
    if (!isProcessing && uploadQueue.length === 0) {
      currentFileIndexRef.current = 0
    }

    while (fileQueueRef.current.length > 0) {
      console.log('Processing next file, remaining:', fileQueueRef.current.length)
      const { id: fileId, file } = fileQueueRef.current.shift()!
      currentFileIndexRef.current++

      // Update status to uploading with index info
      setUploadQueue(prev => {
        const currentIndex = currentFileIndexRef.current

        return prev.map(f => {
          const isCurrent = f.id === fileId
          return {
            ...f,
            // Status and progress only for the current processing file
            ...(isCurrent ? {
              status: f.status === 'done' ? f.status : 'uploading' as const,
              progress: f.status === 'done' ? 100 : Math.max(f.progress, 5),
              index: currentIndex
            } : {})
          }
        })
      })


      try {
        // Progress animation that continues throughout the process
        let currentProgress = 5
        const progressInterval = setInterval(() => {
          setUploadQueue(prev => prev.map(f => {
            if (f.id === fileId && (f.status === 'uploading' || f.status === 'analyzing')) {
              // Slow down as we approach 90%
              const maxProgress = 90
              const increment = Math.max(0.5, (maxProgress - currentProgress) / 20)
              currentProgress = Math.min(maxProgress, currentProgress + increment)
              return { ...f, progress: Math.round(currentProgress) }
            }
            return f
          }))
        }, 300)

        // Update to analyzing after 1 second
        setTimeout(() => {
          setUploadQueue(prev => prev.map(f =>
            f.id === fileId ? { ...f, status: 'analyzing' as const } : f
          ))
        }, 1000)

        const formData = new FormData()
        formData.append('file', file)
        formData.append('userId', user.id)

        console.log('Sending request for:', file.name)
        const response = await fetch('/api/parse-pdf', {
          method: 'POST',
          body: formData,
        })
        console.log('Response status:', response.status)

        clearInterval(progressInterval)
        const result = await response.json()

        if (result.success) {
          setUploadQueue(prev => prev.map(f =>
            f.id === fileId ? { ...f, status: 'done' as const, progress: 100 } : f
          ))
          await fetchAnalyses(user.id)

          // Scroll to newly added document using the analysis ID from the response
          const newAnalysisId = result.analysisId
          setTimeout(() => {
            // First scroll to main content
            const mainContent = document.querySelector('[class*="mainContent"]')
            mainContent?.scrollIntoView({ behavior: 'smooth', block: 'start' })

            // Then find and scroll to the specific tile
            setTimeout(() => {
              const targetTile = newAnalysisId
                ? document.querySelector(`[data-analysis-id="${newAnalysisId}"]`)
                : document.querySelectorAll('[data-has-analysis="true"]')[0]

              if (targetTile) {
                (targetTile as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
              }
            }, 600)
          }, 500)

        } else {
          // Check if it's a rate limit error - retry after delay
          if (result.error?.includes('rate') || result.error?.includes('limit') || result.error?.includes('429')) {
            setUploadQueue(prev => prev.map(f =>
              f.id === fileId ? { ...f, status: 'queued' as const, progress: 0, error: 'Rate limit - riprovo...' } : f
            ))
            // Re-add to queue and wait
            fileQueueRef.current.unshift({ id: fileId, file })
            await new Promise(resolve => setTimeout(resolve, 5000))
          } else {
            setUploadQueue(prev => prev.map(f =>
              f.id === fileId ? { ...f, status: 'error' as const, progress: 0, error: result.error } : f
            ))
          }
        }
      } catch (error: any) {
        setUploadQueue(prev => prev.map(f =>
          f.id === fileId ? { ...f, status: 'error' as const, progress: 0, error: error.message } : f
        ))
      }

      // Wait 3 seconds between files to avoid Gemini rate limiting
      if (fileQueueRef.current.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 3000))
      }
    }


    setIsProcessing(false)
    // We DON'T reset currentFileIndexRef here, so the next batch continues the count

    // Clear completed files after 3 seconds
    setTimeout(() => {
      setUploadQueue(prev => prev.filter(f => f.status !== 'done'))
    }, 3000)
  }, [user, fetchAnalyses])

  // EFFECT: Process queue when items are available and not already processing
  useEffect(() => {
    if (!isProcessing && fileQueueRef.current.length > 0) {
      // Small delay (500ms) to allow multiple drop/select events to batch up
      const timer = setTimeout(() => {
        if (!isProcessing && fileQueueRef.current.length > 0) {
          console.log('[QUEUE-BATCH] Starting processQueue for', fileQueueRef.current.length, 'files')
          processQueue()
        }
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [isProcessing, processQueue, uploadQueue])

  // DEBUG EFFECT: Log uploadQueue changes
  useEffect(() => {
    if (uploadQueue.length > 0) {
      console.log('[DEBUG-STATE] UploadQueue:', uploadQueue.map(f => `${f.name} (${f.status})`))
    }
  }, [uploadQueue])

  // Add files to queue
  const addFilesToQueue = useCallback((files: FileList | File[]) => {
    const newFiles: UploadingFile[] = []
    const filesToProcess: { id: string; file: File }[] = []

    console.log(`[QUEUE] addFilesToQueue: analizzando ${Array.from(files).length} oggetti`)

    Array.from(files).forEach((file, index) => {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
      console.log(`[QUEUE] Controllo: ${file.name} (Size: ${file.size}, Type: ${file.type}, isPdf: ${isPdf})`)

      if (isPdf) {
        // Use a more unique ID to avoid collisions (timestamp + index + random string)
        const fileId = `${file.name}-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 9)}`
        newFiles.push({
          id: fileId,
          name: file.name,
          status: 'queued',
          progress: 0
        })
        filesToProcess.push({ id: fileId, file })
      } else {
        console.warn(`[QUEUE] File SCARTATO: ${file.name} (Non PDF o corrotto)`)
      }
    })

    if (newFiles.length === 0) {
      console.error('[QUEUE] Nessun file PDF valido trovato nel batch')
      alert('Per favore carica solo file PDF')
      return
    }

    console.log(`[QUEUE] addFilesToQueue: aggiunta di ${newFiles.length} file`)

    setUploadQueue(prev => {
      const combined = [...prev, ...newFiles]
      const totalInSession = combined.length

      // Update EVERY file in the list with the NEW total and correct index
      return combined.map((f, i) => ({
        ...f,
        index: i + 1,
        total: totalInSession
      }))
    })
    fileQueueRef.current.push(...filesToProcess)
    console.log('[QUEUE] Added to internal ref. Pending:', fileQueueRef.current.length)
  }, [])

  const [dragCounter, setDragCounter] = useState(0)
  const [fullPageDragCounter, setFullPageDragCounter] = useState(0)

  const handleFullPageDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setFullPageDragCounter(prev => prev + 1)
  }

  const handleFullPageDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setFullPageDragCounter(prev => Math.max(0, prev - 1))
  }

  const handleFullPageDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setFullPageDragCounter(0)

    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      addFilesToQueue(files)
    }
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragCounter(prev => prev + 1)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragCounter(prev => prev - 1)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragCounter(0)

    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      console.log(`[DEBUG-DROP] Drop React: ${files.length} file rilevati`)

      // Accumulate to handle fragmented drops
      batchAccumulatorRef.current.push(...Array.from(files))

      if (batchTimeoutRef.current) clearTimeout(batchTimeoutRef.current)

      batchTimeoutRef.current = setTimeout(() => {
        const batch = [...batchAccumulatorRef.current]
        batchAccumulatorRef.current = []
        batchTimeoutRef.current = null
        addFilesToQueue(batch)
      }, 150)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      console.log(`[EVENT] handleFileSelect: selezionati ${files.length} file`)
      for (let i = 0; i < files.length; i++) {
        console.log(`[EVENT] File ${i}: ${files[i].name} (${files[i].type})`)
      }
      if (files.length > 0) {
        addFilesToQueue(files)
      }
    }
    // Reset input to allow selecting same files again
    if (e.target) e.target.value = ''
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

  const getYearFrequency = (accountAnalyses: Analysis[], year: number) => {
    const yearAnalyses = accountAnalyses.filter(a => a.period_end && new Date(a.period_end).getFullYear() === year);
    const hasMonthly = yearAnalyses.some(a => {
      if (!a.period_start || !a.period_end) return false;
      const start = new Date(a.period_start);
      const end = new Date(a.period_end);
      const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays < 45;
    });
    return hasMonthly ? 'monthly' : 'quarterly';
  }

  const findAnalysisInSlot = (entries: Analysis[], year: number, slotIndex: number, frequency: 'monthly' | 'quarterly') => {
    return entries.find(a => {
      if (!a.period_end) return false;
      const date = new Date(a.period_end);
      if (date.getFullYear() !== year) return false;

      const month = date.getMonth() + 1;
      if (frequency === 'monthly') {
        // In monthly mode, check if the document ends in this specific month
        // or if it's a quarterly document that covers this month (usually ends at month 3, 6, 9, 12)
        const isQuarterly = a.period_start && ((new Date(a.period_end).getTime() - new Date(a.period_start).getTime()) / (1000 * 60 * 60 * 24)) > 45;
        if (isQuarterly) {
          // Quarterly documents match the end month (3, 6, 9, 12)
          return month === slotIndex;
        }
        return month === slotIndex;
      } else {
        // Quarterly mode (Q1-Q4)
        const targetMonth = slotIndex * 3;
        return month >= targetMonth - 2 && month <= targetMonth;
      }
    })
  }

  const getSlotDates = (year: number, slotIndex: number, frequency: 'monthly' | 'quarterly') => {
    const fmt = (d: Date) => d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    if (frequency === 'monthly') {
      const startDate = new Date(year, slotIndex - 1, 1);
      const endDate = new Date(year, slotIndex, 0);
      return { start: fmt(startDate), end: fmt(endDate), label: startDate.toLocaleString('it-IT', { month: 'short' }).toUpperCase() };
    } else {
      const endMonth = slotIndex * 3;
      const startMonth = endMonth - 2;
      const startDate = new Date(year, startMonth - 1, 1);
      const endDate = new Date(year, endMonth, 0);
      return { start: fmt(startDate), end: fmt(endDate), label: `Q${slotIndex}` };
    }
  }


  const renderVal = (val: any, isCurrency = false) => {
    if (val === 'non trovato' || val === null || val === undefined) {
      return <span className={styles.missingValue}>non trovato</span>
    }
    if (val === 'da calcolare') {
      return <span className={styles.calcValue}>da calcolare</span>
    }
    const displayVal = isCurrency && typeof val === 'number'
      ? `€${val.toLocaleString('it-IT')} `
      : val;
    return <span className={styles.foundValue}>{displayVal}</span>
  }

  return (
    <main className={styles.dashWrapper}
      onDragEnter={handleFullPageDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleFullPageDragLeave}
      onDrop={handleFullPageDrop}
    >
      {fullPageDragCounter > 0 && (
        <div className={styles.fullPageOverlay}>
          <div className={styles.fullPageOverlayContent}>
            <div className={styles.fullPageDropIcon}>↑</div>
            <h2>Rilascia i PDF ovunque</h2>
            <p>I documenti verranno analizzati automaticamente</p>
          </div>
        </div>
      )}
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
            className={`${styles.dashDropzone} ${dragCounter > 0 ? styles.dragging : ''}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => document.getElementById('file-input')?.click()}
            style={{ position: 'relative' }}
          >
            {dragCounter > 0 && (
              <div className={styles.dragOverlay}>
                <div className={styles.dragOverlayContent}>
                  RILASCIA I DOCUMENTI QUI
                </div>
              </div>
            )}
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
                      <span style={{
                        fontSize: '1.2rem',
                        animation: (file.status === 'uploading' || file.status === 'analyzing') ? 'pulse 1.5s ease-in-out infinite' : 'none'
                      }}>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {/* File counter for active files */}
                      {file.total && file.total > 0 && (
                        <span className={styles.fileCounterBadge}>
                          {file.index || 1}/{file.total}
                        </span>
                      )}
                      <span style={{
                        fontWeight: 600,
                        fontSize: '0.8rem',
                        color: '#64748b'
                      }}>
                        {file.status === 'queued' && 'In attesa'}
                        {file.status === 'uploading' && 'Caricamento'}
                        {file.status === 'analyzing' && 'Analisi AI'}
                        {file.status === 'done' && 'Completato'}
                        {file.status === 'error' && 'Errore'}
                      </span>
                      <span style={{
                        fontWeight: 900,
                        fontSize: '1rem',
                        color: file.status === 'done' ? '#10b981' : file.status === 'error' ? '#ef4444' : '#10b981',
                        minWidth: '45px',
                        textAlign: 'right'
                      }}>
                        {file.progress}%
                      </span>
                    </div>
                  </div>


                  {/* Progress Bar */}
                  <div style={{
                    width: '100%',
                    height: '10px',
                    background: '#e2e8f0',
                    borderRadius: '5px',
                    overflow: 'hidden',
                    position: 'relative'
                  }}>
                    <div style={{
                      width: `${file.progress}% `,
                      height: '100%',
                      background: file.status === 'error' ? '#ef4444' :
                        file.status === 'done' ? '#10b981' :
                          'linear-gradient(90deg, #10b981, #34d399)',
                      borderRadius: '5px',
                      transition: 'width 0.3s ease',
                      position: 'relative',
                      overflow: 'hidden'
                    }}>
                      {/* Animated shine effect */}
                      {(file.status === 'uploading' || file.status === 'analyzing') && (
                        <div style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                          animation: 'shimmer 1.5s infinite'
                        }} />
                      )}
                    </div>
                  </div>

                  {/* CSS animations */}
                  <style>{`
  @keyframes shimmer {
    0 % { transform: translateX(-100 %); }
    100 % { transform: translateX(100 %); }
  }
  @keyframes pulse {
    0 %, 100 % { opacity: 1; }
    50 % { opacity: 0.5; }
  }
  `}</style>

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
            {showTrash ? `Cestino(${trashedAnalyses.length})` : `I tuoi Conti(${bankGroups.length}) e Estratti Conto(${analyses.length})`}
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
            🗑️ {showTrash ? 'Torna alla Dashboard' : `Cestino${trashedAnalyses.length > 0 ? ` (${trashedAnalyses.length})` : ''} `}
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
                            Rendicontazione: <strong>Variabile</strong>
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
                            // Always use 12 slots if there is ANY monthly logic involved
                            const slots = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

                            // Track covered months to skip rendering
                            const coveredMonths = new Set<number>();

                            // Pre-calculate coverage to know what to skip
                            dossier.analyses.forEach(a => {
                              if (a.period_end && a.period_start && new Date(a.period_end).getFullYear() === year) {
                                const start = new Date(a.period_start);
                                const end = new Date(a.period_end);
                                const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
                                if (diff > 45) { // It's quarterly
                                  const endMonth = end.getMonth() + 1; // e.g., 3 for March
                                  // Mark intermediate months as covered (e.g., if ends in March, cover Jan(1) and Feb(2) IF they are within the same year)
                                  // Simplified: Quarterly usually ends 3, 6, 9, 12. Covers (end-2, end-1, end)
                                  coveredMonths.add(endMonth - 1);
                                  coveredMonths.add(endMonth - 2);
                                }
                              }
                            });

                            return (
                              <div key={year} className={styles.yearBlock}>
                                <div className={styles.yearLabelPremium}>{year}</div>
                                <div className={`${styles.slotsRow} ${styles.grid12}`}>
                                  {slots.map(slotIdx => {
                                    // If this slot is covered by a previous quarterly doc, SKIP IT entirely
                                    if (coveredMonths.has(slotIdx)) return null;

                                    // Find if there is a doc ending in this month (Quarterly docs match their END month)
                                    // Modified find logic: check for monthly OR quarterly ending here
                                    const file = dossier.analyses.find(a => {
                                      if (!a.period_end) return false;
                                      const d = new Date(a.period_end);
                                      return d.getFullYear() === year && (d.getMonth() + 1) === slotIdx;
                                    });

                                    const isPresent = !!file;
                                    const dates = getSlotDates(year, slotIdx, 'monthly'); // Always get standard dates first

                                    // OVerwrite label if it's a quarterly doc found
                                    const isQuarterlyDoc = isPresent && file.period_start &&
                                      ((new Date(file.period_end).getTime() - new Date(file.period_start).getTime()) / (1000 * 60 * 60 * 24)) > 45;

                                    let displayLabel = dates.label;
                                    if (isQuarterlyDoc) {
                                      const qNum = Math.ceil(slotIdx / 3);
                                      displayLabel = `Q${qNum}`;
                                    }

                                    return (
                                      <div key={slotIdx}
                                        className={`${styles.tilePremium} ${isPresent ? styles.present : styles.absent}`}
                                        data-has-analysis={isPresent ? 'true' : 'false'}
                                        data-analysis-id={isPresent ? file.id : undefined}
                                        onClick={() => isPresent && router.push(`/analisi/${file.id}`)}>

                                        <div className={styles.tileDates}>
                                          {isPresent && (
                                            <div className={styles.freqBadge}>
                                              {isQuarterlyDoc ? 'TRIMESTRALE' : 'MENSILE'}
                                            </div>
                                          )}
                                          <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>{displayLabel}</div>
                                          {isPresent ? (
                                            <>
                                              {new Date(file.period_start).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })}<br />
                                              <span className={styles.arrowIconSmall}>↓</span>
                                              {new Date(file.period_end).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                            </>
                                          ) : (
                                            <>
                                              {dates.start}<br /><span className={styles.arrowIconSmall}>↓</span>{dates.end}
                                            </>
                                          )}
                                        </div>

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
                            Rendicontazione: <strong>Varabile</strong>
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
                            // Always use 12 slots if there is ANY monthly logic involved
                            const slots = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

                            // Track covered months to skip rendering
                            const coveredMonths = new Set<number>();

                            // Pre-calculate coverage to know what to skip
                            liquidity.analyses.forEach(a => { // USING LIQUIDITY ANALYSES HERE
                              if (a.period_end && a.period_start && new Date(a.period_end).getFullYear() === year) {
                                const start = new Date(a.period_start);
                                const end = new Date(a.period_end);
                                const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
                                if (diff > 45) { // It's quarterly
                                  const endMonth = end.getMonth() + 1;
                                  coveredMonths.add(endMonth - 1);
                                  coveredMonths.add(endMonth - 2);
                                }
                              }
                            });

                            return (
                              <div key={year} className={styles.yearBlock}>
                                <div className={styles.yearLabelPremium}>{year}</div>
                                <div className={`${styles.slotsRow} ${styles.grid12}`}>
                                  {slots.map(slotIdx => {
                                    // If this slot is covered by a previous quarterly doc, SKIP IT entirely
                                    if (coveredMonths.has(slotIdx)) return null;

                                    // Find if there is a doc ending in this month
                                    const file = liquidity.analyses.find(a => {
                                      if (!a.period_end) return false;
                                      const d = new Date(a.period_end);
                                      return d.getFullYear() === year && (d.getMonth() + 1) === slotIdx;
                                    });

                                    const isPresent = !!file;
                                    const dates = getSlotDates(year, slotIdx, 'monthly');

                                    const isQuarterlyDoc = isPresent && file.period_start &&
                                      ((new Date(file.period_end).getTime() - new Date(file.period_start).getTime()) / (1000 * 60 * 60 * 24)) > 45;

                                    let displayLabel = dates.label;
                                    if (isQuarterlyDoc) {
                                      const qNum = Math.ceil(slotIdx / 3);
                                      displayLabel = `Q${qNum}`;
                                    }

                                    return (
                                      <div key={slotIdx}
                                        className={`${styles.tilePremium} ${isPresent ? styles.present : styles.absent}`}
                                        data-has-analysis={isPresent ? 'true' : 'false'}
                                        data-analysis-id={isPresent ? file.id : undefined}
                                        onClick={() => isPresent && router.push(`/analisi/${file.id}`)}>

                                        <div className={styles.tileDates}>
                                          {isPresent && (
                                            <div className={styles.freqBadge}>
                                              {isQuarterlyDoc ? 'TRIMESTRALE' : 'MENSILE'}
                                            </div>
                                          )}
                                          <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>{displayLabel}</div>
                                          {isPresent ? (
                                            <>
                                              {new Date(file.period_start).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })}<br />
                                              <span className={styles.arrowIconSmall}>↓</span>
                                              {new Date(file.period_end).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                            </>
                                          ) : (
                                            <>
                                              {dates.start}<br /><span className={styles.arrowIconSmall}>↓</span>{dates.end}
                                            </>
                                          )}
                                        </div>
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
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>
                  Periodo: {new Date(inspectorData.period_start).toLocaleDateString()} - {new Date(inspectorData.period_end).toLocaleDateString()}
                  {inspectorData.account_type === 'LIQUIDITY' && <span className={styles.accBadge} style={{ marginLeft: '10px' }}>LIQUIDITÀ</span>}
                </p>
              </div>
              <button className={styles.closeBtn} onClick={() => setInspectorData(null)}>×</button>
            </div>
            <div className={styles.modalBody}>

              {inspectorData.account_type === 'LIQUIDITY' && editingValues && (
                <div className={styles.liquiditySection}>
                  <div className={styles.liquidityGrid}>
                    {[
                      { label: 'Saldo iniziale (liquidità):', key: 'initial_balance', type: 'currency' },
                      { label: 'Totale movimenti liquidità:', key: 'total_movements_amount', type: 'currency' },
                      { label: 'Saldo finale (liquidità):', key: 'final_balance', type: 'currency' },
                      { label: 'Movimenti totali:', key: 'total_movements_count', type: 'number' },
                      { label: 'Commissioni Totali:', key: 'total_commissions', type: 'currency', negativeColor: true },
                      { label: 'Proventi titoli:', key: 'total_proventi', type: 'currency', positiveColor: true },
                      { label: 'Movimenti titoli:', key: 'securities_movements_count', type: 'number' },
                      { label: 'Movimenti acquisto titoli:', key: 'securities_purchase_count', type: 'number' },
                      { label: 'Movimenti vendita titoli:', key: 'securities_sale_count', type: 'number' },
                      { label: 'Movimenti titoli:', key: 'securities_net_amount', type: 'currency' },
                      { label: 'Acquisto titoli:', key: 'securities_purchase_amount', type: 'currency', negativeColor: true },
                      { label: 'Vendita titoli:', key: 'securities_sale_amount', type: 'currency', positiveColor: true },
                    ].map((item) => {
                      const entry = editingValues[item.key]
                      const isObj = typeof entry === 'object' && entry !== null && 'value' in entry
                      let val = isObj ? entry.value : entry
                      const source = isObj ? entry.source : null

                      // Special calculation for "Totale movimenti liquidità" -> Final - Initial
                      if (item.key === 'total_movements_amount') {
                        const getVal = (k: string) => {
                          const e = editingValues[k];
                          const v = (typeof e === 'object' && e !== null && 'value' in e) ? e.value : e;
                          return typeof v === 'number' ? v : null;
                        };
                        const ini = getVal('initial_balance');
                        const fin = getVal('final_balance');
                        if (ini !== null && fin !== null) {
                          val = fin - ini;
                        }
                      }

                      // Fallback for old records: balances are "extracted", others are "calculated"
                      const displaySource = source || (['initial_balance', 'final_balance'].includes(item.key) ? 'extracted' : 'calculated')

                      const isModified = editingValues[`${item.key}_is_modified`]
                      const isNotFound = val === 'non trovato' || val === undefined

                      return (
                        <div key={item.key} className={styles.summaryCard}>
                          <div className={styles.labelLine}>
                            <span className={styles.labelText}>
                              {item.label}
                              {isModified && <span className={styles.modifiedBadge}>(Modificato)</span>}
                            </span>
                            {displaySource && (
                              <span className={`${styles.statusBadge} ${displaySource === 'extracted' ? styles.statusExtracted : styles.statusCalculated}`}>
                                {displaySource === 'extracted' ? 'Estratto' : 'Calcolato'}
                              </span>
                            )}
                          </div>
                          <div className={styles.summaryValueContainer}>
                            {isNotFound ? (
                              <span className={styles.missingValue}>non trovato</span>
                            ) : (
                              <input
                                type="text"
                                className={`${styles.summaryInput} ${item.positiveColor && val > 0 ? styles.positiveValue : ''} ${item.negativeColor && val < 0 ? styles.negativeValue : ''}`}
                                value={`${item.type === 'currency' && val > 0 ? '+' : ''}${typeof val === 'number' ? val.toLocaleString('it-IT', { minimumFractionDigits: item.type === 'currency' ? 2 : 0 }) : val}${item.type === 'currency' ? ' €' : ''}`}
                                onChange={(e) => {
                                  const raw = e.target.value.replace('+', '').replace(' €', '').replace('.', '').replace(',', '.')
                                  const num = parseFloat(raw)
                                  handleUpdateValue(item.key, isNaN(num) ? e.target.value : num)
                                }}
                              />
                            )}
                          </div>
                          {isModified && (
                            <button className={styles.restoreBtn} onClick={() => handleRestoreValue(item.key)}>Ripristina</button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className={styles.infoGrid}>
                <div className={styles.infoItem}><strong>Banca</strong> {renderVal(inspectorData.bank_name)}</div>
                <div className={styles.infoItem}><strong>Account</strong> {renderVal(inspectorData.benchmark_comparison)}</div>
                <div className={styles.infoItem}><strong>IBAN</strong> {renderVal(inspectorData.costs_breakdown?.settlementAccount)}</div>
              </div>

              {inspectorData.account_type === 'DOSSIER' && (
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
              )}

              <div className={styles.inspectorSection}>
                <h4>
                  Movimenti del Periodo
                  {inspectorData.account_type === 'LIQUIDITY' && (
                    <span className={`${styles.statusBadge} ${styles.statusExtracted}`} style={{ verticalAlign: 'middle', marginLeft: '12px' }}>
                      Estratto
                    </span>
                  )}
                </h4>
                {inspectorData.account_type === 'LIQUIDITY' ? (
                  <table className={styles.inspectorTable}>
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Descrizione</th>
                        <th>
                          Tipologia movimento
                          <span className={`${styles.statusBadge} ${styles.statusCalculated}`} style={{ marginLeft: '6px' }}>
                            Calcolato
                          </span>
                        </th>
                        <th>Importo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inspectorData.transactions?.map((t: any, i: number) => {
                        const typeClass = styles[`type${t.movement_type || 'Altro'}`] || styles.typeAltro;
                        const amount = t.amount !== undefined ? t.amount : t.exchangeValue;
                        const amountClass = amount < 0 ? styles.amountNegative : (amount > 0 ? styles.amountPositive : '');

                        return (
                          <tr key={i}>
                            <td>{renderVal(t.date)}</td>
                            <td style={{ fontSize: '0.75rem', maxWidth: '300px' }}>{renderVal(t.description || 'N/D')}</td>
                            <td>
                              <span className={`${styles.typeBadge} ${typeClass}`}>
                                {t.movement_type || 'Altro'}
                              </span>
                            </td>
                            <td className={amountClass}>
                              {amount !== undefined ? `€ ${amount.toLocaleString('it-IT', { minimumFractionDigits: 2 })}` : 'N/D'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                ) : (
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
                )}
              </div>

              <div className={styles.inspectorActions}>
                <button className={styles.saveBtn} onClick={handleSaveInspector} disabled={isSaving}>
                  {isSaving ? 'Salvataggio...' : 'Salva Modifiche'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
