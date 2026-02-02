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
  const [commissionsModalData, setCommissionsModalData] = useState<any>(null)
  const [editingTransactions, setEditingTransactions] = useState<any[]>([])
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
    setAnalyses(data || [])

    const { data: trashedData } = await supabase
      .from('analyses')
      .select('*')
      .eq('user_id', userId)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })

    setTrashedAnalyses(trashedData || [])
  }, [supabase])

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

  useEffect(() => {
    if (inspectorData) {
      setEditingValues(JSON.parse(JSON.stringify(inspectorData.costs_breakdown || {})))
      setEditingTransactions(JSON.parse(JSON.stringify(inspectorData.transactions || [])))
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
        // Track start time for detailed progress messages
        const uploadStartTime = Date.now()

        // Progress animation with detailed stage updates
        let currentProgress = 5
        const progressInterval = setInterval(() => {
          setUploadQueue(prev => prev.map(f => {
            if (f.id === fileId && (f.status === 'uploading' || f.status === 'analyzing')) {
              const elapsed = Math.floor((Date.now() - uploadStartTime) / 1000)
              let stage = 'Inizializzazione...'

              // Detailed stage messages based on elapsed time
              if (elapsed < 2) {
                stage = 'Caricamento PDF...'
              } else if (elapsed < 5) {
                stage = 'Conversione documento...'
              } else if (elapsed < 10) {
                stage = 'Invio a Gemini AI...'
              } else if (elapsed < 30) {
                stage = 'Analisi con AI in corso...'
              } else if (elapsed < 60) {
                stage = 'Estrazione movimenti...'
              } else if (elapsed < 90) {
                stage = 'Validazione dati...'
              } else if (elapsed < 120) {
                stage = 'Completamento analisi...'
              } else {
                stage = `Analisi approfondita... (${elapsed}s)`
              }

              // Slow down as we approach 90%
              const maxProgress = 90
              const increment = Math.max(0.5, (maxProgress - currentProgress) / 20)
              currentProgress = Math.min(maxProgress, currentProgress + increment)
              return { ...f, progress: Math.round(currentProgress), stage, startTime: uploadStartTime }
            }
            return f
          }))
        }, 1000) // Update every second for time-based messages

        // Update to analyzing after 3 seconds
        setTimeout(() => {
          setUploadQueue(prev => prev.map(f =>
            f.id === fileId ? { ...f, status: 'analyzing' as const, stage: 'Analisi AI avviata...' } : f
          ))
        }, 3000)

        const formData = new FormData()
        formData.append('file', file)
        formData.append('userId', user.id)

        // AbortController with 5-minute timeout for Gemini processing
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
          // Check if it's a duplicate period - ask user to confirm
          if (result.isDuplicate && response.status === 409) {
            clearInterval(progressInterval)

            // Show confirmation modal
            const shouldProceed = await new Promise<boolean>((resolve) => {
              setConfirmModal({
                isOpen: true,
                title: '⚠️ Periodo Già Caricato',
                message: `${result.message}\n\nVuoi ricalcolare comunque questo periodo? I dati precedenti verranno sostituiti.`,
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

            if (shouldProceed) {
              // User confirmed - re-upload with force flag
              setUploadQueue(prev => prev.map(f =>
                f.id === fileId ? { ...f, status: 'uploading' as const, progress: 5, stage: 'Ricalcolo forzato...' } : f
              ))

              formData.append('force', 'true') // Signal to API to skip duplicate check

              const retryResponse = await fetch('/api/parse-pdf', {
                method: 'POST',
                body: formData,
              })

              const retryResult = await retryResponse.json()

              if (retryResult.success) {
                setUploadQueue(prev => prev.map(f =>
                  f.id === fileId ? { ...f, status: 'done' as const, progress: 100 } : f
                ))
                await fetchAnalyses(user.id)
              } else {
                setUploadQueue(prev => prev.map(f =>
                  f.id === fileId ? { ...f, status: 'error' as const, progress: 0, error: retryResult.error } : f
                ))
              }
            } else {
              // User cancelled - remove from queue
              setUploadQueue(prev => prev.filter(f => f.id !== fileId))
            }
          }
          // Check if it's a rate limit error - retry after delay
          else if (result.error?.includes('rate') || result.error?.includes('limit') || result.error?.includes('429')) {
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
        const errorMsg = error.name === 'AbortError'
          ? 'Timeout: l\'analisi ha superato 5 minuti. Riprova.'
          : (error.message || 'Errore di rete')
        setUploadQueue(prev => prev.map(f =>
          f.id === fileId ? { ...f, status: 'error' as const, progress: 0, error: errorMsg } : f
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
        const quarterEndMonth = quarter * 3 - 1; // 2, 5, 8, 11 (0-indexed)

        // Find document for this quarter
        const file = accountAnalyses.find(a => {
          if (!a.period_end) return false;
          const d = new Date(a.period_end);
          const docMonth = d.getMonth();
          const docYear = d.getFullYear();
          return docYear === year && docMonth >= (quarter - 1) * 3 && docMonth <= quarterEndMonth;
        });

        slots.push({ type: 'quarterly', month: quarterEndMonth, quarter, file });

        // Skip to next quarter
        m = quarterEndMonth + 1;
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
                  <Link href={`/analisi/${(group.dossiers[0]?.analyses[0] || group.liquidityAccounts[0]?.analyses[0])?.id}`} className={styles.btnAnalysisPremium}>
                    VEDI ANALISI <span>→</span>
                  </Link>
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
                        <button
                          onClick={async () => {
                            const confirmed = await showConfirmModal(
                              'Elimina sezione Dossier',
                              `Vuoi spostare nel cestino tutti i ${dossier.analyses.length} documenti del Dossier ${dossier.identifier}?`
                            );
                            if (!confirmed) return;
                            handleDeleteMultiple(dossier.analyses.map(a => a.id));
                          }}
                          className={styles.deleteSectionBtn}
                          style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: 'none', padding: '8px', borderRadius: '8px', cursor: 'pointer' }}
                        >
                          🗑️
                        </button>
                      </div>

                      <div className={styles.timelineNavigation}>

                        <div className={styles.timelineGrid} ref={registerTimeline} onScroll={handleSyncScroll}>
                          {years.map(year => {
                            // Build dynamic frequency map and slots
                            const freqMap = buildYearFrequencyMap(dossier.analyses, year);
                            const slots = buildYearSlots(freqMap, dossier.analyses, year);

                            return (
                              <div key={year} className={styles.yearBlock}>
                                <div className={styles.yearLabelPremium}>{year}</div>
                                <div className={styles.slotsRow} style={{ gridTemplateColumns: `repeat(${slots.length}, minmax(100px, 140px))` }}>
                                  {slots.map((slot, idx) => {
                                    const isPresent = !!slot.file;
                                    const isMonthly = slot.type === 'monthly';

                                    // Get display label and dates
                                    let displayLabel: string;
                                    let dates: { start: string; end: string };

                                    if (isMonthly) {
                                      const monthNames = ['GEN', 'FEB', 'MAR', 'APR', 'MAG', 'GIU', 'LUG', 'AGO', 'SET', 'OTT', 'NOV', 'DIC'];
                                      displayLabel = monthNames[slot.month];
                                      dates = getSlotDates(year, slot.month + 1, 'monthly');
                                    } else {
                                      displayLabel = `Q${slot.quarter}`;
                                      dates = getSlotDates(year, slot.quarter!, 'quarterly');
                                    }

                                    return (
                                      <div key={idx}
                                        className={`${styles.tilePremium} ${isPresent ? styles.present : styles.absent}`}
                                        data-has-analysis={isPresent ? 'true' : 'false'}
                                        data-analysis-id={isPresent ? slot.file!.id : undefined}
                                        onClick={() => isPresent && router.push(`/analisi/${slot.file!.id}`)}>

                                        <div className={styles.tileDates}>
                                          <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>{displayLabel}</div>
                                          {isPresent ? (
                                            <>
                                              {new Date(slot.file!.period_start).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })}<br />
                                              <span className={styles.arrowIconSmall}>↓</span>
                                              {new Date(slot.file!.period_end).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })}
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
                                            <div className={styles.valueDataLarge}>{slot.file!.forensic_summary?.performance_pct || 'N/D'}</div>
                                            <div className={styles.tileActions}>
                                              <button className={styles.tileInpectBtn} onClick={(e) => { e.stopPropagation(); setInspectorData(slot.file!); }}>🔍</button>
                                              <button className={styles.tileDeleteBtn} onClick={(e) => { e.stopPropagation(); handleDelete(slot.file!.id); }}>🗑️</button>
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

                  {/* Multiple Liquidity Accounts per Bank */}
                  {group.liquidityAccounts.map((liquidity, lIdx) => (
                    <div key={`liquidity-${lIdx}`} className={styles.accountSection}>
                      <div className={styles.accountHeader}>
                        <div className={styles.accountTitleInfo}>
                          <span className={styles.accBadge} style={{ background: 'rgba(59,130,246,0.08)', color: '#3b82f6' }}>LIQUIDITÀ</span>
                          <div className={styles.accDetailsText}>
                            Conto corrente: <strong>{liquidity.identifier}</strong><br />
                            Rendicontazione: <strong>Variabile</strong>
                          </div>
                        </div>
                        <button
                          onClick={async () => {
                            const confirmed = await showConfirmModal(
                              'Elimina sezione Liquidità',
                              `Vuoi spostare nel cestino tutti i ${liquidity.analyses.length} documenti del Conto ${liquidity.identifier}?`
                            );
                            if (!confirmed) return;
                            handleDeleteMultiple(liquidity.analyses.map(a => a.id));
                          }}
                          style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: 'none', padding: '8px', borderRadius: '8px', cursor: 'pointer' }}
                        >
                          🗑️
                        </button>
                      </div>

                      <div className={styles.timelineNavigation}>
                        <div className={styles.timelineGrid} ref={registerTimeline} onScroll={handleSyncScroll}>
                          {years.map(year => {
                            // Build dynamic frequency map and slots
                            const freqMap = buildYearFrequencyMap(liquidity.analyses, year);
                            const slots = buildYearSlots(freqMap, liquidity.analyses, year);

                            return (
                              <div key={year} className={styles.yearBlock}>
                                <div className={styles.yearLabelPremium}>{year}</div>
                                <div className={styles.slotsRow} style={{ gridTemplateColumns: `repeat(${slots.length}, minmax(100px, 140px))` }}>
                                  {slots.map((slot, idx) => {
                                    const isPresent = !!slot.file;
                                    const isMonthly = slot.type === 'monthly';

                                    // Get display label and dates
                                    let displayLabel: string;
                                    let dates: { start: string; end: string };

                                    if (isMonthly) {
                                      const monthNames = ['GEN', 'FEB', 'MAR', 'APR', 'MAG', 'GIU', 'LUG', 'AGO', 'SET', 'OTT', 'NOV', 'DIC'];
                                      displayLabel = monthNames[slot.month];
                                      dates = getSlotDates(year, slot.month + 1, 'monthly');
                                    } else {
                                      displayLabel = `Q${slot.quarter}`;
                                      dates = getSlotDates(year, slot.quarter!, 'quarterly');
                                    }

                                    return (
                                      <div key={idx}
                                        className={`${styles.tilePremium} ${isPresent ? styles.present : styles.absent}`}
                                        data-has-analysis={isPresent ? 'true' : 'false'}
                                        data-analysis-id={isPresent ? slot.file!.id : undefined}
                                        onClick={() => isPresent && router.push(`/analisi/${slot.file!.id}`)}>

                                        <div className={styles.tileDates}>
                                          <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>{displayLabel}</div>
                                          {isPresent ? (
                                            <>
                                              {new Date(slot.file!.period_start).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })}<br />
                                              <span className={styles.arrowIconSmall}>↓</span>
                                              {new Date(slot.file!.period_end).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })}
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
                                            <div className={styles.valueDataLarge}>€{(slot.file!.portfolio_value || 0).toLocaleString('it-IT')}</div>
                                            <div className={styles.tileActions}>
                                              <button className={styles.tileInpectBtn} onClick={(e) => { e.stopPropagation(); setInspectorData(slot.file!); }}>🔍</button>
                                              <button className={styles.tileDeleteBtn} onClick={(e) => { e.stopPropagation(); handleDelete(slot.file!.id); }}>🗑️</button>
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
                            // Open commissions detail modal
                            const transactions = inspectorData.transactions || []
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
                                    `${item.type === 'currency' && typeof val === 'number' && val > 0 ? '+' : ''}${typeof val === 'number' ? val.toLocaleString('it-IT', { minimumFractionDigits: item.type === 'currency' ? 2 : 0 }) : val}${item.type === 'currency' ? ' €' : ''}`
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
                      {editingTransactions.map((t: any, i: number) => {
                        const typeClass = styles[`type${t.movement_type || 'Altro'}`] || styles.typeAltro;
                        const amount = t.amount !== undefined ? t.amount : t.exchangeValue;
                        const amountClass = amount < 0 ? styles.amountNegative : (amount > 0 ? styles.amountPositive : '');
                        const movementTypes = ['Commissioni', 'Spesa', 'Acquisto', 'Vendita', 'Proventi', 'Dividendo', 'Bonifico', 'Altro'];

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
                                  background: 'transparent',
                                  cursor: 'pointer',
                                  fontWeight: '500',
                                  padding: '4px 8px'
                                }}
                              >
                                {movementTypes.map(type => (
                                  <option key={type} value={type}>{type}</option>
                                ))}
                              </select>
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
                const { transactions, periodYear, periodMonth, isQ1, totalCommissions } = commissionsModalData;

                // 1. Movimenti classificati come "Commissioni"
                const commissioniMovements = transactions.filter((m: any) => m.movement_type === 'Commissioni');
                const commissioniSum = Math.abs(commissioniMovements.reduce((sum: number, m: any) => sum + (m.amount || 0), 0));

                // 2. Bollo E/C (dal 2023+, escluso Q1 dal 2024+)
                const shouldIncludeBollo = periodYear >= 2023 && !(periodYear >= 2024 && isQ1);
                const bolloMovements = shouldIncludeBollo ? transactions.filter((m: any) =>
                  m.movement_type === 'Spesa' && (
                    m.description?.toLowerCase().includes('bollo') && (
                      m.description?.toLowerCase().includes('e/c') ||
                      m.description?.toLowerCase().includes('rendiconto')
                    )
                  )
                ) : [];
                const bolloSum = Math.abs(bolloMovements.reduce((sum: number, m: any) => sum + (m.amount || 0), 0));

                // 3. Tobin Tax (dal 2022+)
                const shouldIncludeTobin = periodYear >= 2022;
                const tobinMovements = shouldIncludeTobin ? transactions.filter((m: any) =>
                  m.movement_type === 'Spesa' && (
                    m.description?.toLowerCase().includes('transazioni finanziarie') ||
                    m.description?.toLowerCase().includes('tobin')
                  )
                ) : [];
                const tobinSum = Math.abs(tobinMovements.reduce((sum: number, m: any) => sum + (m.amount || 0), 0));

                // 4. Competenze (dal 2017+, escluso Q1)
                const shouldIncludeCompetenzeGross = periodYear >= 2017 && periodMonth !== 3;
                const competenzeMovements = shouldIncludeCompetenzeGross ? commissioniMovements.filter((m: any) =>
                  (m.amount || 0) > 0 && m.description?.toLowerCase().includes('competenz')
                ) : [];
                const competenzeSum = competenzeMovements.reduce((sum: number, m: any) => sum + (m.amount || 0), 0);

                // 5. Calcolo finale
                let calculatedTotal = commissioniSum;
                if (shouldIncludeBollo) calculatedTotal += bolloSum;
                if (shouldIncludeTobin) calculatedTotal += tobinSum;
                if (shouldIncludeCompetenzeGross) calculatedTotal += competenzeSum;

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Step 1: Commissioni Base */}
                    <div className={styles.inspectorSection}>
                      <h4>1️⃣ Movimenti classificati come "Commissioni" ({commissioniMovements.length})</h4>
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
                                € {(m.amount || 0).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))}
                          <tr style={{ fontWeight: 'bold', borderTop: '2px solid #cbd5e1' }}>
                            <td colSpan={2}>Totale (valore assoluto)</td>
                            <td>€ {commissioniSum.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Step 2: Bollo E/C */}
                    {shouldIncludeBollo && (
                      <div className={styles.inspectorSection}>
                        <h4>2️⃣ Imposta di Bollo E/C (dal 2023+{periodYear >= 2024 ? ', escluso Q1' : ''})</h4>
                        {bolloMovements.length > 0 ? (
                          <table className={styles.inspectorTable}>
                            <thead>
                              <tr>
                                <th>Data</th>
                                <th>Descrizione</th>
                                <th>Importo</th>
                              </tr>
                            </thead>
                            <tbody>
                              {bolloMovements.map((m: any, i: number) => (
                                <tr key={i}>
                                  <td>{renderVal(m.date)}</td>
                                  <td style={{ fontSize: '0.75rem', maxWidth: '400px' }}>{renderVal(m.description)}</td>
                                  <td className={styles.amountNegative}>
                                    € {(m.amount || 0).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              ))}
                              <tr style={{ fontWeight: 'bold', borderTop: '2px solid #cbd5e1' }}>
                                <td colSpan={2}>Totale (valore assoluto)</td>
                                <td>€ {bolloSum.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</td>
                              </tr>
                            </tbody>
                          </table>
                        ) : (
                          <p style={{ color: '#64748b', fontStyle: 'italic' }}>Nessun movimento trovato</p>
                        )}
                      </div>
                    )}

                    {/* Step 3: Tobin Tax */}
                    {shouldIncludeTobin && (
                      <div className={styles.inspectorSection}>
                        <h4>3️⃣ Tobin Tax (dal 2022+)</h4>
                        {tobinMovements.length > 0 ? (
                          <table className={styles.inspectorTable}>
                            <thead>
                              <tr>
                                <th>Data</th>
                                <th>Descrizione</th>
                                <th>Importo</th>
                              </tr>
                            </thead>
                            <tbody>
                              {tobinMovements.map((m: any, i: number) => (
                                <tr key={i}>
                                  <td>{renderVal(m.date)}</td>
                                  <td style={{ fontSize: '0.75rem', maxWidth: '400px' }}>{renderVal(m.description)}</td>
                                  <td className={styles.amountNegative}>
                                    € {(m.amount || 0).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              ))}
                              <tr style={{ fontWeight: 'bold', borderTop: '2px solid #cbd5e1' }}>
                                <td colSpan={2}>Totale (valore assoluto)</td>
                                <td>€ {tobinSum.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</td>
                              </tr>
                            </tbody>
                          </table>
                        ) : (
                          <p style={{ color: '#64748b', fontStyle: 'italic' }}>Nessun movimento trovato</p>
                        )}
                      </div>
                    )}

                    {/* Step 4: Competenze */}
                    {shouldIncludeCompetenzeGross && (
                      <div className={styles.inspectorSection}>
                        <h4>4️⃣ Competenze Fruttifere/Chiusura (dal 2017+, escluso Q1)</h4>
                        <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '10px' }}>
                          Le competenze positive compensano le commissioni nel calcolo netto. Per ottenere il totale LORDO,
                          vengono aggiunte nuovamente al calcolo.
                        </p>
                        {competenzeMovements.length > 0 ? (
                          <table className={styles.inspectorTable}>
                            <thead>
                              <tr>
                                <th>Data</th>
                                <th>Descrizione</th>
                                <th>Importo</th>
                              </tr>
                            </thead>
                            <tbody>
                              {competenzeMovements.map((m: any, i: number) => (
                                <tr key={i}>
                                  <td>{renderVal(m.date)}</td>
                                  <td style={{ fontSize: '0.75rem', maxWidth: '400px' }}>{renderVal(m.description)}</td>
                                  <td className={styles.amountPositive}>
                                    € {(m.amount || 0).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              ))}
                              <tr style={{ fontWeight: 'bold', borderTop: '2px solid #cbd5e1' }}>
                                <td colSpan={2}>Totale</td>
                                <td>€ {competenzeSum.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</td>
                              </tr>
                            </tbody>
                          </table>
                        ) : (
                          <p style={{ color: '#64748b', fontStyle: 'italic' }}>Nessun movimento trovato</p>
                        )}
                      </div>
                    )}

                    {/* Calcolo Finale */}
                    <div className={styles.inspectorSection} style={{ backgroundColor: '#f1f5f9', padding: '20px', borderRadius: '8px' }}>
                      <h4>📊 Calcolo Finale</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.95rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Commissioni base:</span>
                          <span>€ {commissioniSum.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</span>
                        </div>
                        {shouldIncludeBollo && (
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>+ Bollo E/C:</span>
                            <span>€ {bolloSum.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</span>
                          </div>
                        )}
                        {shouldIncludeTobin && (
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>+ Tobin Tax:</span>
                            <span>€ {tobinSum.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</span>
                          </div>
                        )}
                        {shouldIncludeCompetenzeGross && competenzeSum > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>+ Competenze (lordo):</span>
                            <span>€ {competenzeSum.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.1rem', borderTop: '2px solid #94a3b8', paddingTop: '10px', marginTop: '10px' }}>
                          <span>TOTALE COMMISSIONI:</span>
                          <span style={{ color: '#ef4444' }}>€ {calculatedTotal.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#64748b', marginTop: '5px' }}>
                          <span>Valore da costs_breakdown:</span>
                          <span>€ {(totalCommissions || 0).toLocaleString('it-IT', { minimumFractionDigits: 2 })}</span>
                        </div>
                        {Math.abs(calculatedTotal - (totalCommissions || 0)) > 0.01 && (
                          <div style={{ padding: '10px', backgroundColor: '#fef2f2', borderLeft: '4px solid #ef4444', marginTop: '10px' }}>
                            <strong style={{ color: '#dc2626' }}>⚠️ Attenzione:</strong> Differenza di €{Math.abs(calculatedTotal - (totalCommissions || 0)).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Regole Applicate */}
                    <div className={styles.inspectorSection}>
                      <h4>📜 Regole Applicate</h4>
                      <ul style={{ fontSize: '0.9rem', color: '#64748b', lineHeight: '1.6' }}>
                        <li><strong>2024+:</strong> Normalizzazione spese E/C-Comunicazioni a €0.70 (solo E/C)</li>
                        <li><strong>2023+:</strong> Inclusione Imposta di Bollo E/C{periodYear >= 2024 && ' (escluso Q1)'}</li>
                        <li><strong>2022+:</strong> Inclusione Tobin Tax (Imposta transazioni finanziarie)</li>
                        <li><strong>2017+:</strong> Calcolo LORDO con riaggiunta competenze positive (escluso Q1)</li>
                        <li><strong>Pre-2017 o Q1:</strong> Calcolo NETTO (competenze come offset)</li>
                      </ul>
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
