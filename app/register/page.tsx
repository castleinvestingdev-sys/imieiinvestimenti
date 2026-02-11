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

        const { data, error } = await supabase.auth.signUp({
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

        // Link guest analyses to the new user if they exist
        if (data.user) {
            try {
                await supabase
                    .from('analyses')
                    .update({ user_id: data.user.id, guest_email: null })
                    .eq('guest_email', email)
            } catch (linkError) {
                console.error('Error linking guest analyses:', linkError)
            }
        }

        alert('Registrazione completata! Verifica la tua email.')
        router.push('/consulente')
    }

    const handleSocialLogin = async (provider: 'google' | 'apple') => {
        if (provider === 'google') {
            const rootUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
            const options = {
                redirect_uri: `${window.location.origin}/auth/callback`,
                client_id: '220358867378-v1t5608r6917j7sq5q66si3bopgkfbkm.apps.googleusercontent.com',
                access_type: 'offline',
                response_type: 'code',
                prompt: 'select_account',
                scope: 'openid email profile',
            };

            const qs = new URLSearchParams(options).toString();
            window.location.href = `${rootUrl}?${qs}`;
            return;
        }

        const { error } = await supabase.auth.signInWithOAuth({
            provider,
            options: {
                redirectTo: `${window.location.origin}/auth/callback`,
            }
        })
        if (error) setError(error.message)
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
            // paddingTop removed to allow full bleed
            position: 'relative',
            zIndex: 10,
        }} className="register-container">

            {/* Left Column: Register Form */}
            <div style={{
                flex: '1',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '8rem 2rem 2rem', // Increased top padding for header
                backgroundColor: '#FFFFFF',
            }} className="register-form-side">
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

                    <div style={{ margin: '24px 0', display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ flex: 1, height: '1px', backgroundColor: '#E5E7EB' }} />
                        <span style={{ fontSize: '0.875rem', color: '#9CA3AF', fontWeight: 500 }}>oppure</span>
                        <div style={{ flex: 1, height: '1px', backgroundColor: '#E5E7EB' }} />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <button
                            onClick={() => handleSocialLogin('google')}
                            style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '12px',
                                padding: '12px',
                                backgroundColor: '#FFFFFF',
                                border: '1px solid #D1D5DB',
                                borderRadius: '10px',
                                fontSize: '0.95rem',
                                fontWeight: 600,
                                color: '#374151',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                            className="social-btn"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                            </svg>
                            Registrati con Google
                        </button>

                        <button
                            onClick={() => handleSocialLogin('apple')}
                            style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '12px',
                                padding: '12px',
                                backgroundColor: '#000000',
                                border: 'none',
                                borderRadius: '10px',
                                fontSize: '0.95rem',
                                fontWeight: 600,
                                color: '#FFFFFF',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                            className="social-btn"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M17.05 20.28c-.98.95-2.05 1.61-3.21 1.61-1.14 0-1.5-.68-2.86-.68-1.35 0-1.76.66-2.83.68-1.1.03-2.11-.64-3.12-1.61C2.96 18.25 1.5 14.81 1.5 11.7c0-3.07 1.99-4.7 3.93-4.7 1.02 0 1.83.42 2.51.42.66 0 1.25-.42 2.51-.42.98 0 1.94.31 2.7.94-2.86 1.15-2.39 5.31.62 6.56-1 2.37-2.22 4.41-3.67 5.88zM12.03 7.25c-.02-2.19 1.81-4.14 3.91-4.25.2.22.42.45.62.68 1.17 1.34 1.13 3.48-.12 4.19-.19-.19-.4-.38-.6-.56-1.12-1-3.04.59-3.81-.06z" />
                            </svg>
                            Registrati con Apple
                        </button>
                    </div>

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
                padding: '8rem 4rem 4rem', // Increased top padding for header
                position: 'relative',
                overflow: 'hidden',
                borderLeft: '1px solid #E5E7EB'
            }} className="register-benefits-side">
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
        .social-btn:hover {
          opacity: 0.9;
          transform: translateY(-1px);
        }
        .social-btn:active {
          transform: translateY(0);
        }
        @media (max-width: 1024px) {
          .register-container {
             flex-direction: column;
          }
          .register-benefits-side {
            display: none !important;
          }
          .register-form-side {
             flex: none;
             width: 100%;
             padding-top: 6rem !important; /* Adjusted for mobile header */
          }
        }
      `}</style>
        </div>
    )
}
