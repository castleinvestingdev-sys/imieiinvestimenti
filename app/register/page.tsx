'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function RegisterPage() {
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [passwordConfirm, setPasswordConfirm] = useState('')
    const [terms, setTerms] = useState(false)
    const [newsletter, setNewsletter] = useState(false)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const router = useRouter()
    const supabase = createClient()

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')

        if (password !== passwordConfirm) {
            setError('Le password non corrispondono')
            return
        }

        if (!terms) {
            setError('Devi accettare i Termini e Condizioni')
            return
        }

        setLoading(true)

        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    name,
                    newsletter,
                },
            },
        })

        if (error) {
            setError(error.message)
            setLoading(false)
            return
        }

        alert('Registrazione completata! Verifica la tua email.')
        router.push('/dashboard')
    }

    const benefits = [
        {
            title: 'Analisi Illimitate',
            desc: 'Carica e analizza tutti i tuoi estratti conto senza limiti di quantità.',
            icon: '📊'
        },
        {
            title: 'Dashboard Privata',
            desc: 'Un centro di controllo unico per monitorare tutti i tuoi portafogli bancari.',
            icon: '🔐'
        },
        {
            title: 'Report Indipendenti',
            desc: 'Documenti chiari e ricalcolati da zero, lontani dagli interessi della banca.',
            icon: '📑'
        }
    ]

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            backgroundColor: '#FFFFFF',
            marginTop: '-86px',
            position: 'relative',
            zIndex: 10,
        }}>

            {/* Left Column: Register Form */}
            <div style={{
                flex: '1',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '2rem',
                backgroundColor: '#FFFFFF',
            }}>
                <div style={{ width: '100%', maxWidth: '440px', padding: '40px 0' }}>



                    <div style={{ marginBottom: '32px' }}>
                        <h1 style={{
                            fontSize: '1.875rem',
                            fontWeight: 700,
                            color: '#111827',
                            marginBottom: '8px'
                        }}>Inizia ora</h1>
                        <p style={{ color: '#4B5563', fontSize: '0.975rem' }}>
                            Crea il tuo account gratuito e scopri la verità sui tuoi investimenti.
                        </p>
                        <p style={{ fontSize: '0.7rem', color: '#ccc', marginTop: '5px' }}>
                            Debug URL: {process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Loaded ✅' : 'Missing ❌'}
                        </p>
                    </div>

                    {error && (
                        <div style={{
                            backgroundColor: '#FEF2F2',
                            border: '1px solid #FCA5A5',
                            padding: '12px 16px',
                            borderRadius: '8px',
                            color: '#991B1B',
                            fontSize: '0.875rem',
                            marginBottom: '24px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <span>⚠️</span> {error}
                        </div>
                    )}

                    <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                        <div>
                            <label htmlFor="name" style={{
                                display: 'block',
                                fontSize: '0.875rem',
                                fontWeight: 600,
                                color: '#374151',
                                marginBottom: '6px'
                            }}>Nome Completo</label>
                            <input
                                id="name"
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Mario Rossi"
                                required
                                style={{
                                    width: '100%',
                                    padding: '10px 14px',
                                    borderRadius: '10px',
                                    border: '1px solid #D1D5DB',
                                    fontSize: '1rem',
                                    outline: 'none',
                                    transition: 'all 0.2s',
                                    boxSizing: 'border-box'
                                }}
                                className="input-field"
                            />
                        </div>

                        <div>
                            <label htmlFor="email" style={{
                                display: 'block',
                                fontSize: '0.875rem',
                                fontWeight: 600,
                                color: '#374151',
                                marginBottom: '6px'
                            }}>Email</label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="nome@esempio.it"
                                required
                                style={{
                                    width: '100%',
                                    padding: '10px 14px',
                                    borderRadius: '10px',
                                    border: '1px solid #D1D5DB',
                                    fontSize: '1rem',
                                    outline: 'none',
                                    transition: 'all 0.2s',
                                    boxSizing: 'border-box'
                                }}
                                className="input-field"
                            />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div>
                                <label htmlFor="password" style={{
                                    display: 'block',
                                    fontSize: '0.875rem',
                                    fontWeight: 600,
                                    color: '#374151',
                                    marginBottom: '6px'
                                }}>Password</label>
                                <input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                    style={{
                                        width: '100%',
                                        padding: '10px 14px',
                                        borderRadius: '10px',
                                        border: '1px solid #D1D5DB',
                                        fontSize: '1rem',
                                        outline: 'none',
                                        transition: 'all 0.2s',
                                        boxSizing: 'border-box'
                                    }}
                                    className="input-field"
                                />
                            </div>
                            <div>
                                <label htmlFor="passwordConfirm" style={{
                                    display: 'block',
                                    fontSize: '0.875rem',
                                    fontWeight: 600,
                                    color: '#374151',
                                    marginBottom: '6px'
                                }}>Conferma</label>
                                <input
                                    id="passwordConfirm"
                                    type="password"
                                    value={passwordConfirm}
                                    onChange={(e) => setPasswordConfirm(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                    style={{
                                        width: '100%',
                                        padding: '10px 14px',
                                        borderRadius: '10px',
                                        border: '1px solid #D1D5DB',
                                        fontSize: '1rem',
                                        outline: 'none',
                                        transition: 'all 0.2s',
                                        boxSizing: 'border-box'
                                    }}
                                    className="input-field"
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                            <label style={{ display: 'flex', gap: '10px', cursor: 'pointer', fontSize: '0.875rem', color: '#4B5563' }}>
                                <input
                                    type="checkbox"
                                    checked={terms}
                                    onChange={(e) => setTerms(e.target.checked)}
                                    required
                                    style={{ accentColor: '#00C853', width: '16px', height: '16px' }}
                                />
                                <span>Accetto i <Link href="/termini" style={{ color: '#00C853', fontWeight: 600 }}>Termini</Link> e la <Link href="/privacy" style={{ color: '#00C853', fontWeight: 600 }}>Privacy Policy</Link></span>
                            </label>

                            <label style={{ display: 'flex', gap: '10px', cursor: 'pointer', fontSize: '0.875rem', color: '#4B5563' }}>
                                <input
                                    type="checkbox"
                                    checked={newsletter}
                                    onChange={(e) => setNewsletter(e.target.checked)}
                                    style={{ accentColor: '#00C853', width: '16px', height: '16px' }}
                                />
                                <span>Desidero ricevere aggiornamenti e consigli finanziari</span>
                            </label>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                width: '100%',
                                padding: '14px',
                                backgroundColor: loading ? '#9CA3AF' : '#111827',
                                color: '#FFFFFF',
                                borderRadius: '10px',
                                fontSize: '1rem',
                                fontWeight: 600,
                                border: 'none',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                transition: 'background-color 0.2s',
                                marginTop: '10px'
                            }}
                        >
                            {loading ? 'Preparazione account...' : 'Registrati ora'}
                        </button>
                    </form>

                    <p style={{
                        marginTop: '28px',
                        textAlign: 'center',
                        fontSize: '0.875rem',
                        color: '#6B7280'
                    }}>
                        Hai già un account?{' '}
                        <Link href="/login" style={{
                            fontWeight: 700,
                            color: '#00C853',
                            textDecoration: 'none'
                        }}>Accedi</Link>
                    </p>
                </div>
            </div>

            {/* Right Column: Benefits/Branding */}
            <div style={{
                flex: '1.2',
                backgroundColor: '#F9FAFB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4rem',
                position: 'relative',
                overflow: 'hidden',
                borderLeft: '1px solid #E5E7EB'
            }}>
                {/* Subtle background pattern */}
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    opacity: 0.4,
                    backgroundImage: 'radial-gradient(#00C853 0.5px, transparent 0.5px)',
                    backgroundSize: '24px 24px'
                }} />

                <div style={{ position: 'relative', zIndex: 1, maxWidth: '500px' }}>
                    <h2 style={{
                        fontSize: '2.5rem',
                        fontWeight: 800,
                        color: '#111827',
                        lineHeight: 1.1,
                        marginBottom: '32px',
                        letterSpacing: '-1px'
                    }}>
                        Investi con <br />
                        <span style={{ color: '#00C853' }}>totale consapevolezza.</span>
                    </h2>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                        {benefits.map((benefit, index) => (
                            <div key={index} style={{ display: 'flex', gap: '20px' }}>
                                <div style={{
                                    width: '48px',
                                    height: '48px',
                                    borderRadius: '14px',
                                    backgroundColor: '#FFFFFF',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '1.5rem',
                                    boxShadow: '0 4px 10px rgba(0,0,0,0.03)',
                                    border: '1px solid #F3F4F6',
                                    flexShrink: 0
                                }}>
                                    {benefit.icon}
                                </div>
                                <div>
                                    <h4 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827', marginBottom: '6px' }}>
                                        {benefit.title}
                                    </h4>
                                    <p style={{ fontSize: '0.95rem', color: '#4B5563', lineHeight: 1.5 }}>
                                        {benefit.desc}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Social Proof */}
                    <div style={{
                        marginTop: '56px',
                        paddingTop: '32px',
                        borderTop: '1px solid #E5E7EB',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px'
                    }}>
                        <div style={{ display: 'flex', marginLeft: '4px' }}>
                            {[1, 2, 3, 4].map((i) => (
                                <div key={i} style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '50%',
                                    border: '2px solid #F9FAFB',
                                    backgroundColor: '#E5E7EB',
                                    marginLeft: i === 1 ? 0 : '-12px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    color: '#6B7280'
                                }}>U{i}</div>
                            ))}
                        </div>
                        <p style={{ fontSize: '0.875rem', color: '#6B7280', fontWeight: 500 }}>
                            Oltre <span style={{ color: '#111827', fontWeight: 700 }}>2.500 utenti</span> analizzano i loro conti ogni mese.
                        </p>
                    </div>
                </div>
            </div>

            <style jsx>{`
        .input-field:focus {
          border-color: #00C853 !important;
          box-shadow: 0 0 0 4px rgba(0, 200, 83, 0.1);
        }
        @media (max-width: 1024px) {
          div:first-child > div:last-child {
            display: none !important;
          }
        }
      `}</style>
        </div>
    )
}
