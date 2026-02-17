'use client'

import { createContext, useContext, useState, useRef, useCallback, useEffect, type ReactNode } from 'react'
import { normalizeHolder } from '@/lib/utils'

// Extract date from filename for chronological sorting
// Handles patterns like "190331 31_03_2019_..." or "200630_..."
function extractDateFromFilename(name: string): number {
  // Try YYMMDD at start of filename (e.g., "190331 ...")
  const yymmdd = name.match(/^(\d{6})/)
  if (yymmdd) return parseInt(yymmdd[1])
  // Try DD_MM_YYYY pattern (e.g., "31_03_2019")
  const ddmmyyyy = name.match(/(\d{2})_(\d{2})_(\d{4})/)
  if (ddmmyyyy) return parseInt(ddmmyyyy[3].slice(2) + ddmmyyyy[2] + ddmmyyyy[1])
  return 999999 // unknown dates go last
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface UploadingFile {
  id: string
  name: string
  status: 'queued' | 'uploading' | 'analyzing' | 'done' | 'error'
  progress: number
  error?: string
  index?: number
  total?: number
  stage?: string
  startTime?: number
  holder?: string
}

type OnSuccessCallback = (analysisId?: string, holder?: string) => void | Promise<void>

interface UploadContextValue {
  uploadQueue: UploadingFile[]
  isProcessing: boolean
  hasActiveUploads: boolean
  activeHolder: string | null
  completedCount: number
  totalCount: number
  overallProgress: number
  addFilesToQueue: (files: FileList | File[], userId: string, holder?: string) => void
  registerOnSuccess: (cb: OnSuccessCallback) => () => void
  setUploadQueue: React.Dispatch<React.SetStateAction<UploadingFile[]>>
}

const UploadContext = createContext<UploadContextValue | null>(null)

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useUpload() {
  const ctx = useContext(UploadContext)
  if (!ctx) throw new Error('useUpload must be used within <UploadProvider>')
  return ctx
}

// ── Provider ───────────────────────────────────────────────────────────────────

export function UploadProvider({ children }: { children: ReactNode }) {
  const [uploadQueue, setUploadQueue] = useState<UploadingFile[]>([])
  const [isProcessing, setIsProcessing] = useState(false)

  const fileQueueRef = useRef<{ id: string; file: File; userId: string }[]>([])
  const currentFileIndexRef = useRef<number>(0)
  const onSuccessCallbacks = useRef<Set<OnSuccessCallback>>(new Set())
  const activeHolderRef = useRef<string | null>(null)

  // ── Derived state ──────────────────────────────────────────────────────────

  const hasActiveUploads = uploadQueue.some(
    f => f.status === 'uploading' || f.status === 'analyzing' || f.status === 'queued'
  ) || isProcessing

  const activeHolder = activeHolderRef.current
  const completedCount = uploadQueue.filter(f => f.status === 'done').length
  const totalCount = uploadQueue.length

  const overallProgress = totalCount > 0
    ? Math.round(uploadQueue.reduce((sum, f) => sum + f.progress, 0) / totalCount)
    : 0

  // ── Callback registration (multiple consumers) ─────────────────────────────

  const registerOnSuccess = useCallback((cb: OnSuccessCallback) => {
    onSuccessCallbacks.current.add(cb)
    // Return unregister function
    return () => { onSuccessCallbacks.current.delete(cb) }
  }, [])

  // ── Process queue ─────────────────────────────────────────────────────────

  const processQueue = useCallback(async () => {
    if (isProcessing || fileQueueRef.current.length === 0) return

    setIsProcessing(true)

    if (!isProcessing && uploadQueue.length === 0) {
      currentFileIndexRef.current = 0
    }

    let lastHolder: string | null = null
    let successCount = 0

    const processOneFile = async (fileId: string, file: File, userId: string) => {
      setUploadQueue(prev => prev.map(f => {
        if (f.id !== fileId) return f
        return { ...f, status: f.status === 'done' ? f.status : 'uploading' as const, progress: f.status === 'done' ? 100 : Math.max(f.progress, 5) }
      }))

      try {
        const uploadStartTime = Date.now()
        const expectedDuration = 90
        const progressInterval = setInterval(() => {
          setUploadQueue(prev => prev.map(f => {
            if (f.id === fileId && (f.status === 'uploading' || f.status === 'analyzing')) {
              const elapsed = (Date.now() - uploadStartTime) / 1000
              const stages = [
                [0, 'Caricamento PDF'],
                [5, 'Conversione documento'],
                [10, 'Invio a Gemini AI'],
                [15, 'Analisi AI in corso'],
                [30, 'Estrazione movimenti'],
                [45, 'Lettura portafoglio titoli'],
                [55, 'Validazione dati'],
                [65, 'Calcolo commissioni'],
                [75, 'Controllo coerenza'],
                [85, 'Normalizzazione dati'],
                [95, 'Finalizzazione'],
              ] as const
              const dots = '.'.repeat((Math.floor(elapsed) % 3) + 1)
              const currentStage = [...stages].reverse().find(([t]) => elapsed >= t)?.[1] || stages[0][1]
              const ratio = elapsed / expectedDuration
              const progress = Math.min(98, Math.round(98 * (1 - Math.exp(-2.5 * ratio))))
              return { ...f, progress, stage: currentStage + dots + ` (${Math.floor(elapsed)}s)`, startTime: uploadStartTime }
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
        formData.append('userId', userId)

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10 * 60 * 1000)

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

        clearInterval(progressInterval)
        const responseText = await response.text()
        let result: any
        try {
          result = JSON.parse(responseText)
        } catch {
          // Server returned non-JSON (HTML error page, timeout, etc.)
          throw new Error(responseText?.substring(0, 120) || `Errore server (HTTP ${response.status})`)
        }

        const onFileSuccess = async (analysisId?: string, holder?: string) => {
          if (holder) {
            lastHolder = holder
            activeHolderRef.current = normalizeHolder(holder)
          }
          successCount++
          // Update the file entry with holder info
          if (holder) {
            setUploadQueue(prev => prev.map(f =>
              f.id === fileId ? { ...f, holder: normalizeHolder(holder) } : f
            ))
          }
          // Call all registered callbacks
          for (const cb of onSuccessCallbacks.current) {
            try { await cb(analysisId, holder) } catch {}
          }
        }

        if (result.success) {
          setUploadQueue(prev => prev.map(f =>
            f.id === fileId ? { ...f, status: 'done' as const, progress: 100 } : f
          ))
          await onFileSuccess(result.analysisId, result.holder)

        } else if (result.isDuplicate && response.status === 409) {
          setUploadQueue(prev => prev.map(f =>
            f.id === fileId ? { ...f, status: 'uploading' as const, progress: 5, stage: 'Ricalcolo...' } : f
          ))
          formData.append('force', 'true')
          if (result.existingAnalysisId) formData.append('replaceAnalysisId', result.existingAnalysisId)
          const retryController = new AbortController()
          const retryTimeoutId = setTimeout(() => retryController.abort(), 600000)
          const retryStartTime = Date.now()
          const retryProgressInterval = setInterval(() => {
            setUploadQueue(prev => prev.map(f => {
              if (f.id !== fileId || f.status !== 'uploading') return f
              const elapsed = Date.now() - retryStartTime
              const progress = Math.min(95, Math.round(5 + 90 * (1 - Math.exp(-elapsed / 120000))))
              return { ...f, progress }
            }))
          }, 1000)
          try {
            const retryResponse = await fetch('/api/parse-pdf', { method: 'POST', body: formData, signal: retryController.signal })
            clearTimeout(retryTimeoutId)
            clearInterval(retryProgressInterval)
            const retryText = await retryResponse.text()
            let retryResult: any
            try { retryResult = JSON.parse(retryText) }
            catch { throw new Error(retryText?.substring(0, 120) || `Errore server (HTTP ${retryResponse.status})`) }
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
          } catch (retryErr: any) {
            clearTimeout(retryTimeoutId)
            clearInterval(retryProgressInterval)
            setUploadQueue(prev => prev.map(f =>
              f.id === fileId ? { ...f, status: 'error' as const, progress: 0, error: retryErr.name === 'AbortError' ? 'Timeout ricalcolo' : retryErr.message } : f
            ))
          }
        } else if (result.error?.includes('rate') || result.error?.includes('limit') || result.error?.includes('429')) {
          setUploadQueue(prev => prev.map(f =>
            f.id === fileId ? { ...f, status: 'queued' as const, progress: 0, error: 'Rate limit - riprovo...' } : f
          ))
          fileQueueRef.current.push({ id: fileId, file, userId })
          await new Promise(resolve => setTimeout(resolve, 20000))
        } else {
          setUploadQueue(prev => prev.map(f =>
            f.id === fileId ? { ...f, status: 'error' as const, progress: 0, error: result.error } : f
          ))
        }
      } catch (error: any) {
        const errorMsg = error.name === 'AbortError'
          ? 'Timeout: l\'analisi ha superato 10 minuti. Riprova.'
          : (error.message || 'Errore di rete')
        setUploadQueue(prev => prev.map(f =>
          f.id === fileId ? { ...f, status: 'error' as const, progress: 0, error: errorMsg } : f
        ))
      }
    }

    // Parallel with concurrency limit of 3 with stagger delay to spread Gemini API calls
    const PARALLEL_LIMIT = 3
    const executing = new Set<Promise<void>>()
    while (fileQueueRef.current.length > 0) {
      const item = fileQueueRef.current.shift()
      if (!item) break
      currentFileIndexRef.current++
      // Stagger starts by 2s to spread Gemini API calls and reduce rate limit pressure
      if (executing.size > 0) {
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
      const p = processOneFile(item.id, item.file, item.userId).then(() => { executing.delete(p) })
      executing.add(p)
      if (executing.size >= PARALLEL_LIMIT) {
        await Promise.race(executing)
      }
    }
    await Promise.all(executing)

    setIsProcessing(false)

    // Clear completed files after 5 seconds
    setTimeout(() => {
      setUploadQueue(prev => prev.filter(f => f.status !== 'done'))
    }, 5000)
  }, [isProcessing, uploadQueue.length])

  // ── Prevent page close during active uploads ─────────────────────────────

  useEffect(() => {
    if (!hasActiveUploads) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasActiveUploads])

  // ── Auto-trigger queue processing ─────────────────────────────────────────

  useEffect(() => {
    if (!isProcessing && fileQueueRef.current.length > 0) {
      const timer = setTimeout(() => {
        if (!isProcessing && fileQueueRef.current.length > 0) {
          processQueue()
        }
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [isProcessing, processQueue, uploadQueue])

  // ── addFilesToQueue ───────────────────────────────────────────────────────

  const addFilesToQueue = useCallback((files: FileList | File[], userId: string, holder?: string) => {
    const newFiles: UploadingFile[] = []
    const filesToProcess: { id: string; file: File; userId: string }[] = []

    Array.from(files).forEach((file, index) => {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
      if (isPdf) {
        const fileId = `${file.name}-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 9)}`
        newFiles.push({
          id: fileId,
          name: file.name,
          status: 'queued',
          progress: 0,
          holder: holder ? normalizeHolder(holder) : undefined,
        })
        filesToProcess.push({ id: fileId, file, userId })
      }
    })

    if (newFiles.length === 0) {
      alert('Per favore carica solo file PDF')
      return
    }

    if (holder) {
      activeHolderRef.current = normalizeHolder(holder)
    }

    setUploadQueue(prev => {
      const combined = [...prev, ...newFiles]
      return combined.map((f, i) => ({
        ...f,
        index: i + 1,
        total: combined.length
      }))
    })
    // Sort chronologically so earlier periods are processed first
    // This ensures predecessors exist when Phase C checks coherence
    filesToProcess.sort((a, b) => extractDateFromFilename(a.file.name) - extractDateFromFilename(b.file.name))
    fileQueueRef.current.push(...filesToProcess)
  }, [])

  // ── Context value ─────────────────────────────────────────────────────────

  const value: UploadContextValue = {
    uploadQueue,
    isProcessing,
    hasActiveUploads,
    activeHolder,
    completedCount,
    totalCount,
    overallProgress,
    addFilesToQueue,
    registerOnSuccess,
    setUploadQueue,
  }

  return <UploadContext.Provider value={value}>{children}</UploadContext.Provider>
}
