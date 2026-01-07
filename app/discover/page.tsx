'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import './discover.css'

export default function DiscoverPage() {
    const [file, setFile] = useState<File | null>(null)
    const [email, setEmail] = useState('')
    const [isDragging, setIsDragging] = useState(false)
    const [fullPageDragCounter, setFullPageDragCounter] = useState(0)
    const [isUploading, setIsUploading] = useState(false)
    const [isSuccess, setIsSuccess] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const router = useRouter()
    const supabase = createClient()

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

        const droppedFile = e.dataTransfer.files[0]
        if (droppedFile && droppedFile.type === 'application/pdf') {
            setFile(droppedFile)
            setError(null)
        } else {
            setError('Per favore carica un file PDF valido.')
        }
    }

    useEffect(() => {
        const checkUser = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                router.push('/dashboard')
            }
        }
        checkUser()
    }, [router, supabase.auth])

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(true)
    }

    const handleDragLeave = () => {
        setIsDragging(false)
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
        const droppedFile = e.dataTransfer.files[0]
        if (droppedFile && droppedFile.type === 'application/pdf') {
            setFile(droppedFile)
            setError(null)
        } else {
            setError('Per favore carica un file PDF valido.')
        }
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0]
        if (selectedFile) {
            setFile(selectedFile)
            setError(null)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!file || !email) return

        setIsUploading(true)
        setError(null)

        const formData = new FormData()
        formData.append('file', file)
        formData.append('guestEmail', email)

        try {
            const response = await fetch('/api/parse-pdf', {
                method: 'POST',
                body: formData,
            })

            const result = await response.json()

            if (result.success) {
                setIsSuccess(true)
            } else {
                setError(result.error || 'Si è verificato un errore durante l\'analisi.')
            }
        } catch (err) {
            setError('Errore di connessione al server. Riprova più tardi.')
        } finally {
            setIsUploading(false)
        }
    }

    return (
        <div className="discover-page"
            onDragEnter={handleFullPageDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleFullPageDragLeave}
            onDrop={handleFullPageDrop}
        >
            {fullPageDragCounter > 0 && (
                <div className="fullPageOverlay">
                    <div className="fullPageOverlayContent">
                        <div className="fullPageDropIcon">↑</div>
                        <h2>Rilascia il PDF</h2>
                        <p>Inizieremo subito l&apos;analisi gratuita</p>
                    </div>
                </div>
            )}
            <div className="discover-container">
                {isSuccess ? (
                    <div className="success-card">
                        <span className="success-icon">🎯</span>
                        <h2>Analisi in corso!</h2>
                        <p>
                            Abbiamo ricevuto il tuo documento. Riceverai un report dettagliato all'indirizzo <strong>{email}</strong> non appena l'analisi sarà completata.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
                            <Link href="/register" className="submit-btn" style={{ textDecoration: 'none' }}>
                                Crea un account per gestire i tuoi report →
                            </Link>
                            <Link href="/" style={{ color: '#64748b', fontSize: '0.9rem', fontWeight: 600 }}>
                                Torna alla Home
                            </Link>
                        </div>
                    </div>
                ) : (
                    <>
                        <header className="discover-header">
                            <h1>Carica il tuo Estratto Conto</h1>
                            <p>
                                Ottieni un&apos;analisi <strong>gratuita</strong> e indipendente del tuo portafoglio titoli.
                                Scopri i costi nascosti e i rendimenti reali dei tuoi investimenti.
                            </p>
                        </header>

                        <div
                            className={`dropzone-container ${isDragging ? 'dragging' : ''}`}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                accept=".pdf"
                                style={{ display: 'none' }}
                            />

                            <div className="drop-icon-wrapper">
                                {file ? '📄' : '↑'}
                            </div>

                            {file ? (
                                <div className="file-preview">
                                    <span style={{ fontWeight: 700 }}>{file.name}</span>
                                    <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setFile(null); }}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}
                                    >
                                        ✕
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <span className="drop-label">Trascina il PDF qui</span>
                                    <span className="drop-sublabel">oppure clicca per sfogliare i tuoi file</span>
                                </>
                            )}
                        </div>

                        {error && (
                            <div style={{
                                backgroundColor: '#FEF2F2',
                                color: '#991B1B',
                                padding: '16px',
                                borderRadius: '16px',
                                marginBottom: '24px',
                                textAlign: 'center',
                                fontWeight: 500,
                                border: '1px solid #FCA5A5'
                            }}>
                                ⚠️ {error}
                            </div>
                        )}

                        <form className="discover-form" onSubmit={handleSubmit}>
                            <div className="input-group">
                                <label htmlFor="email">La tua migliore email</label>
                                <input
                                    type="email"
                                    id="email"
                                    className="email-input"
                                    placeholder="mario.rossi@esempio.it"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '4px 0 0 4px' }}>
                                    Ti invieremo il report PDF a questo indirizzo.
                                </p>
                            </div>

                            <button
                                type="submit"
                                className="submit-btn"
                                disabled={!file || !email || isUploading}
                            >
                                {isUploading ? 'Analisi in corso...' : 'Richiedi Analisi Gratuita →'}
                            </button>
                        </form>

                        <div className="secondary-cta">
                            <h3>Vuoi analizzare più anni?</h3>
                            <p style={{ marginBottom: '20px', color: '#64748b' }}>
                                Crea un account gratuito per caricare più documenti, visualizzare lo storico e monitorare l&apos;andamento dei tuoi costi nel tempo.
                            </p>
                            <Link href="/register" className="register-link">
                                Crea un account gratuito
                            </Link>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
