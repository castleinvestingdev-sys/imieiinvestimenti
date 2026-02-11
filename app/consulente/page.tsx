'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import styles from './Consulente.module.css'

// Normalize holder name: "FRIGERI MARIA CRISTINA" → "Frigeri Maria Cristina"
function normalizeHolderName(raw: string): string {
  if (!raw) return 'Cliente Sconosciuto'
  return raw.trim().replace(/\s+/g, ' ').split(' ').map(
    w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  ).join(' ')
}

interface ClientData {
  holder: string
  documentCount: number
  banks: string[]
  totalValue: number
  lastUpdate: string
}

export default function ConsulentePage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [clients, setClients] = useState<ClientData[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStage, setUploadStage] = useState('')
  const [uploadFileName, setUploadFileName] = useState('')
  const [uploadCurrent, setUploadCurrent] = useState(0)
  const [uploadTotal, setUploadTotal] = useState(0)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUser(user)
      await fetchClients(user.id)
      setLoading(false)
    }
    getUser()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchClients = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('analyses')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)

    if (error) {
      console.error('Error fetching analyses:', error)
      return
    }

    // Group by holder
    const clientsMap = new Map<string, ClientData>()

    data?.forEach((analysis: any) => {
      const holder = normalizeHolderName(analysis.costs_breakdown?.holder)
      const existing = clientsMap.get(holder)

      if (existing) {
        existing.documentCount++
        if (!existing.banks.includes(analysis.bank_name)) {
          existing.banks.push(analysis.bank_name)
        }
        existing.totalValue += analysis.portfolio_value || 0
        if (new Date(analysis.created_at) > new Date(existing.lastUpdate)) {
          existing.lastUpdate = analysis.created_at
        }
      } else {
        clientsMap.set(holder, {
          holder,
          documentCount: 1,
          banks: [analysis.bank_name],
          totalValue: analysis.portfolio_value || 0,
          lastUpdate: analysis.created_at
        })
      }
    })

    setClients(Array.from(clientsMap.values()).sort((a, b) =>
      a.holder.localeCompare(b.holder)
    ))
  }, [supabase])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf')
    if (files.length > 0) {
      await uploadFiles(files)
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type === 'application/pdf')
    if (files.length > 0) {
      await uploadFiles(files)
    }
  }

  const uploadFiles = async (files: File[]) => {
    if (!user) return

    setUploading(true)
    setUploadTotal(files.length)

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setUploadCurrent(i + 1)
      setUploadFileName(file.name)
      setUploadProgress(0)
      setUploadStage('Caricamento PDF...')

      const startTime = Date.now()

      // Progress animation with stage updates
      const progressInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000)

        // Update stage based on elapsed time
        if (elapsed < 2) {
          setUploadStage('Caricamento PDF...')
          setUploadProgress(Math.min(10, elapsed * 5))
        } else if (elapsed < 5) {
          setUploadStage('Conversione documento...')
          setUploadProgress(Math.min(25, 10 + (elapsed - 2) * 5))
        } else if (elapsed < 10) {
          setUploadStage('Invio a Gemini AI...')
          setUploadProgress(Math.min(40, 25 + (elapsed - 5) * 3))
        } else if (elapsed < 30) {
          setUploadStage('Analisi AI in corso...')
          setUploadProgress(Math.min(80, 40 + (elapsed - 10) * 2))
        } else if (elapsed < 60) {
          setUploadStage('Elaborazione dati...')
          setUploadProgress(Math.min(90, 80 + (elapsed - 30) * 0.33))
        } else {
          setUploadStage('Quasi finito...')
          setUploadProgress(Math.min(95, 90 + (elapsed - 60) * 0.1))
        }
      }, 200)

      try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('userId', user.id)
        formData.append('email', user.email || '')

        const response = await fetch('/api/parse-pdf', {
          method: 'POST',
          body: formData
        })

        clearInterval(progressInterval)

        const result = await response.json()

        if (result.success) {
          setUploadStage('Completato!')
          setUploadProgress(100)
        } else {
          setUploadStage(`Errore: ${result.error}`)
          console.error('Error uploading:', result.error)
        }

        // Brief pause to show completion
        await new Promise(resolve => setTimeout(resolve, 500))
      } catch (error) {
        clearInterval(progressInterval)
        setUploadStage('Errore di connessione')
        console.error('Upload error:', error)
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    setUploading(false)
    setUploadProgress(0)
    setUploadStage('')
    setUploadFileName('')

    // Refresh clients list
    await fetchClients(user.id)
  }

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Caricamento...</p>
      </div>
    )
  }

  return (
    <main className={styles.consulenteWrapper}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <Link href="/" className={styles.backToSite}>
            ← Torna al sito
          </Link>
          <div className={styles.logoCenter}>
            <span className={styles.logoGreen}>i</span>MieiInvestimenti
          </div>
          <div className={styles.userInfo}>
            <span>{user?.email}</span>
            <button
              className={styles.logoutBtn}
              onClick={async () => {
                await supabase.auth.signOut()
                router.push('/')
              }}
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className={styles.mainContent}>
        <div className={styles.pageHeader}>
          <h1>I Miei Portafogli</h1>
          <p>Carica gli estratti conto per analizzare i tuoi investimenti</p>
        </div>

        {/* Upload Area */}
        <div
          className={`${styles.uploadArea} ${isDragging ? styles.dragging : ''} ${uploading ? styles.uploading : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !uploading && document.getElementById('file-input')?.click()}
        >
          <input
            type="file"
            id="file-input"
            accept=".pdf"
            multiple
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          {uploading ? (
            <div className={styles.progressContainer}>
              <div className={styles.progressHeader}>
                <span className={styles.progressIcon}>📄</span>
                <div className={styles.progressInfo}>
                  <div className={styles.progressFileName}>{uploadFileName}</div>
                  <div className={styles.progressMeta}>
                    File {uploadCurrent} di {uploadTotal} • {uploadStage}
                  </div>
                </div>
                <div className={styles.progressPercent}>{Math.round(uploadProgress)}%</div>
              </div>
              <div className={styles.progressBarContainer}>
                <div
                  className={styles.progressBar}
                  style={{ width: `${uploadProgress}%` }}
                >
                  {uploadProgress < 100 && <div className={styles.progressShine}></div>}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className={styles.uploadIcon}>+</div>
              <p><strong>Trascina qui i PDF degli Estratti Conto</strong> o clicca per selezionare</p>
              <span>Carica il PDF originale scaricato dalla banca. Gli intestatari verranno creati automaticamente.</span>
            </>
          )}
        </div>

        {/* Clients Grid */}
        <div className={styles.clientsSection}>
          <h2>Intestatari ({clients.length})</h2>

          {clients.length === 0 ? (
            <div className={styles.emptyState}>
              <p>Nessun intestatario trovato</p>
              <span>Carica un PDF per creare automaticamente la sezione dell'intestatario</span>
            </div>
          ) : (
            <div className={styles.clientsGrid}>
              {clients.map((client, index) => (
                <Link
                  key={index}
                  href={`/dashboard?cliente=${encodeURIComponent(client.holder)}`}
                  className={styles.clientCard}
                >
                  <div className={styles.clientAvatar}>
                    {client.holder.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                  </div>
                  <div className={styles.clientInfo}>
                    <h3>{client.holder}</h3>
                    <div className={styles.clientStats}>
                      <span>{client.documentCount} documenti</span>
                      <span>{client.banks.length} {client.banks.length === 1 ? 'banca' : 'banche'}</span>
                    </div>
                    <div className={styles.clientValue}>
                      Valore totale: <strong>€{client.totalValue.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</strong>
                    </div>
                  </div>
                  <div className={styles.clientArrow}>→</div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
