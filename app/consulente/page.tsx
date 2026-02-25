'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import styles from './Consulente.module.css'
import { normalizeHolder as normalizeHolderName, holdersMatch } from '@/lib/utils'
import { useUpload } from '@/contexts/UploadContext'

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
  const [clientsVersion, setClientsVersion] = useState(0) // increment to force grid re-creation
  const router = useRouter()
  const { addFilesToQueue, hasActiveUploads, registerOnSuccess } = useUpload()
  const supabase = createClient()
  const fetchVersionRef = useRef(0)
  const clientsHeaderRef = useRef<HTMLHeadingElement>(null)

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
    const version = ++fetchVersionRef.current
    const { data, error } = await supabase
      .from('analyses')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)

    // Ignore stale responses from concurrent fetchClients calls
    if (fetchVersionRef.current !== version) return

    if (error) {
      console.error('Error fetching analyses:', error)
      return
    }

    // Group by holder
    const clientsMap = new Map<string, ClientData>()

    data?.forEach((analysis: any) => {
      const holder = normalizeHolderName(analysis.costs_breakdown?.holder)
      // Find existing key that matches (exact or fuzzy prefix for truncated names)
      let matchKey: string | null = null
      for (const key of clientsMap.keys()) {
        if (holdersMatch(key, holder)) { matchKey = key; break }
      }

      if (matchKey) {
        const existing = clientsMap.get(matchKey)!
        // Keep the longer (more complete) name
        if (holder.length > matchKey.length) {
          clientsMap.delete(matchKey)
          existing.holder = holder
          clientsMap.set(holder, existing)
        }
        existing.documentCount++
        if (!existing.banks.some(b => b.toLowerCase() === (analysis.bank_name || '').toLowerCase())) {
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

    const sorted = Array.from(clientsMap.values()).sort((a, b) =>
      a.holder.localeCompare(b.holder)
    )
    setClients(sorted)
    setClientsVersion(v => v + 1) // force grid re-creation
  }, [supabase])

  // Register onSuccess: refresh client list when an upload completes
  useEffect(() => {
    if (!user) return
    const unregister = registerOnSuccess(async () => {
      await fetchClients(user.id)
    })
    return unregister
  }, [user, fetchClients, registerOnSuccess])

  // Direct DOM update for header — bypasses React reconciliation issues
  useEffect(() => {
    if (clientsHeaderRef.current) {
      clientsHeaderRef.current.textContent = `Intestatari (${clients.length})`
    }
  })

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (!user) return
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      addFilesToQueue(files, user.id)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user) return
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      addFilesToQueue(files, user.id)
    }
    if (e.target) e.target.value = ''
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
          className={`${styles.uploadArea} ${isDragging ? styles.dragging : ''} ${hasActiveUploads ? styles.uploading : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <input
            type="file"
            id="file-input"
            accept=".pdf"
            multiple
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <div className={styles.uploadIcon}>+</div>
          <p><strong>Trascina qui i PDF degli Estratti Conto</strong> o clicca per selezionare</p>
          <span>Carica il PDF originale scaricato dalla banca. Gli intestatari verranno creati automaticamente.</span>
        </div>

        {/* Clients Grid */}
        <div className={styles.clientsSection}>
          <h2 ref={clientsHeaderRef}>Intestatari ({clients.length})</h2>

          {clients.length === 0 ? (
            <div className={styles.emptyState}>
              <p>Nessun intestatario trovato</p>
              <span>Carica un PDF per creare automaticamente la sezione dell'intestatario</span>
            </div>
          ) : (
            <div className={styles.clientsGrid} key={`grid-v${clientsVersion}`}>
              {clients.map((client, index) => (
                <Link
                  key={`${client.holder}-${client.documentCount}`}
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
                      {client.banks.join(', ')}
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
