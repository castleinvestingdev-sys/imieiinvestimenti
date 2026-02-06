'use client'

import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
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
  initial_value?: number
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
  // Validation flags
  coherenceWarning?: string
}

type AccountGroup = { identifier: string; analyses: Analysis[] };

type BankGroup = {
  bankName: string;
  dossiers: AccountGroup[];
  liquidityAccounts: AccountGroup[];
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className={styles.loadingContainer}><div className={styles.spinner}></div><p>Caricamento...</p></div>}>
      <DashboardContent />
    </Suspense>
  )
}

function DashboardContent() {
  const [user, setUser] = useState<User | null>(null)
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [trashedAnalyses, setTrashedAnalyses] = useState<Analysis[]>([])
  const [showTrash, setShowTrash] = useState(false)
  const [loading, setLoading] = useState(true)
  const [inspectorData, setInspectorData] = useState<Analysis | null>(null)
  const [editingValues, setEditingValues] = useState<any>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [commissionsModalData, setCommissionsModalData] = useState<any>(null)
  const [editingTransactions, setEditingTransactions] = useState<any[]>([])
  const [portfolioTab, setPortfolioTab] = useState<'initial' | 'final' | 'movements'>('final')
  const router = useRouter()
  const searchParams = useSearchParams()
  const clienteFilter = searchParams.get('cliente')
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
    stage?: string; // Detailed stage description
    startTime?: number; // Track upload start time
  }
  const [uploadQueue, setUploadQueue] = useState<UploadingFile[]>([])
  const [isProcessing, setIsProcessing] = useState(false)

  // Confirm modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
  } | null>(null)
  const fileQueueRef = useRef<{ id: string; file: File }[]>([])
  const totalFilesRef = useRef<number>(0)
  const currentFileIndexRef = useRef<number>(0)
  const dropzoneRef = useRef<HTMLDivElement>(null)
  const batchAccumulatorRef = useRef<File[]>([])
  const batchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Synchronization Refs
  const timelineRefs = useRef<Set<HTMLDivElement>>(new Set())
  const isSyncingRef = useRef(false)

  const registerTimeline = useCallback((el: HTMLDivElement | null) => {
    if (el) {
      timelineRefs.current.add(el)
    }
  }, [])

  const handleSyncScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (isSyncingRef.current) return
    isSyncingRef.current = true

    const target = e.currentTarget
    const scrollLeft = target.scrollLeft

    // Use requestAnimationFrame for smoother sync
    requestAnimationFrame(() => {
      timelineRefs.current.forEach(el => {
        if (el !== target && Math.abs(el.scrollLeft - scrollLeft) > 2) {
          // Direct assignment without smooth behavior for immediate sync
          el.scrollLeft = scrollLeft
        }
      })

      // Delay reset to prevent rapid re-triggering
      setTimeout(() => {
        isSyncingRef.current = false
      }, 16) // ~1 frame at 60fps
    })
  }, [])



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

    // Filter by holder if clienteFilter is set
    let filteredData = data || []
    if (clienteFilter) {
      filteredData = filteredData.filter(a =>
        (a.costs_breakdown?.holder || 'Cliente Sconosciuto') === clienteFilter
      )
    }

    // Normalizza numeri conto per raggruppamento: gestisce prefissi filiale variabili
    // es. "3100/1000811", "19812/3100/1000811", "19812/3100/01000811" → "31001000811"
    const normalizeAccKey = (acc: string) => {
      if (!acc) return 'ND';
      const segments = acc.split(/[\/\-]/).map(s => s.replace(/^0+/, '') || '0').filter(s => s.length > 0);
      if (segments.length === 0) return 'ND';
      return segments.slice(-2).join('').toUpperCase() || 'ND';
    };

    // Infer missing period_start from previous documents or period_end
    const inferPeriodStart = (analyses: Analysis[]): Analysis[] => {
      // Group by account (bank + identifier)
      const byAccount = new Map<string, Analysis[]>()
      analyses.forEach(a => {
        const key = `${a.bank_name}|${normalizeAccKey(a.benchmark_comparison || '')}|${a.account_type}`
        const list = byAccount.get(key) || []
        list.push(a)
        byAccount.set(key, list)
      })

      // Process each account group
      byAccount.forEach((accountAnalyses) => {
        // Sort by period_end ascending
        accountAnalyses.sort((a, b) =>
          new Date(a.period_end).getTime() - new Date(b.period_end).getTime()
        )

        // Infer period_start for each document
        for (let i = 0; i < accountAnalyses.length; i++) {
          const current = accountAnalyses[i]
          if (!current.period_start && current.period_end) {
            // Try to use previous document's period_end
            if (i > 0 && accountAnalyses[i - 1].period_end) {
              current.period_start = accountAnalyses[i - 1].period_end
            } else {
              // Infer from period_end - assume it's the last day of previous period
              const endDate = new Date(current.period_end)
              const endDay = endDate.getDate()
              const endMonth = endDate.getMonth()
              const endYear = endDate.getFullYear()

              // If end is near end of month, assume monthly/quarterly period
              if (endDay >= 28) {
                // Get last day of previous month
                const startDate = new Date(endYear, endMonth, 0) // Last day of previous month
                current.period_start = startDate.toISOString().split('T')[0]
              }
            }
          }
        }
      })

      return analyses
    }

    filteredData = inferPeriodStart(filteredData)

    // Validate coherence between consecutive EC (portfolio quantities)
    const validateCoherence = (analyses: Analysis[]): Analysis[] => {
      // Group by account (bank + identifier + type)
      const byAccount = new Map<string, Analysis[]>()
      analyses.forEach(a => {
        const key = `${a.bank_name}|${normalizeAccKey(a.benchmark_comparison || '')}|${a.account_type}`
        const list = byAccount.get(key) || []
        list.push(a)
        byAccount.set(key, list)
      })

      // Validate each account group
      byAccount.forEach((accountAnalyses) => {
        // Sort by period_end ascending
        accountAnalyses.sort((a, b) =>
          new Date(a.period_end).getTime() - new Date(b.period_end).getTime()
        )

        // For each pair of consecutive documents
        for (let i = 1; i < accountAnalyses.length; i++) {
          const prev = accountAnalyses[i - 1]
          const curr = accountAnalyses[i]

          // Only validate DOSSIER accounts with holdings
          if (prev.account_type !== 'DOSSIER' || !prev.holdings?.length) continue

          // Build expected initial holdings from prev.holdings + curr movements
          const prevHoldings = new Map<string, { isin: string; name: string; quantity: number }>()
          prev.holdings?.forEach((h: any) => {
            if (h.isin) {
              prevHoldings.set(h.isin, {
                isin: h.isin,
                name: h.name || h.isin,
                quantity: h.quantity || 0
              })
            }
          })

          // Apply security movements from current period
          const securityMovements = curr.costs_breakdown?.securityMovements || []
          securityMovements.forEach((m: any) => {
            if (!m.isin) return
            const existing = prevHoldings.get(m.isin) || { isin: m.isin, name: m.name || m.isin, quantity: 0 }
            if (m.operationType === 'Acquisto') {
              existing.quantity += (m.quantity || 0)
            } else if (m.operationType === 'Vendita') {
              existing.quantity -= (m.quantity || 0)
            }
            prevHoldings.set(m.isin, existing)
          })

          // Compare with current final holdings
          const warnings: string[] = []
          const currHoldings = new Map<string, number>()
          curr.holdings?.forEach((h: any) => {
            if (h.isin) currHoldings.set(h.isin, h.quantity || 0)
          })

          // Check for discrepancies
          prevHoldings.forEach((expected, isin) => {
            const actualQty = currHoldings.get(isin)
            if (expected.quantity > 0 && actualQty === undefined) {
              warnings.push(`${expected.name}: previsto ${expected.quantity.toFixed(4)} quote, assente nel periodo corrente`)
            } else if (actualQty !== undefined && Math.abs(expected.quantity - actualQty) > 0.001) {
              warnings.push(`${expected.name}: previsto ${expected.quantity.toFixed(4)}, trovato ${actualQty.toFixed(4)}`)
            }
          })

          // Check for new holdings without matching purchase
          currHoldings.forEach((qty, isin) => {
            if (!prevHoldings.has(isin) && qty > 0) {
              const holding = curr.holdings?.find((h: any) => h.isin === isin)
              const hasPurchase = securityMovements.some((m: any) => m.isin === isin && m.operationType === 'Acquisto')
              if (!hasPurchase) {
                warnings.push(`${holding?.name || isin}: nuovo titolo senza acquisto registrato`)
              }
            }
          })

          if (warnings.length > 0) {
            curr.coherenceWarning = `⚠️ Incongruenze con periodo precedente:\n${warnings.join('\n')}`
          }
        }
      })

      return analyses
    }

    filteredData = validateCoherence(filteredData)
    setAnalyses(filteredData)

    const { data: trashedData } = await supabase
      .from('analyses')
      .select('*')
      .eq('user_id', userId)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })

    // Also filter trashed data by holder
    let filteredTrashed = trashedData || []
    if (clienteFilter) {
      filteredTrashed = filteredTrashed.filter(a =>
        (a.costs_breakdown?.holder || 'Cliente Sconosciuto') === clienteFilter
      )
    }
    setTrashedAnalyses(filteredTrashed)
  }, [supabase, clienteFilter])

  // Show custom confirmation modal
  const showConfirmModal = (title: string, message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmModal({
        isOpen: true,
        title,
        message,
        onConfirm: () => {
          setConfirmModal(null)
          resolve(true)
        },
        onCancel: () => {
          setConfirmModal(null)
          resolve(false)
        }
      })
    })
  }

  const handleDelete = async (analysisId: string) => {
    if (!user) return
    const confirmed = await showConfirmModal(
      'Sposta nel cestino',
      'Vuoi spostare questo documento nel cestino?'
    )
    if (!confirmed) return

    // Save scroll positions before delete
    const scrollPositions: { el: HTMLDivElement; left: number }[] = []
    timelineRefs.current.forEach(el => {
      scrollPositions.push({ el, left: el.scrollLeft })
    })
    const mainScrollY = window.scrollY

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

    // Restore scroll positions after re-render
    requestAnimationFrame(() => {
      window.scrollTo(0, mainScrollY)
      scrollPositions.forEach(({ el, left }) => {
        if (el && document.contains(el)) {
          el.scrollLeft = left
        }
      })
    })
  }

  // Delete multiple analyses at once (for section delete)
  const handleDeleteMultiple = async (analysisIds: string[]) => {
    if (!user || analysisIds.length === 0) return

    // Save scroll positions before delete
    const scrollPositions: { el: HTMLDivElement; left: number }[] = []
    timelineRefs.current.forEach(el => {
      scrollPositions.push({ el, left: el.scrollLeft })
    })
    const mainScrollY = window.scrollY

    // Delete all in parallel
    const { error } = await supabase
      .from('analyses')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', analysisIds)

    if (error) {
      console.error('Error deleting multiple:', error)
      alert('Errore durante l\'eliminazione')
      return
    }

    await fetchAnalyses(user.id)

    // Restore scroll positions after re-render
    requestAnimationFrame(() => {
      window.scrollTo(0, mainScrollY)
      scrollPositions.forEach(({ el, left }) => {
        if (el && document.contains(el)) {
          el.scrollLeft = left
        }
      })
    })
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
    const confirmed = await showConfirmModal(
      'Elimina definitivamente',
      'Vuoi eliminare definitivamente questo documento? Questa azione non può essere annullata.'
    )
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

  // Funzione per riclassificare movimenti errati (per dati già nel database)
  const reclassifyMovements = (transactions: any[]) => {
    return transactions.map(t => {
      const desc = t.description?.toLowerCase() || ''
      let newType = t.movement_type

      // Vecchia categoria "Bonifico" -> Altro
      if (newType === 'Bonifico') newType = 'Altro'
      // Vecchia categoria "Spesa" -> Commissioni
      if (newType === 'Spesa') newType = 'Commissioni'

      // PENSIONE INPS, STIPENDIO, ecc. NON sono commissioni -> Altro
      if (newType === 'Commissioni' && (
        desc.includes('pensione') ||
        desc.includes('inps') ||
        desc.includes('stipendio') ||
        desc.includes('emolument') ||
        desc.includes('retribuzione') ||
        desc.includes('affitto') ||
        desc.includes('canone locazione') ||
        desc.includes('premio polizza') ||
        desc.includes('assicurazione') ||
        desc.includes('bolletta') ||
        desc.includes('utenz') ||
        desc.includes('prelievo') ||
        (desc.includes('bonifico') && desc.includes('disposto'))
      )) {
        newType = 'Altro'
      }

      return { ...t, movement_type: newType }
    })
  }

  useEffect(() => {
    if (inspectorData) {
      setEditingValues(JSON.parse(JSON.stringify(inspectorData.costs_breakdown || {})))
      const transactions = JSON.parse(JSON.stringify(inspectorData.transactions || []))
      setEditingTransactions(reclassifyMovements(transactions))
    } else {
      setEditingValues(null)
      setEditingTransactions([])
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
    if (!user || !inspectorData) return
    setIsSaving(true)

    try {
      const { error } = await supabase
        .from('analyses')
        .update({
          transactions: editingTransactions
        })
        .eq('id', inspectorData.id)

      if (error) throw error

      await fetchAnalyses(user.id)
      setInspectorData(prev => prev ? { ...prev, transactions: editingTransactions } : null)
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

    if (!isProcessing && uploadQueue.length === 0) {
      currentFileIndexRef.current = 0
    }

    let lastHolder: string | null = null
    let successCount = 0
    let lastAnalysisId: string | null = null
    const totalFiles = fileQueueRef.current.length
    const isBatch = totalFiles > 1

    while (fileQueueRef.current.length > 0) {
      console.log('Processing next file, remaining:', fileQueueRef.current.length)
      const { id: fileId, file } = fileQueueRef.current.shift()!
      currentFileIndexRef.current++

      setUploadQueue(prev => {
        const currentIndex = currentFileIndexRef.current
        return prev.map(f => {
          const isCurrent = f.id === fileId
          return {
            ...f,
            ...(isCurrent ? {
              status: f.status === 'done' ? f.status : 'uploading' as const,
              progress: f.status === 'done' ? 100 : Math.max(f.progress, 5),
              index: currentIndex
            } : {})
          }
        })
      })

      try {
        const uploadStartTime = Date.now()
        let currentProgress = 5
        const progressInterval = setInterval(() => {
          setUploadQueue(prev => prev.map(f => {
            if (f.id === fileId && (f.status === 'uploading' || f.status === 'analyzing')) {
              const elapsed = Math.floor((Date.now() - uploadStartTime) / 1000)
              const allStages = [
                'Caricamento PDF', 'Conversione documento', 'Invio a Gemini AI',
                'Analisi con AI in corso', 'Estrazione movimenti', 'Lettura portafoglio titoli',
                'Validazione dati', 'Calcolo rendimenti', 'Completamento analisi',
                'Classificazione titoli', 'Verifica portafoglio', 'Calcolo commissioni',
                'Analisi movimenti', 'Normalizzazione dati', 'Controllo coerenza',
                'Estrazione dividendi', 'Verifica saldi', 'Quasi fatto',
                'Ultimi controlli', 'Finalizzazione'
              ]
              const dots = '.'.repeat((elapsed % 3) + 1)
              const stageIdx = Math.min(Math.floor(elapsed / 3), allStages.length - 1)
              const stage = allStages[stageIdx % allStages.length] + dots

              const maxProgress = 97
              const increment = currentProgress < 90
                ? Math.max(0.5, (90 - currentProgress) / 20)
                : 0.15
              currentProgress = Math.min(maxProgress, currentProgress + increment)
              return { ...f, progress: Math.round(currentProgress), stage, startTime: uploadStartTime }
            }
            return f
          }))
        }, 1000)

        setTimeout(() => {
          setUploadQueue(prev => prev.map(f =>
            f.id === fileId ? { ...f, status: 'analyzing' as const, stage: 'Analisi AI avviata...' } : f
          ))
        }, 3000)

        const formData = new FormData()
        formData.append('file', file)
        formData.append('userId', user.id)

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000)

        console.log('Sending request for:', file.name)
        let response: Response
        try {
          response = await fetch('/api/parse-pdf', {
            method: 'POST',
            body: formData,
            signal: controller.signal,
          })
        } finally {
          clearTimeout(timeoutId)
        }
        console.log('Response status:', response.status)

        clearInterval(progressInterval)
        const result = await response.json()

        // Helper: refresh data and scroll to the newly uploaded card in timeline
        const onFileSuccess = async (analysisId?: string, holder?: string) => {
          if (holder) lastHolder = holder
          successCount++
          await fetchAnalyses(user.id)
          if (analysisId) {
            // Wait for React re-render with new data
            setTimeout(() => {
              const card = document.querySelector(`[data-analysis-id="${analysisId}"]`)
              if (card) {
                // Scroll the page vertically to the card's bank group
                const bankBlock = card.closest('[class*="bankGroupBlock"]')
                if (bankBlock) {
                  (bankBlock as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
                // Scroll the timeline scroller horizontally to the card
                const scroller = card.closest('[class*="dualTimelineScroller"]')
                if (scroller) {
                  const scrollerRect = scroller.getBoundingClientRect()
                  const cardRect = card.getBoundingClientRect()
                  const scrollLeft = (scroller as HTMLElement).scrollLeft + cardRect.left - scrollerRect.left - scrollerRect.width / 2 + cardRect.width / 2
                  scroller.scrollTo({ left: scrollLeft, behavior: 'smooth' })
                }
              }
            }, 600)
          }
        }

        if (result.success) {
          setUploadQueue(prev => prev.map(f =>
            f.id === fileId ? { ...f, status: 'done' as const, progress: 100 } : f
          ))
          await onFileSuccess(result.analysisId, result.holder)

        } else if (result.isDuplicate && response.status === 409) {
          clearInterval(progressInterval)

          // Always ask user for confirmation on duplicates
          const shouldProceed = await new Promise<boolean>((resolve) => {
            setConfirmModal({
              isOpen: true,
              title: '⚠️ Periodo Già Caricato',
              message: `${result.message}\n\nVuoi ricalcolare comunque questo periodo? I dati precedenti verranno sostituiti.`,
              onConfirm: () => { setConfirmModal(null); resolve(true) },
              onCancel: () => { setConfirmModal(null); resolve(false) }
            })
          })
          if (shouldProceed) {
            setUploadQueue(prev => prev.map(f =>
              f.id === fileId ? { ...f, status: 'uploading' as const, progress: 5, stage: 'Ricalcolo forzato...' } : f
            ))
            formData.append('force', 'true')
            const retryResponse = await fetch('/api/parse-pdf', { method: 'POST', body: formData })
            const retryResult = await retryResponse.json()
            if (retryResult.success) {
              setUploadQueue(prev => prev.map(f =>
                f.id === fileId ? { ...f, status: 'done' as const, progress: 100 } : f
              ))
              await onFileSuccess(retryResult.analysisId, retryResult.holder)
            } else {
              setUploadQueue(prev => prev.map(f =>
                f.id === fileId ? { ...f, status: 'error' as const, progress: 0, error: retryResult.error } : f
              ))
            }
          } else {
            setUploadQueue(prev => prev.map(f =>
              f.id === fileId ? { ...f, status: 'done' as const, progress: 100, stage: 'Saltato' } : f
            ))
          }
        } else if (result.error?.includes('rate') || result.error?.includes('limit') || result.error?.includes('429')) {
          setUploadQueue(prev => prev.map(f =>
            f.id === fileId ? { ...f, status: 'queued' as const, progress: 0, error: 'Rate limit - riprovo...' } : f
          ))
          fileQueueRef.current.unshift({ id: fileId, file })
          await new Promise(resolve => setTimeout(resolve, 5000))
        } else {
          setUploadQueue(prev => prev.map(f =>
            f.id === fileId ? { ...f, status: 'error' as const, progress: 0, error: result.error } : f
          ))
        }
      } catch (error: any) {
        const errorMsg = error.name === 'AbortError'
          ? 'Timeout: l\'analisi ha superato 5 minuti. Riprova.'
          : (error.message || 'Errore di rete')
        setUploadQueue(prev => prev.map(f =>
          f.id === fileId ? { ...f, status: 'error' as const, progress: 0, error: errorMsg } : f
        ))
      }

      // Wait between files to avoid Gemini rate limiting
      if (fileQueueRef.current.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 3000))
      }
    }

    setIsProcessing(false)

    // --- Batch complete: navigate to holder if different ---
    if (successCount > 0 && lastHolder) {
      if ((clienteFilter && lastHolder !== clienteFilter) || !clienteFilter) {
        router.push(`/dashboard?cliente=${encodeURIComponent(lastHolder)}`)
      }
    }

    // Clear completed files after 5 seconds
    setTimeout(() => {
      setUploadQueue(prev => prev.filter(f => f.status !== 'done'))
    }, 5000)
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

  // Prevent navigation while uploads are in progress
  const hasActiveUploads = uploadQueue.some(f => f.status === 'uploading' || f.status === 'analyzing' || f.status === 'queued') || isProcessing
  useEffect(() => {
    if (!hasActiveUploads) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasActiveUploads])

  // Safe navigation: warns user if uploads are in progress before navigating away
  const safeNavigate = (href: string) => {
    if (hasActiveUploads) {
      showConfirmModal(
        'Upload in corso',
        'Ci sono PDF in fase di caricamento. Se esci ora, il caricamento verrà annullato. Vuoi uscire comunque?'
      ).then((confirmed) => {
        if (confirmed) router.push(href)
      })
    } else {
      router.push(href)
    }
  }

  // DEBUG EFFECT: Log uploadQueue status changes only (not progress updates)
  const prevStatusRef = useRef<string>('')
  useEffect(() => {
    if (uploadQueue.length > 0) {
      const statusKey = uploadQueue.map(f => `${f.name}:${f.status}`).join('|')
      if (statusKey !== prevStatusRef.current) {
        prevStatusRef.current = statusKey
        console.log('[DEBUG-STATE] UploadQueue:', uploadQueue.map(f => `${f.name} (${f.status})`))
      }
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
  // Normalizza numeri conto: split per "/" o "-", strip zeri iniziali per segmento,
  // prendi gli ultimi 2 segmenti. Gestisce prefissi filiale (es. "19812/3100/1000811" → "31001000811")
  const normalizeAcc = (acc: string) => {
    if (!acc) return 'ND';
    const segments = acc.split(/[\/\-]/).map(s => s.replace(/^0+/, '') || '0').filter(s => s.length > 0);
    if (segments.length === 0) return 'ND';
    const core = segments.slice(-2);
    return core.join('').toUpperCase() || 'ND';
  };

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

  // --- 5. Merge gruppi con stesso intestatario + stessa banca canonica ---
  const KNOWN_BANKS = [
    'Intesa Sanpaolo', 'UniCredit', 'Banco BPM', 'BPER Banca', 'Monte dei Paschi di Siena',
    'Crédit Agricole Italia', 'Cariparma', 'Friuladria', 'BNL', 'Credem', 'Banca Mediolanum',
    'FinecoBank', 'Banca Generali', 'Azimut', 'CheBanca!', 'Mediobanca Premier', 'Banca Sella',
    'Banca Popolare di Sondrio', 'Banco di Desio', 'Banca di Asti', 'Banca Passadore',
    'Cassa di Risparmio di Bolzano', 'Volksbank Alto Adige', 'Banca del Piemonte', 'Banca Carige',
    'Banca Ifis', 'Illimity Bank', 'Banca Progetto', 'Banca CF+', 'Banca Sistema',
    'Banca Valsabbina', 'Cassa Centrale Banca', 'Raiffeisen', 'Cassa Rurale', 'BCC',
    'Iccrea Banca', 'Deutsche Bank Italia', 'Deutsche Bank', 'ING Italia', 'ING', 'N26', 'Revolut',
    'Widiba', 'Webank', 'Buddybank', 'BBVA Italia', 'Santander Consumer Bank',
    'Banca Aletti', 'Banca Euromobiliare', 'Fideuram', 'Sanpaolo Invest', 'IW Bank'
  ];
  // Mappa alias → canonico (es. Cariparma → Crédit Agricole Italia)
  const BANK_ALIASES: Record<string, string> = {
    'Cariparma': 'Crédit Agricole Italia', 'Friuladria': 'Crédit Agricole Italia',
    'Mediobanca Premier': 'CheBanca!', 'Deutsche Bank': 'Deutsche Bank Italia',
    'ING': 'ING Italia', 'Banca Carige': 'BPER Banca',
  };
  const canonicalizeBankName = (name: string): string => {
    const key = getBankKey(name);
    for (const known of KNOWN_BANKS) {
      const knownKey = getBankKey(known);
      if (key === knownKey || key.includes(knownKey) || knownKey.includes(key)) {
        return BANK_ALIASES[known] || known;
      }
    }
    return name;
  };
  const getGroupHolder = (group: BankGroup): string => {
    const all = [...group.dossiers.flatMap(d => d.analyses), ...group.liquidityAccounts.flatMap(l => l.analyses)];
    const counts: Record<string, number> = {};
    all.forEach(a => {
      const h = (a.costs_breakdown?.holder || '').trim().toUpperCase();
      if (h) counts[h] = (counts[h] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  };
  const mergedMap: Record<string, BankGroup> = {};
  Object.values(bankGroupsMap).forEach(group => {
    const holder = getGroupHolder(group);
    const canonical = canonicalizeBankName(group.bankName);
    const mergeKey = holder ? `${holder}|||${canonical.toUpperCase()}` : group.bankName;
    if (!mergedMap[mergeKey]) {
      mergedMap[mergeKey] = { ...group };
    } else {
      const existing = mergedMap[mergeKey];
      group.dossiers.forEach(d => {
        const match = existing.dossiers.find(ed => normalizeAcc(ed.identifier) === normalizeAcc(d.identifier));
        if (match) { match.analyses.push(...d.analyses); } else { existing.dossiers.push(d); }
      });
      group.liquidityAccounts.forEach(l => {
        const match = existing.liquidityAccounts.find(el => normalizeAcc(el.identifier) === normalizeAcc(l.identifier));
        if (match) { match.analyses.push(...l.analyses); } else { existing.liquidityAccounts.push(l); }
      });
    }
  });
  const bankGroups = Object.values(mergedMap);

  // --- 6. Mappa coerenza portafoglio: id → boolean (true = quadra, false = non quadra, undefined = nessun periodo precedente) ---
  const coherenceMap: Record<string, boolean | 'missing'> = {}
  analyses.filter(a => a.account_type === 'DOSSIER').forEach(doc => {
    const normAcc = normalizeAcc(doc.benchmark_comparison || '')
    if (!doc.period_start || !doc.period_end) return
    // Se il conto non è identificabile, non possiamo verificare la coerenza
    if (normAcc === 'ND') { coherenceMap[doc.id] = 'missing'; return }
    const docStart = new Date(doc.period_start)
    const docEnd = new Date(doc.period_end)
    const docDays = (docEnd.getTime() - docStart.getTime()) / 86400000
    // Trova il documento immediatamente precedente (stesso conto)
    const prevDoc = analyses
      .filter(a => a.id !== doc.id && a.account_type === 'DOSSIER'
        && normalizeAcc(a.benchmark_comparison || '') === normAcc
        && a.period_end && a.period_start
        && new Date(a.period_end) <= docStart)
      .sort((a, b) => new Date(b.period_end).getTime() - new Date(a.period_end).getTime())[0]
    if (!prevDoc) { coherenceMap[doc.id] = 'missing'; return }
    // Verifica che il periodo precedente sia contiguo (gap max 5 giorni tra fine prev e inizio doc)
    const prevEnd = new Date(prevDoc.period_end!)
    const gapDays = (docStart.getTime() - prevEnd.getTime()) / 86400000
    if (gapDays > 5) { coherenceMap[doc.id] = 'missing'; return }
    // Verifica basata sui trimestri: prevDoc deve essere dal trimestre immediatamente precedente
    // (es. Q4 deve avere predecessore Q3, non Q2 — anche se le date sembrano contigue)
    const getQuarter = (d: Date) => ({ q: Math.floor(d.getMonth() / 3), y: d.getFullYear() })
    const docQ = getQuarter(docEnd)
    const prevQ = getQuarter(prevEnd)
    const expPrevQ = docQ.q === 0 ? 3 : docQ.q - 1
    const expPrevY = docQ.q === 0 ? docQ.y - 1 : docQ.y
    // Per documenti mensili (< 45gg) verifica il mese precedente
    if (docDays < 45) {
      const expPrevM = docEnd.getMonth() === 0 ? 11 : docEnd.getMonth() - 1
      const expPrevMY = docEnd.getMonth() === 0 ? docEnd.getFullYear() - 1 : docEnd.getFullYear()
      if (prevEnd.getMonth() !== expPrevM || prevEnd.getFullYear() !== expPrevMY) {
        coherenceMap[doc.id] = 'missing'; return
      }
    } else if (prevQ.q !== expPrevQ || prevQ.y !== expPrevY) {
      // Per trimestrali/semestrali: prevDoc deve finire nel trimestre precedente
      coherenceMap[doc.id] = 'missing'; return
    }
    const prevH: Record<string, number> = {}
    ;(prevDoc.holdings || []).forEach((h: any) => { prevH[h.isin || 'X'] = h.quantity || 0 })
    const movD: Record<string, { b: number; s: number }> = {}
    ;(doc.costs_breakdown?.securityMovements || []).forEach((m: any) => {
      const isin = m.isin || 'X'
      if (!movD[isin]) movD[isin] = { b: 0, s: 0 }
      if (m.operationType === 'Acquisto') movD[isin].b += m.quantity || 0
      else if (m.operationType === 'Vendita') movD[isin].s += m.quantity || 0
    })
    const calcInit: Record<string, number> = {}
    ;(doc.holdings || []).forEach((h: any) => {
      const isin = h.isin || 'X'
      const d = movD[isin] || { b: 0, s: 0 }
      calcInit[isin] = (h.quantity || 0) - d.b + d.s
    })
    Object.entries(movD).forEach(([isin, d]) => {
      if (!(isin in calcInit)) { const q = 0 - d.b + d.s; if (q !== 0) calcInit[isin] = q }
    })
    const allIsins = new Set([...Object.keys(prevH), ...Object.keys(calcInit)])
    let ok = true
    allIsins.forEach(isin => {
      if (Math.abs((calcInit[isin] || 0) - (prevH[isin] || 0)) >= 0.0001) ok = false
    })
    coherenceMap[doc.id] = ok
  })

  const allYears = analyses.map(a => a.period_end ? new Date(a.period_end).getFullYear() : null).filter(Boolean) as number[]
  const minYear = allYears.length > 0 ? Math.min(...allYears) : new Date().getFullYear() - 1
  const currentYear = new Date().getFullYear()
  const years: number[] = []
  for (let y = minYear; y <= currentYear; y++) years.push(y)

  const quarters = ['Q1', 'Q2', 'Q3', 'Q4']

  // Determine if a document is monthly (< 45 days) or quarterly/longer
  const isDocMonthly = (a: Analysis) => {
    if (!a.period_start || !a.period_end) return false;
    const start = new Date(a.period_start);
    const end = new Date(a.period_end);
    const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays < 45;
  };

  // Build a frequency map for the year: for each month, determine expected frequency
  const buildYearFrequencyMap = (accountAnalyses: Analysis[], year: number): ('monthly' | 'quarterly')[] => {
    // Array of 12 months, default to 'quarterly'
    const freqMap: ('monthly' | 'quarterly')[] = Array(12).fill('quarterly');

    // Get all documents for this year, sorted by end date
    const yearDocs = accountAnalyses
      .filter(a => a.period_end && new Date(a.period_end).getFullYear() === year)
      .sort((a, b) => new Date(a.period_end).getTime() - new Date(b.period_end).getTime());

    let currentFreq: 'monthly' | 'quarterly' = 'quarterly';
    let lastDocEndMonth = 0;

    yearDocs.forEach(doc => {
      const endMonth = new Date(doc.period_end).getMonth(); // 0-11
      const docIsMonthly = isDocMonthly(doc);

      // Fill from last document end to this document end with current frequency
      for (let m = lastDocEndMonth; m < endMonth; m++) {
        freqMap[m] = currentFreq;
      }

      // This document's month uses its own frequency
      freqMap[endMonth] = docIsMonthly ? 'monthly' : 'quarterly';

      // Update current frequency for future months
      currentFreq = docIsMonthly ? 'monthly' : 'quarterly';
      lastDocEndMonth = endMonth + 1;
    });

    // Fill remaining months with current frequency
    for (let m = lastDocEndMonth; m < 12; m++) {
      freqMap[m] = currentFreq;
    }

    return freqMap;
  };

  // Build the slots to render based on frequency map
  const buildYearSlots = (freqMap: ('monthly' | 'quarterly')[], accountAnalyses: Analysis[], year: number) => {
    const slots: { type: 'monthly' | 'quarterly'; month: number; quarter?: number; file?: Analysis }[] = [];
    let m = 0;

    while (m < 12) {
      const freq = freqMap[m];

      if (freq === 'quarterly') {
        // Find which quarter this month belongs to
        const quarter = Math.floor(m / 3) + 1; // 1-4
        const quarterStartMonth = (quarter - 1) * 3; // 0, 3, 6, 9
        const quarterEndMonth = quarter * 3 - 1; // 2, 5, 8, 11 (0-indexed)

        // Check if ANY month in this quarter is 'monthly' - if so, render entire quarter as monthly
        const hasMonthlyInQuarter = freqMap.slice(quarterStartMonth, quarterEndMonth + 1).includes('monthly');

        if (hasMonthlyInQuarter) {
          // Process this quarter month by month
          while (m <= quarterEndMonth) {
            const file = accountAnalyses.find(a => {
              if (!a.period_end) return false;
              const d = new Date(a.period_end);
              return d.getFullYear() === year && d.getMonth() === m;
            });
            slots.push({ type: 'monthly', month: m, file });
            m++;
          }
        } else {
          // All months in quarter are quarterly - create single quarterly slot
          const file = accountAnalyses.find(a => {
            if (!a.period_end) return false;
            const d = new Date(a.period_end);
            const docMonth = d.getMonth();
            const docYear = d.getFullYear();
            return docYear === year && docMonth >= quarterStartMonth && docMonth <= quarterEndMonth;
          });

          slots.push({ type: 'quarterly', month: quarterEndMonth, quarter, file });

          // Skip to next quarter
          m = quarterEndMonth + 1;
        }
      } else {
        // Monthly slot
        const file = accountAnalyses.find(a => {
          if (!a.period_end) return false;
          const d = new Date(a.period_end);
          return d.getFullYear() === year && d.getMonth() === m;
        });

        slots.push({ type: 'monthly', month: m, file });
        m++;
      }
    }

    return slots;
  };

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
      // Start: last day of previous month, End: last day of current month
      const startDate = new Date(year, slotIndex - 1, 0); // Last day of previous month
      const endDate = new Date(year, slotIndex, 0);       // Last day of current month
      const labelDate = new Date(year, slotIndex - 1, 1); // For getting month name
      return { start: fmt(startDate), end: fmt(endDate), label: labelDate.toLocaleString('it-IT', { month: 'short' }).toUpperCase() };
    } else {
      // Quarterly: Start from last day of previous quarter
      const endMonth = slotIndex * 3;       // e.g., Q4 = month 12
      const startMonth = endMonth - 2;      // e.g., Q4 starts month 10
      const startDate = new Date(year, startMonth - 1, 0); // Last day before quarter starts (e.g., Sep 30 for Q4)
      const endDate = new Date(year, endMonth, 0);         // Last day of quarter (e.g., Dec 31 for Q4)
      return { start: fmt(startDate), end: fmt(endDate), label: `Q${slotIndex}` };
    }
  }


  // Helper function to format currency with Italian locale (dot for thousands, comma for decimals)
  const formatCurrency = (val: number): string => {
    return new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val)
  }

  const renderVal = (val: any, isCurrency = false) => {
    if (val === 'non trovato' || val === null || val === undefined) {
      return <span className={styles.missingValue}>non trovato</span>
    }
    if (val === 'da calcolare') {
      return <span className={styles.calcValue}>da calcolare</span>
    }
    let displayVal = val;
    if (typeof val === 'number') {
      displayVal = isCurrency
        ? `€${formatCurrency(val)}`
        : val.toLocaleString('it-IT');
    }
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

      {/* Client Header when viewing a specific client */}
      {clienteFilter && (
        <div className={styles.clientHeader}>
          <a
            href="/consulente"
            className={styles.backToConsulente}
            onClick={(e) => {
              e.preventDefault()
              safeNavigate('/consulente')
            }}
          >
            ← Torna ai Clienti
          </a>
          <h2 className={styles.clientName}>Cliente: {clienteFilter}</h2>
        </div>
      )}

      <header className={`${styles.dashHero} ${clienteFilter ? styles.withClientHeader : ''}`}>
        <div className={styles.dashHeroInner}>
          <div className={styles.dashWelcome}>
            <h1>{clienteFilter ? `Portafoglio di ${clienteFilter}` : 'I Tuoi Investimenti Semplificati'}</h1>
            <p>
              Carica i PDF &quot;Estratto Conto&quot; originali per analizzare il tuo portafoglio.
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
                        color: '#64748b',
                        maxWidth: '200px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {file.status === 'queued' && 'In attesa'}
                        {file.status === 'uploading' && (file.stage || 'Caricamento')}
                        {file.status === 'analyzing' && (file.stage || 'Analisi AI')}
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button
                      className={styles.btnDeleteBank}
                      onClick={async () => {
                        const allIds = [
                          ...group.dossiers.flatMap(d => d.analyses.map(a => a.id)),
                          ...group.liquidityAccounts.flatMap(l => l.analyses.map(a => a.id))
                        ]
                        const confirmed = await showConfirmModal(
                          `Elimina ${group.bankName}`,
                          `Vuoi spostare nel cestino tutti i ${allIds.length} documenti di ${group.bankName}?`
                        )
                        if (!confirmed) return
                        handleDeleteMultiple(allIds)
                      }}
                    >🗑️</button>
                    <a
                      href={`/analisi/${(group.dossiers[0]?.analyses[0] || group.liquidityAccounts[0]?.analyses[0])?.id}`}
                      className={styles.btnAnalysisPremium}
                      onClick={(e) => {
                        e.preventDefault()
                        safeNavigate(`/analisi/${(group.dossiers[0]?.analyses[0] || group.liquidityAccounts[0]?.analyses[0])?.id}`)
                      }}
                    >
                      VEDI ANALISI <span>→</span>
                    </a>
                  </div>
                </div>

                {/* Dual Timeline - compact layout like analysis page */}
                <div className={styles.dualTimeline}>
                  {/* Fixed labels column */}
                  <div className={styles.dualTimelineLabels}>
                    <span className={styles.dualYearSpacer}>&nbsp;</span>
                    {group.dossiers.map((dossier, dIdx) => (
                      <div key={`dos-label-${dIdx}`} className={styles.dualLabelRow}>
                        <div className={styles.dualLabelInfo}>
                          <span className={styles.dualBadgeDos}>Dossier Titoli</span>
                          {group.dossiers.length > 1 && <span className={styles.dualAccNum}>{dossier.identifier}</span>}
                        </div>
                        <button
                          className={styles.dualDeleteBtn}
                          title={`Elimina tutti i ${dossier.analyses.length} documenti del Dossier ${dossier.identifier}`}
                          onClick={async () => {
                            const confirmed = await showConfirmModal(
                              'Elimina sezione Dossier',
                              `Vuoi spostare nel cestino tutti i ${dossier.analyses.length} documenti del Dossier ${dossier.identifier}?`
                            );
                            if (!confirmed) return;
                            handleDeleteMultiple(dossier.analyses.map(a => a.id));
                          }}
                        >🗑️</button>
                      </div>
                    ))}
                    {group.liquidityAccounts.map((liq, lIdx) => (
                      <div key={`liq-label-${lIdx}`} className={styles.dualLabelRow}>
                        <div className={styles.dualLabelInfo}>
                          <span className={styles.dualBadgeLiq}>Liquidit&agrave;</span>
                          {group.liquidityAccounts.length > 1 && <span className={styles.dualAccNum}>{liq.identifier}</span>}
                        </div>
                        <button
                          className={styles.dualDeleteBtn}
                          title={`Elimina tutti i ${liq.analyses.length} documenti del Conto ${liq.identifier}`}
                          onClick={async () => {
                            const confirmed = await showConfirmModal(
                              'Elimina sezione Liquidità',
                              `Vuoi spostare nel cestino tutti i ${liq.analyses.length} documenti del Conto ${liq.identifier}?`
                            );
                            if (!confirmed) return;
                            handleDeleteMultiple(liq.analyses.map(a => a.id));
                          }}
                        >🗑️</button>
                      </div>
                    ))}
                  </div>

                  {/* Scrollable timeline area */}
                  <div className={styles.dualTimelineScroller} ref={registerTimeline} onScroll={handleSyncScroll}>
                    {years.map(year => (
                      <div key={year} className={styles.dualYearGroup}>
                        <span className={styles.dualYearLabel}>{year}</span>
                        {/* One row per dossier account */}
                        {group.dossiers.map((dossier, dIdx) => {
                          const freqMap = buildYearFrequencyMap(dossier.analyses, year)
                          const slots = buildYearSlots(freqMap, dossier.analyses, year)
                          return (
                            <div key={`dos-${dIdx}`} className={styles.dualYearCards}>
                              {slots.map((slot, idx) => {
                                const isPresent = !!slot.file
                                const isMonthly = slot.type === 'monthly'
                                const prevSlotWithFile = slots.slice(0, idx).reverse().find(s => s.file)
                                const coh = isPresent ? coherenceMap[slot.file!.id] : undefined
                                let displayLabel: string
                                let dates: { start: string; end: string }
                                if (isMonthly) {
                                  const mn = ['GEN','FEB','MAR','APR','MAG','GIU','LUG','AGO','SET','OTT','NOV','DIC']
                                  displayLabel = mn[slot.month]
                                  dates = getSlotDates(year, slot.month + 1, 'monthly')
                                } else {
                                  displayLabel = `Q${slot.quarter}`
                                  dates = getSlotDates(year, slot.quarter!, 'quarterly')
                                }
                                if (isPresent && slot.file!.period_start && slot.file!.period_end) {
                                  const docEnd = new Date(slot.file!.period_end)
                                  const docDays = (docEnd.getTime() - new Date(slot.file!.period_start).getTime()) / 86400000
                                  const mn2 = ['GEN','FEB','MAR','APR','MAG','GIU','LUG','AGO','SET','OTT','NOV','DIC']
                                  if (docDays < 45 && !isMonthly) { displayLabel = mn2[docEnd.getMonth()]; dates = getSlotDates(year, docEnd.getMonth() + 1, 'monthly') }
                                  else if (docDays >= 45 && isMonthly) { const q = Math.ceil((docEnd.getMonth()+1)/3); displayLabel = `Q${q}`; dates = getSlotDates(year, q, 'quarterly') }
                                }
                                const startDateDisplay = isPresent && prevSlotWithFile?.file?.period_end
                                  ? new Date(prevSlotWithFile.file.period_end).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
                                  : (isPresent && slot.file!.period_start ? new Date(slot.file!.period_start).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : dates.start)
                                return (
                                  <div key={idx}
                                    data-analysis-id={isPresent ? slot.file!.id : undefined}
                                    className={`${styles.dualCard} ${!isMonthly ? styles.dualCardQ : ''} ${isPresent ? styles.dualCardLoaded : styles.dualCardEmpty}`}
                                    style={coh === false ? { borderColor: '#ef4444', borderWidth: '2px' } : coh === 'missing' ? { borderColor: '#f59e0b', borderWidth: '2px' } : undefined}
                                    onClick={() => isPresent && safeNavigate(`/analisi/${slot.file!.id}`)}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <span className={styles.dualCardType}>{displayLabel}</span>
                                      {coh === true && <span title="Portafoglio iniziale verificato" style={{ fontSize: '0.55rem' }}>✅</span>}
                                      {coh === false && <span title="Portafoglio iniziale non quadra" style={{ fontSize: '0.55rem' }}>❌</span>}
                                      {coh === 'missing' && <span title="Portafoglio iniziale assente" style={{ fontSize: '0.55rem' }}>⚠️</span>}
                                    </div>
                                    <div className={styles.dualCardDates}>
                                      <span>{startDateDisplay || dates.start}</span>
                                      <span className={styles.dualCardArrow}>&darr;</span>
                                      <span>{isPresent ? new Date(slot.file!.period_end).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : dates.end}</span>
                                    </div>
                                    {isPresent ? (
                                      <div className={styles.dualCardBottom}>
                                        <span className={styles.dualCardValue}>€{formatCurrency(slot.file!.portfolio_value || 0)}</span>
                                        <div className={styles.dualCardActions}>
                                          <button className={styles.dualCardBtn} onClick={(e) => { e.stopPropagation(); setInspectorData(slot.file!); }}>🔍</button>
                                          <button className={styles.dualCardBtn} onClick={(e) => { e.stopPropagation(); handleDelete(slot.file!.id); }}>🗑️</button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className={styles.dualCardUpload} onClick={(e) => { e.stopPropagation(); document.getElementById('file-input')?.click(); }}>+</div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })}
                        {/* One row per liquidity account */}
                        {group.liquidityAccounts.map((liq, lIdx) => {
                          const freqMap = buildYearFrequencyMap(liq.analyses, year)
                          const slots = buildYearSlots(freqMap, liq.analyses, year)
                          return (
                            <div key={`liq-${lIdx}`} className={styles.dualYearCards}>
                              {slots.map((slot, idx) => {
                                const isPresent = !!slot.file
                                const isMonthly = slot.type === 'monthly'
                                const prevSlotWithFile = slots.slice(0, idx).reverse().find(s => s.file)
                                let displayLabel: string
                                let dates: { start: string; end: string }
                                if (isMonthly) {
                                  const mn = ['GEN','FEB','MAR','APR','MAG','GIU','LUG','AGO','SET','OTT','NOV','DIC']
                                  displayLabel = mn[slot.month]
                                  dates = getSlotDates(year, slot.month + 1, 'monthly')
                                } else {
                                  displayLabel = `Q${slot.quarter}`
                                  dates = getSlotDates(year, slot.quarter!, 'quarterly')
                                }
                                if (isPresent && slot.file!.period_start && slot.file!.period_end) {
                                  const docEnd = new Date(slot.file!.period_end)
                                  const docDays = (docEnd.getTime() - new Date(slot.file!.period_start).getTime()) / 86400000
                                  const mn2 = ['GEN','FEB','MAR','APR','MAG','GIU','LUG','AGO','SET','OTT','NOV','DIC']
                                  if (docDays < 45 && !isMonthly) { displayLabel = mn2[docEnd.getMonth()]; dates = getSlotDates(year, docEnd.getMonth() + 1, 'monthly') }
                                  else if (docDays >= 45 && isMonthly) { const q = Math.ceil((docEnd.getMonth()+1)/3); displayLabel = `Q${q}`; dates = getSlotDates(year, q, 'quarterly') }
                                }
                                const startDateDisplay = isPresent && prevSlotWithFile?.file?.period_end
                                  ? new Date(prevSlotWithFile.file.period_end).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
                                  : (isPresent && slot.file!.period_start ? new Date(slot.file!.period_start).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : dates.start)
                                return (
                                  <div key={idx}
                                    data-analysis-id={isPresent ? slot.file!.id : undefined}
                                    className={`${styles.dualCard} ${!isMonthly ? styles.dualCardQ : ''} ${isPresent ? styles.dualCardLoaded : styles.dualCardEmpty}`}
                                    onClick={() => isPresent && safeNavigate(`/analisi/${slot.file!.id}`)}>
                                    <span className={styles.dualCardType}>{displayLabel}</span>
                                    <div className={styles.dualCardDates}>
                                      <span>{startDateDisplay || dates.start}</span>
                                      <span className={styles.dualCardArrow}>&darr;</span>
                                      <span>{isPresent ? new Date(slot.file!.period_end).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : dates.end}</span>
                                    </div>
                                    {isPresent ? (
                                      <div className={styles.dualCardBottom}>
                                        <span className={styles.dualCardValue}>€{formatCurrency(slot.file!.portfolio_value || 0)}</span>
                                        <div className={styles.dualCardActions}>
                                          <button className={styles.dualCardBtn} onClick={(e) => { e.stopPropagation(); setInspectorData(slot.file!); }}>🔍</button>
                                          <button className={styles.dualCardBtn} onClick={(e) => { e.stopPropagation(); handleDelete(slot.file!.id); }}>🗑️</button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className={styles.dualCardUpload} onClick={(e) => { e.stopPropagation(); document.getElementById('file-input')?.click(); }}>+</div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
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
                      // Replaced 'Movimenti totali' with calculated sum verification
                      { label: 'Sommatoria Movimenti:', key: 'calculated_transactions_sum', type: 'currency', isVerification: true },
                      { label: 'Commissioni Totali:', key: 'total_commissions', type: 'currency', negativeColor: true },
                      { label: 'Proventi titoli:', key: 'total_proventi', type: 'currency', positiveColor: true },
                      { label: 'Movimenti titoli:', key: 'securities_movements_count', type: 'number' },
                      { label: 'Movimenti acquisto titoli:', key: 'securities_purchase_count', type: 'number' },
                      { label: 'Movimenti vendita titoli:', key: 'securities_sale_count', type: 'number' },
                      { label: 'Movimenti titoli:', key: 'securities_net_amount', type: 'currency' },
                      { label: 'Acquisto titoli:', key: 'securities_purchase_amount', type: 'currency', negativeColor: true },
                      { label: 'Vendita titoli:', key: 'securities_sale_amount', type: 'currency', positiveColor: true },
                      // Dati Scalari (Competenze)
                      { label: 'Numeri Creditori:', key: 'scalar_data.numeri_creditori', type: 'number', isScalar: true },
                      { label: 'Numeri Debitori:', key: 'scalar_data.numeri_debitori', type: 'number', isScalar: true },
                      { label: 'Interessi Attivi Lordi:', key: 'scalar_data.interessi_attivi_lordi', type: 'currency', isScalar: true, positiveColor: true },
                      { label: 'Interessi Passivi Lordi:', key: 'scalar_data.interessi_passivi_lordi', type: 'currency', isScalar: true, negativeColor: true },
                      { label: 'Tasso Attivo:', key: 'scalar_data.tasso_attivo', type: 'text', isScalar: true },
                      { label: 'Tasso Passivo:', key: 'scalar_data.tasso_passivo', type: 'text', isScalar: true },
                    ].map((item) => {
                      // Calculate "Totale movimenti liquidità" (Final - Initial)
                      let balanceDelta = null;
                      const getVal = (k: string) => {
                        const e = editingValues[k];
                        const v = (typeof e === 'object' && e !== null && 'value' in e) ? e.value : e;
                        return typeof v === 'number' ? v : null;
                      };
                      const ini = getVal('initial_balance');
                      const fin = getVal('final_balance');
                      if (ini !== null && fin !== null) balanceDelta = fin - ini;

                      let val: any;
                      let displaySource: string | null = null;
                      let isVerification = item.isVerification || false;
                      let verificationStatus = 'neutral'; // neutral, ok, error
                      let transactionCount = 0;

                      if (item.key === 'total_movements_amount') {
                        // This is the Reference Value (Final - Initial)
                        if (balanceDelta !== null) val = balanceDelta;
                        else val = editingValues[item.key]?.value ?? editingValues[item.key];
                        displaySource = 'calculated';
                      } else if (item.key === 'calculated_transactions_sum') {
                        // This is the Checked Value (Sum of rows)
                        const txs = inspectorData.transactions || [];
                        const sumTxs = txs.reduce((acc: number, t: any) => {
                          // Exclude metadata rows if they exist
                          const desc = (t.description || '').toLowerCase();
                          if (desc.includes('saldo iniziale') || desc.includes('saldo finale')) return acc;
                          transactionCount++;
                          return acc + (t.amount || 0);
                        }, 0);
                        val = sumTxs;
                        displaySource = 'calculated';

                        // Compare with Balance Delta
                        if (balanceDelta !== null) {
                          const diff = Math.abs(sumTxs - balanceDelta);
                          if (diff < 0.01) verificationStatus = 'ok';
                          else verificationStatus = 'error';
                        }
                      } else if (item.key.startsWith('scalar_data.')) {
                        // Scalar data fields (nested in costs_breakdown.scalar_data)
                        const scalarKey = item.key.replace('scalar_data.', '')
                        const scalarData = editingValues.scalar_data || {}
                        val = scalarData[scalarKey]
                        displaySource = 'extracted'
                      } else if (item.key === 'total_commissions') {
                        // Calculate from RECLASSIFIED movements (editingTransactions)
                        // This includes bolli and imposte that are now under "Commissioni"
                        const commissioniSum = Math.abs(editingTransactions
                          .filter((m: any) => m.movement_type === 'Commissioni')
                          .reduce((sum: number, m: any) => sum + (m.amount || 0), 0));
                        val = -commissioniSum; // Negativo: le commissioni sono costi
                        displaySource = 'calculated';
                      } else {
                        // Standard fields
                        const entry = editingValues[item.key]
                        const isObj = typeof entry === 'object' && entry !== null && 'value' in entry
                        val = isObj ? entry.value : entry
                        displaySource = isObj ? entry.source : null
                        if (!displaySource && ['initial_balance', 'final_balance'].includes(item.key)) displaySource = 'extracted';
                        if (!displaySource) displaySource = 'calculated';
                      }

                      const isModified = editingValues[`${item.key}_is_modified`]
                      const isScalar = (item as any).isScalar || false
                      const isNotFound = (val === 'non trovato' || val === undefined || val === null || val === 'assenti' || val === 0) && !isVerification && !isScalar
                      const scalarNotFound = isScalar && (val === undefined || val === null || val === 'assenti' || val === 0 || val === '0%')

                      const formulaMap: Record<string, string> = {
                        'total_movements_amount': 'Saldo finale - Saldo iniziale',
                        'calculated_transactions_sum': 'Somma algebrica di tutte le righe estratte',
                        'total_commissions': 'Somma di tutte le commissioni rilevate',
                        'total_proventi': 'Somma di cedole e dividendi',
                        'securities_net_amount': 'Vendite titoli - Acquisti titoli'
                      };
                      const formula = formulaMap[item.key] || 'Valore calcolato automaticamente dal sistema';

                      const isCommissionsField = item.key === 'total_commissions'

                      return (
                        <div key={item.key} className={styles.summaryCard}
                          style={{
                            ...(isVerification ? { border: verificationStatus === 'error' ? '2px solid #ef4444' : (verificationStatus === 'ok' ? '2px solid #22c55e' : undefined) } : undefined),
                            ...(isCommissionsField ? { cursor: 'pointer' } : {})
                          }}
                          onClick={isCommissionsField ? () => {
                            // Open commissions detail modal - use RECLASSIFIED transactions
                            const transactions = editingTransactions
                            const periodEndStr = inspectorData.period_end || ''
                            const periodYear = periodEndStr ? parseInt(periodEndStr.split(/[-/]/).find((p: string) => p.length === 4) || '0') : 0
                            const periodMonthStr = periodEndStr.match(/[-/](\d{2})[-/]/)?.[1] || periodEndStr.split(/[-/]/)[1] || ''
                            const periodMonth = parseInt(periodMonthStr) || 0
                            const isQ1 = periodMonth === 3

                            setCommissionsModalData({
                              transactions,
                              periodYear,
                              periodMonth,
                              isQ1,
                              totalCommissions: val
                            })
                          } : undefined}
                        >
                          <div className={styles.labelLine}>
                            <span className={styles.labelText}>
                              {item.label}
                              {isModified && <span className={styles.modifiedBadge}>(Modificato)</span>}
                              {isCommissionsField && <span style={{ marginLeft: '8px', fontSize: '0.9rem', color: '#64748b' }}>🔍</span>}
                            </span>
                            {displaySource && (
                              <span
                                className={`${styles.statusBadge} ${displaySource === 'extracted' ? styles.statusExtracted : styles.statusCalculated}`}
                                title={displaySource === 'calculated' ? formula : 'Dato estratto direttamente dal documento'}
                                style={{ cursor: 'help' }}
                              >
                                {displaySource === 'extracted' ? 'Estratto' : 'Calcolato'}
                              </span>
                            )}
                          </div>

                          <div className={styles.summaryValueContainer}>
                            {isNotFound || scalarNotFound ? (
                              <span className={styles.missingValue}>non trovato</span>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                                <input
                                  type="text"
                                  readOnly={true} // All fields are now read-only
                                  className={`${styles.summaryInput} ${(item as any).positiveColor && typeof val === 'number' && val > 0 ? styles.positiveValue : ''} ${(item as any).negativeColor && typeof val === 'number' && val < 0 ? styles.negativeValue : ''}`}
                                  value={
                                    item.type === 'text' ? (val || '') :
                                    item.type === 'currency' && typeof val === 'number'
                                      ? `${val > 0 ? '+' : ''}${formatCurrency(val)} €`
                                      : item.type === 'number' && typeof val === 'number' ? Math.round(val).toLocaleString('it-IT')
                                      : typeof val === 'number' ? formatCurrency(val) : val
                                  }
                                />
                                {isVerification && (
                                  <>
                                    {verificationStatus === 'ok' && <span title="Corrisponde al delta dei saldi" style={{ color: '#22c55e', fontWeight: 'bold' }}>✅ OK</span>}
                                    {verificationStatus === 'error' && <span title="Non corrisponde al delta dei saldi!" style={{ color: '#ef4444', fontWeight: 'bold' }}>❌ ERR</span>}
                                    <span style={{ fontSize: '0.8rem', color: '#64748b', whiteSpace: 'nowrap', marginLeft: '5px' }}>({transactionCount} op.)</span>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className={styles.infoGrid}>
                <div className={styles.infoItem}><strong>Banca</strong> {renderVal(inspectorData.bank_name)}</div>
                <div className={styles.infoItem}><strong>Intestatari</strong> {renderVal(inspectorData.costs_breakdown?.holder)}</div>
                {inspectorData.account_type === 'DOSSIER' ? (
                  <>
                    <div className={styles.infoItem}><strong>Numero Dossier Titoli</strong> {renderVal(inspectorData.benchmark_comparison)}</div>
                    <div className={styles.infoItem}><strong>Conto Corrente Regolatore</strong> {renderVal(inspectorData.costs_breakdown?.settlementAccount)}</div>
                  </>
                ) : (
                  <>
                    <div className={styles.infoItem}><strong>Account</strong> {renderVal(inspectorData.benchmark_comparison)}</div>
                    <div className={styles.infoItem}><strong>IBAN</strong> {renderVal(inspectorData.costs_breakdown?.settlementAccount)}</div>
                  </>
                )}
              </div>

              {inspectorData.account_type === 'DOSSIER' && (
                <div className={styles.infoGrid} style={{ marginTop: '1rem' }}>
                  <div className={styles.infoItem}>
                    <strong>Valuta del Portafoglio</strong>
                    {renderVal(inspectorData.costs_breakdown?.portfolio_currency || 'EUR')}
                  </div>
                  {(() => {
                    const calculatedTotal = inspectorData.holdings?.reduce((acc: number, h: any) => acc + (h.marketValue || 0), 0) || 0
                    const extractedTotal = inspectorData.costs_breakdown?.portfolio_total_extracted || 0
                    const diff = Math.abs(calculatedTotal - extractedTotal)
                    const isMatch = extractedTotal > 0 && diff < 0.01
                    return (
                      <div className={styles.infoItem}>
                        <strong>Valore Portafoglio</strong>
                        {renderVal(calculatedTotal, true)}
                        {extractedTotal > 0 && (
                          <span style={{ marginLeft: '8px' }}>
                            {isMatch ? (
                              <span title={`Estratto: €${formatCurrency(extractedTotal)}`} style={{ color: '#22c55e', fontWeight: 'bold' }}>✅</span>
                            ) : (
                              <span title={`Estratto: €${formatCurrency(extractedTotal)} - Differenza: €${formatCurrency(diff)}`} style={{ color: '#ef4444', fontWeight: 'bold' }}>❌</span>
                            )}
                          </span>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* Confronto Portafoglio Iniziale vs Periodo Precedente - per ISIN */}
              {inspectorData.account_type === 'DOSSIER' && (() => {
                const currentAccNorm = normalizeAcc(inspectorData.benchmark_comparison || '')
                const prevDoc = analyses
                  .filter(a =>
                    a.id !== inspectorData.id &&
                    a.account_type === 'DOSSIER' &&
                    normalizeAcc(a.benchmark_comparison || '') === currentAccNorm &&
                    a.period_end && inspectorData.period_start &&
                    new Date(a.period_end) <= new Date(inspectorData.period_start)
                  )
                  .sort((a, b) => new Date(b.period_end).getTime() - new Date(a.period_end).getTime())[0]

                if (!prevDoc) return null

                // Portafoglio finale periodo precedente (per ISIN)
                const prevHoldings: Record<string, { name: string; qty: number; value: number }> = {}
                ;(prevDoc.holdings || []).forEach((h: any) => {
                  const isin = h.isin || 'UNKNOWN'
                  prevHoldings[isin] = { name: h.name || h.description || isin, qty: h.quantity || 0, value: h.marketValue || 0 }
                })

                // Portafoglio iniziale calcolato del periodo corrente (finale - acquisti + vendite)
                const movements = inspectorData.costs_breakdown?.securityMovements || []
                const movDeltas: Record<string, { buys: number; sells: number }> = {}
                movements.forEach((m: any) => {
                  const isin = m.isin || 'UNKNOWN'
                  if (!movDeltas[isin]) movDeltas[isin] = { buys: 0, sells: 0 }
                  if (m.operationType === 'Acquisto') movDeltas[isin].buys += m.quantity || 0
                  else if (m.operationType === 'Vendita') movDeltas[isin].sells += m.quantity || 0
                })
                const calcInitial: Record<string, { name: string; qty: number; value: number }> = {}
                ;(inspectorData.holdings || []).forEach((h: any) => {
                  const isin = h.isin || 'UNKNOWN'
                  const delta = movDeltas[isin] || { buys: 0, sells: 0 }
                  const initQty = (h.quantity || 0) - delta.buys + delta.sells
                  if (initQty !== 0 || prevHoldings[isin]) {
                    calcInitial[isin] = { name: h.name || h.description || isin, qty: initQty, value: 0 }
                  }
                })
                // Titoli venduti completamente (in prevDoc ma non nel finale corrente)
                Object.entries(movDeltas).forEach(([isin, delta]) => {
                  if (!calcInitial[isin] && (prevHoldings[isin] || delta.sells > 0)) {
                    const initQty = 0 - delta.buys + delta.sells
                    if (initQty !== 0) {
                      calcInitial[isin] = { name: prevHoldings[isin]?.name || isin, qty: initQty, value: 0 }
                    }
                  }
                })

                // Confronto per ISIN
                const allIsins = [...new Set([...Object.keys(prevHoldings), ...Object.keys(calcInitial)])]
                type CompRow = { isin: string; name: string; prevQty: number; prevVal: number; calcQty: number; qtyDiff: number; match: boolean }
                const rows: CompRow[] = allIsins.map(isin => {
                  const prev = prevHoldings[isin] || { name: '', qty: 0, value: 0 }
                  const calc = calcInitial[isin] || { name: '', qty: 0, value: 0 }
                  const qtyDiff = calc.qty - prev.qty
                  return {
                    isin,
                    name: prev.name || calc.name,
                    prevQty: prev.qty,
                    prevVal: prev.value,
                    calcQty: calc.qty,
                    qtyDiff,
                    match: Math.abs(qtyDiff) < 0.0001
                  }
                })
                const allMatch = rows.every(r => r.match)
                const mismatches = rows.filter(r => !r.match)

                return (
                  <div style={{
                    margin: '0.75rem 0',
                    padding: '0.75rem 1rem',
                    borderRadius: '12px',
                    border: `2px solid ${allMatch ? '#22c55e' : '#ef4444'}`,
                    background: allMatch ? '#f0fdf4' : '#fef2f2',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.8rem', color: allMatch ? '#047857' : '#b91c1c' }}>
                        {allMatch ? '✅ Portafoglio Iniziale verificato' : `❌ ${mismatches.length} strument${mismatches.length === 1 ? 'o' : 'i'} non quadra${mismatches.length === 1 ? '' : 'no'}`}
                      </div>
                      <span style={{ fontSize: '0.6rem', color: '#94a3b8' }}>
                        vs {new Date(prevDoc.period_start).toLocaleDateString('it-IT')} - {new Date(prevDoc.period_end).toLocaleDateString('it-IT')}
                      </span>
                    </div>

                    {/* Riepilogo quote */}
                    <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.7rem', marginBottom: '0.5rem', color: '#475569', flexWrap: 'wrap' }}>
                      <span>Strumenti confrontati: <strong>{rows.length}</strong></span>
                      <span>Corrispondono: <strong style={{ color: '#047857' }}>{rows.filter(r => r.match).length}</strong></span>
                      {mismatches.length > 0 && <span>Non quadrano: <strong style={{ color: '#b91c1c' }}>{mismatches.length}</strong></span>}
                    </div>

                    {/* Tabella differenze per ISIN */}
                    {!allMatch && (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', fontSize: '0.65rem', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', textAlign: 'left' }}>
                              <th style={{ padding: '0.3rem 0.5rem' }}>ISIN</th>
                              <th style={{ padding: '0.3rem 0.5rem' }}>Strumento</th>
                              <th style={{ padding: '0.3rem 0.5rem', textAlign: 'right' }}>Quote Finale Prec.</th>
                              <th style={{ padding: '0.3rem 0.5rem', textAlign: 'right' }}>Quote Iniziale Calc.</th>
                              <th style={{ padding: '0.3rem 0.5rem', textAlign: 'right' }}>Differenza</th>
                            </tr>
                          </thead>
                          <tbody>
                            {mismatches.map(r => (
                              <tr key={r.isin} style={{ borderBottom: '1px solid #fecaca', background: '#fff5f5' }}>
                                <td style={{ padding: '0.3rem 0.5rem', fontFamily: 'monospace', fontSize: '0.6rem' }}>{r.isin}</td>
                                <td style={{ padding: '0.3rem 0.5rem', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</td>
                                <td style={{ padding: '0.3rem 0.5rem', textAlign: 'right' }}>{r.prevQty.toLocaleString('it-IT', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td>
                                <td style={{ padding: '0.3rem 0.5rem', textAlign: 'right' }}>{r.calcQty.toLocaleString('it-IT', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td>
                                <td style={{ padding: '0.3rem 0.5rem', textAlign: 'right', fontWeight: 700, color: '#b91c1c' }}>{r.qtyDiff > 0 ? '+' : ''}{r.qtyDiff.toLocaleString('it-IT', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {allMatch && (
                      <div style={{ fontSize: '0.65rem', color: '#047857' }}>
                        Tutti i {rows.length} strumenti hanno le stesse quantit&agrave; nel ptf. finale precedente e nel ptf. iniziale calcolato.
                      </div>
                    )}
                  </div>
                )
              })()}

              {inspectorData.account_type === 'DOSSIER' && inspectorData.costs_breakdown?.securityMovements && (
                <>
                  {(() => {
                    const movements = inspectorData.costs_breakdown.securityMovements || [];
                    const totalMovements = movements.length;
                    const buyMovements = movements.filter((m: any) => m.operationType === 'Acquisto').length;
                    const sellMovements = movements.filter((m: any) => m.operationType === 'Vendita').length;

                    // Calculate amounts using netAmount (actual value from PDF)
                    const buyGross = movements
                      .filter((m: any) => m.operationType === 'Acquisto')
                      .reduce((acc: number, m: any) => acc + Math.abs(m.netAmount || 0), 0);
                    const sellGross = movements
                      .filter((m: any) => m.operationType === 'Vendita')
                      .reduce((acc: number, m: any) => acc + Math.abs(m.netAmount || 0), 0);
                    // Net total: sells (+) minus buys (-)
                    const totalNet = sellGross - buyGross;

                    return (
                      <>
                        {/* Row 1: Counts */}
                        <div className={styles.infoGrid} style={{ marginTop: '1rem' }}>
                          <div className={styles.infoItem}>
                            <strong>Movimenti Titoli</strong>
                            <span style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{totalMovements}</span>
                          </div>
                          <div className={styles.infoItem}>
                            <strong>Acquisti</strong>
                            <span style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{buyMovements}</span>
                          </div>
                          <div className={styles.infoItem}>
                            <strong>Vendite</strong>
                            <span style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{sellMovements}</span>
                          </div>
                        </div>
                        {/* Row 2: Amounts */}
                        <div className={styles.infoGrid} style={{ marginTop: '0.75rem' }}>
                          <div className={styles.infoItem}>
                            <strong>Totale Movimenti</strong>
                            <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: totalNet >= 0 ? '#22c55e' : '#ef4444' }}>{totalNet >= 0 ? '+' : '-'}€{formatCurrency(Math.abs(totalNet))}</span>
                          </div>
                          <div className={styles.infoItem}>
                            <strong>Investimenti</strong>
                            <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#ef4444' }}>-€{formatCurrency(buyGross)}</span>
                          </div>
                          <div className={styles.infoItem}>
                            <strong>Disinvestimenti</strong>
                            <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#22c55e' }}>+€{formatCurrency(sellGross)}</span>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </>
              )}

              {/* Tabbed Portfolio Section for DOSSIER */}
              {inspectorData.account_type === 'DOSSIER' && (
                <div className={styles.inspectorSection}>
                  {/* Tab Navigation */}
                  {(() => {
                    // Calculate initial portfolio count
                    const movements = inspectorData.costs_breakdown?.securityMovements || [];
                    const finalHoldings = inspectorData.holdings || [];
                    const movementDeltas: Record<string, { buys: number; sells: number }> = {};
                    movements.forEach((m: any) => {
                      const isin = m.isin || 'UNKNOWN';
                      if (!movementDeltas[isin]) movementDeltas[isin] = { buys: 0, sells: 0 };
                      if (m.operationType === 'Acquisto') movementDeltas[isin].buys += m.quantity || 0;
                      else if (m.operationType === 'Vendita') movementDeltas[isin].sells += m.quantity || 0;
                    });
                    let initialCount = 0;
                    const processedIsins = new Set<string>();
                    finalHoldings.forEach((h: any) => {
                      const isin = h.isin || 'UNKNOWN';
                      processedIsins.add(isin);
                      const delta = movementDeltas[isin] || { buys: 0, sells: 0 };
                      const initialQty = (h.quantity || 0) - delta.buys + delta.sells;
                      if (initialQty !== 0) initialCount++;
                    });
                    Object.entries(movementDeltas).forEach(([isin, delta]) => {
                      if (!processedIsins.has(isin) && isin !== 'UNKNOWN') {
                        const initialQty = 0 - delta.buys + delta.sells;
                        if (initialQty !== 0) initialCount++;
                      }
                    });

                    return (
                  <div style={{ display: 'flex', gap: '0', marginBottom: '1rem', borderBottom: '2px solid #e2e8f0' }}>
                    <button
                      onClick={() => setPortfolioTab('initial')}
                      style={{
                        padding: '0.75rem 1.5rem',
                        border: 'none',
                        background: portfolioTab === 'initial' ? '#fff' : 'transparent',
                        borderBottom: portfolioTab === 'initial' ? '2px solid #10b981' : '2px solid transparent',
                        marginBottom: '-2px',
                        cursor: 'pointer',
                        fontWeight: portfolioTab === 'initial' ? '600' : '400',
                        color: portfolioTab === 'initial' ? '#10b981' : '#64748b',
                        transition: 'all 0.2s'
                      }}
                    >
                      Portafoglio Iniziale
                      <span style={{
                        marginLeft: '8px',
                        fontSize: '0.75rem',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        background: '#10b981',
                        color: '#fff'
                      }}>{initialCount}</span>
                    </button>
                    <button
                      onClick={() => setPortfolioTab('movements')}
                      style={{
                        padding: '0.75rem 1.5rem',
                        border: 'none',
                        background: portfolioTab === 'movements' ? '#fff' : 'transparent',
                        borderBottom: portfolioTab === 'movements' ? '2px solid #10b981' : '2px solid transparent',
                        marginBottom: '-2px',
                        cursor: 'pointer',
                        fontWeight: portfolioTab === 'movements' ? '600' : '400',
                        color: portfolioTab === 'movements' ? '#10b981' : '#64748b',
                        transition: 'all 0.2s'
                      }}
                    >
                      Movimenti Titoli
                      <span style={{
                        marginLeft: '8px',
                        fontSize: '0.75rem',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        background: '#10b981',
                        color: '#fff'
                      }}>{inspectorData.costs_breakdown?.securityMovements?.length || 0}</span>
                    </button>
                    <button
                      onClick={() => setPortfolioTab('final')}
                      style={{
                        padding: '0.75rem 1.5rem',
                        border: 'none',
                        background: portfolioTab === 'final' ? '#fff' : 'transparent',
                        borderBottom: portfolioTab === 'final' ? '2px solid #10b981' : '2px solid transparent',
                        marginBottom: '-2px',
                        cursor: 'pointer',
                        fontWeight: portfolioTab === 'final' ? '600' : '400',
                        color: portfolioTab === 'final' ? '#10b981' : '#64748b',
                        transition: 'all 0.2s'
                      }}
                    >
                      Portafoglio Finale
                      <span style={{
                        marginLeft: '8px',
                        fontSize: '0.75rem',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        background: '#10b981',
                        color: '#fff'
                      }}>{finalHoldings.length}</span>
                    </button>
                  </div>
                    );
                  })()}

                  {/* Tab Content: Portafoglio Iniziale */}
                  {portfolioTab === 'initial' && (() => {
                    // Check if previous period exists for this account
                    const currentAccNorm = inspectorData.account_type === 'DOSSIER' ? normalizeAcc(inspectorData.benchmark_comparison || '') : ''
                    const prevDoc = currentAccNorm ? analyses
                      .filter(a =>
                        a.id !== inspectorData.id &&
                        a.account_type === inspectorData.account_type &&
                        normalizeAcc(a.benchmark_comparison || '') === currentAccNorm &&
                        a.period_end && inspectorData.period_start &&
                        new Date(a.period_end) <= new Date(inspectorData.period_start))
                      .sort((a, b) => new Date(b.period_end).getTime() - new Date(a.period_end).getTime())[0]
                      : null

                    const isImported = !!prevDoc
                    const movements = inspectorData.costs_breakdown?.securityMovements || [];
                    const finalHoldings = inspectorData.holdings || [];
                    const missingVal = <span style={{ color: '#ef4444', fontWeight: 'bold' }}>?</span>;

                    let initialPortfolio: any[] = [];

                    if (isImported) {
                      // Use previous period's final holdings
                      initialPortfolio = (prevDoc.holdings || []).map((h: any) => ({
                        isin: h.isin, name: h.name, currency: h.currency,
                        initialQty: h.quantity || 0, price: h.price || 0,
                        exchangeRate: h.exchangeRate || 1, marketValue: h.marketValue || 0
                      }))
                    } else {
                      // Calculate from final + reverse movements
                      const movementDeltas: Record<string, { buys: number; sells: number; name: string; currency: string }> = {};
                      movements.forEach((m: any) => {
                        const isin = m.isin || 'UNKNOWN';
                        if (!movementDeltas[isin]) {
                          movementDeltas[isin] = { buys: 0, sells: 0, name: m.name || '', currency: m.currency || 'EUR' };
                        }
                        if (m.operationType === 'Acquisto') movementDeltas[isin].buys += m.quantity || 0;
                        else if (m.operationType === 'Vendita') movementDeltas[isin].sells += m.quantity || 0;
                      });
                      const processedIsins = new Set<string>();
                      finalHoldings.forEach((h: any) => {
                        const isin = h.isin || 'UNKNOWN';
                        processedIsins.add(isin);
                        const delta = movementDeltas[isin] || { buys: 0, sells: 0 };
                        const initialQty = (h.quantity || 0) - delta.buys + delta.sells;
                        if (initialQty !== 0) {
                          initialPortfolio.push({ isin: h.isin, name: h.name, currency: h.currency, initialQty });
                        }
                      });
                      Object.entries(movementDeltas).forEach(([isin, delta]) => {
                        if (!processedIsins.has(isin) && isin !== 'UNKNOWN') {
                          const initialQty = 0 - delta.buys + delta.sells;
                          if (initialQty !== 0) {
                            initialPortfolio.push({ isin, name: delta.name, currency: delta.currency, initialQty });
                          }
                        }
                      });
                    }

                    return (
                      <>
                        <div style={{
                          padding: '0.5rem 0.75rem', marginBottom: '0.5rem', borderRadius: '8px',
                          fontSize: '0.7rem', fontWeight: 600,
                          background: isImported ? '#eff6ff' : '#fefce8',
                          color: isImported ? '#1d4ed8' : '#a16207',
                          border: `1px solid ${isImported ? '#bfdbfe' : '#fde68a'}`
                        }}>
                          {isImported
                            ? `Importato dal portafoglio finale del ${new Date(prevDoc.period_start).toLocaleDateString('it-IT')} - ${new Date(prevDoc.period_end).toLocaleDateString('it-IT')}`
                            : 'Calcolato dai movimenti del periodo (nessun periodo precedente)'}
                        </div>
                        {initialPortfolio.length === 0 ? (
                          <p style={{ color: '#64748b', fontStyle: 'italic', textAlign: 'center', padding: '40px' }}>
                            Portafoglio iniziale vuoto
                          </p>
                        ) : (
                          <table className={styles.inspectorTable}>
                            <thead><tr><th>ISIN</th><th>Nome</th><th>Divisa</th><th>Cambio</th><th>Quantità</th><th>Prezzo</th><th>Valore €</th></tr></thead>
                            <tbody>
                              {initialPortfolio.map((h: any, i: number) => (
                                <tr key={i}>
                              <td>{h.isin || ''}</td>
                              <td>{h.name || ''}</td>
                              <td>{h.currency || ''}</td>
                              <td>{h.exchangeRate != null ? h.exchangeRate.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : missingVal}</td>
                              <td>{h.initialQty.toLocaleString('it-IT', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td>
                              <td>{h.price != null ? h.price.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : missingVal}</td>
                              <td>{h.marketValue != null ? `€${formatCurrency(h.marketValue)}` : missingVal}</td>
                            </tr>
                          ))}
                            </tbody>
                          </table>
                        )}
                      </>
                    );
                  })()}

                  {/* Tab Content: Portafoglio Finale */}
                  {portfolioTab === 'final' && (
                    <table className={styles.inspectorTable}>
                      <thead><tr><th>ISIN</th><th>Nome</th><th>Divisa</th><th>Cambio</th><th>Quantità</th><th>Prezzo</th><th>Valore €</th></tr></thead>
                      <tbody>
                        {inspectorData.holdings?.map((h: any, i: number) => (
                          <tr key={i}>
                            <td>{h.isin || ''}</td>
                            <td>{h.name || ''}</td>
                            <td>{h.currency || 'EUR'}</td>
                            <td>{(h.exchangeRate || 1).toLocaleString('it-IT', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</td>
                            <td>{h.quantity ? h.quantity.toLocaleString('it-IT', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : ''}</td>
                            <td>{h.price && h.price !== 0 ? formatCurrency(h.price) : '0,00'}</td>
                            <td>€{formatCurrency(h.marketValue || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {/* Tab Content: Movimenti Titoli */}
                  {portfolioTab === 'movements' && (
                    inspectorData.costs_breakdown?.securityMovements && inspectorData.costs_breakdown.securityMovements.length > 0 ? (
                      <table className={styles.inspectorTable}>
                        <thead>
                          <tr>
                            <th>Data</th>
                            <th>ISIN</th>
                            <th>Nome Titolo</th>
                            <th>Tipo</th>
                            <th>Quantità</th>
                            <th>Prezzo</th>
                            <th>Cambio</th>
                            <th>Divisa</th>
                            <th>Spese/Imposte</th>
                            <th>Importo Netto</th>
                            <th>Importo Lordo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...inspectorData.costs_breakdown.securityMovements]
                            .sort((a: any, b: any) => {
                              const parseDate = (d: string) => {
                                if (!d) return new Date(0);
                                const [day, month, year] = d.split('/').map(Number);
                                return new Date(year, month - 1, day);
                              };
                              return parseDate(a.date).getTime() - parseDate(b.date).getTime();
                            })
                            .map((m: any, i: number) => {
                              const missingVal = <span style={{ color: '#ef4444', fontWeight: 'bold' }}>?</span>;
                              const isVendita = m.operationType === 'Vendita';
                              return (
                                <tr key={i}>
                                  <td>{m.date || missingVal}</td>
                                  <td>{m.isin || missingVal}</td>
                                  <td>{m.name || missingVal}</td>
                                  <td>
                                    <span className={m.operationType === 'Acquisto' ? styles.typeAcquisto : styles.typeVendita}>
                                      {m.operationType || missingVal}
                                    </span>
                                  </td>
                                  <td style={{ color: isVendita ? '#ef4444' : '#22c55e' }}>
                                    {typeof m.quantity === 'number' && m.quantity !== 0
                                      ? `${isVendita ? '-' : '+'}${m.quantity.toLocaleString('it-IT', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`
                                      : missingVal}
                                  </td>
                                  <td>{typeof m.price === 'number' && m.price !== 0 ? formatCurrency(m.price) : missingVal}</td>
                                  <td>{(m.exchangeRate || 1).toLocaleString('it-IT', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</td>
                                  <td>{m.currency || 'EUR'}</td>
                                  <td style={{ color: '#ef4444' }}>{(() => {
                                      const totalCosts = (m.fees || 0) + (m.taxes || 0);
                                      return totalCosts !== 0 ? `-${formatCurrency(totalCosts)}` : missingVal;
                                    })()}</td>
                                  <td style={{ color: isVendita ? '#22c55e' : '#ef4444' }}>{typeof m.netAmount === 'number' && m.netAmount !== 0 ? `${isVendita ? '+' : '-'}€${formatCurrency(Math.abs(m.netAmount))}` : missingVal}</td>
                                  <td style={{ color: isVendita ? '#22c55e' : '#ef4444' }}>{(() => {
                                      const grossAmount = ((m.quantity || 0) * (m.price || 0)) / (m.exchangeRate || 1);
                                      return grossAmount !== 0 ? `${isVendita ? '+' : '-'}€${formatCurrency(grossAmount)}` : missingVal;
                                    })()}</td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    ) : (
                      <p style={{ color: '#64748b', fontStyle: 'italic', textAlign: 'center', padding: '40px' }}>
                        Non ci sono movimenti in questo periodo
                      </p>
                    )
                  )}
                </div>
              )}

              {/* Movimenti del Periodo - Solo per LIQUIDITY */}
              {inspectorData.account_type === 'LIQUIDITY' && (
              <div className={styles.inspectorSection}>
                <h4>
                  Movimenti del Periodo
                  <span className={`${styles.statusBadge} ${styles.statusExtracted}`} style={{ verticalAlign: 'middle', marginLeft: '12px' }}>
                    Estratto
                  </span>
                </h4>
                {inspectorData.account_type === 'LIQUIDITY' && (
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
                      {editingTransactions.map((t: any, i: number) => {
                        const typeClass = styles[`type${t.movement_type || 'Altro'}`] || styles.typeAltro;
                        const amount = t.amount !== undefined ? t.amount : t.exchangeValue;
                        const amountClass = amount < 0 ? styles.amountNegative : (amount > 0 ? styles.amountPositive : '');
                        const movementTypes = [
                          { value: 'Commissioni', label: 'Commissioni' },
                          { value: 'Acquisto', label: 'Acquisto titoli' },
                          { value: 'Vendita', label: 'Vendita titoli' },
                          { value: 'Proventi', label: 'Proventi titoli' },
                          { value: 'Altro', label: 'Altro' }
                        ];

                        return (
                          <tr key={i}>
                            <td>{renderVal(t.date)}</td>
                            <td style={{ fontSize: '0.75rem', maxWidth: '300px' }}>{renderVal(t.description || 'N/D')}</td>
                            <td>
                              <select
                                value={t.movement_type || 'Altro'}
                                onChange={(e) => {
                                  const newTransactions = [...editingTransactions];
                                  newTransactions[i] = { ...newTransactions[i], movement_type: e.target.value };
                                  setEditingTransactions(newTransactions);
                                }}
                                className={`${styles.typeBadge} ${typeClass}`}
                                style={{
                                  border: 'none',
                                  cursor: 'pointer'
                                }}
                              >
                                {movementTypes.map(type => (
                                  <option key={type.value} value={type.value}>{type.label}</option>
                                ))}
                              </select>
                            </td>
                            <td className={amountClass}>
                              {amount !== undefined ? `€ ${formatCurrency(amount)}` : 'N/D'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* Commissions Detail Modal */}
      {commissionsModalData && (
        <div className={styles.modalOverlay} onClick={() => setCommissionsModalData(null)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', maxHeight: '90vh', overflow: 'auto' }}>
            <div className={styles.modalHeader}>
              <div>
                <h3>Dettaglio Calcolo Commissioni</h3>
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>
                  Anno: {commissionsModalData.periodYear} | Trimestre: Q{Math.ceil(commissionsModalData.periodMonth / 3)}
                </p>
              </div>
              <button className={styles.closeBtn} onClick={() => setCommissionsModalData(null)}>×</button>
            </div>
            <div className={styles.modalBody}>
              {(() => {
                const { transactions } = commissionsModalData;

                // Movimenti classificati come "Commissioni"
                const commissioniMovements = transactions.filter((m: any) => m.movement_type === 'Commissioni');
                const commissioniSum = commissioniMovements.reduce((sum: number, m: any) => sum + (m.amount || 0), 0);

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div className={styles.inspectorSection}>
                      <table className={styles.inspectorTable}>
                        <thead>
                          <tr>
                            <th>Data</th>
                            <th>Descrizione</th>
                            <th>Importo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {commissioniMovements.map((m: any, i: number) => (
                            <tr key={i}>
                              <td>{renderVal(m.date)}</td>
                              <td style={{ fontSize: '0.75rem', maxWidth: '400px' }}>{renderVal(m.description)}</td>
                              <td className={m.amount < 0 ? styles.amountNegative : styles.amountPositive}>
                                € {formatCurrency(m.amount || 0)}
                              </td>
                            </tr>
                          ))}
                          <tr style={{ fontWeight: 'bold', borderTop: '2px solid #cbd5e1' }}>
                            <td colSpan={2}>Totale (valore assoluto)</td>
                            <td>€ {formatCurrency(Math.abs(commissioniSum))}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {confirmModal && confirmModal.isOpen && (
        <div className={styles.confirmModalOverlay} onClick={confirmModal.onCancel}>
          <div className={styles.confirmModalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.confirmModalIcon}>🗑️</div>
            <h3 className={styles.confirmModalTitle}>{confirmModal.title}</h3>
            <p className={styles.confirmModalMessage}>{confirmModal.message}</p>
            <div className={styles.confirmModalActions}>
              <button
                className={styles.confirmModalCancelBtn}
                onClick={confirmModal.onCancel}
              >
                Annulla
              </button>
              <button
                className={styles.confirmModalConfirmBtn}
                onClick={confirmModal.onConfirm}
              >
                Conferma
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
