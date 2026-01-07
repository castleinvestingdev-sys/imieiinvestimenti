'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('E-mail o password non corretti. Riprova.')
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
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

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      backgroundColor: '#FFFFFF',
      // paddingTop removed to allow full bleed
      position: 'relative',
      zIndex: 10,
    }} className="login-container">

      {/* Left Column: The Form */}
      <div style={{
        flex: '1',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '8rem 2rem 2rem', // Increased top padding for header
        backgroundColor: '#FFFFFF',
      }} className="login-form-side">
        <div style={{ width: '100%', maxWidth: '400px' }}>

          <div style={{ marginBottom: '32px' }}>
            <h1 style={{
              fontSize: '1.875rem',
              fontWeight: 700,
              color: '#111827',
              marginBottom: '8px'
            }}>Benvenuto</h1>
            <p style={{ color: '#4B5563', fontSize: '0.975rem' }}>
              Accedi al tuo account per gestire le tue analisi finanziarie.
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

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
                  padding: '12px 16px',
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
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label htmlFor="password" style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: '#374151'
                }}>Password</label>
                <Link href="/forgot-password" style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: '#00C853',
                  textDecoration: 'none'
                }}>Smarrita?</Link>
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{
                  width: '100%',
                  padding: '12px 16px',
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

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '14px',
                backgroundColor: loading ? '#9CA3AF' : '#111827', // Use dark for professional feel
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
              {loading ? 'Accesso in corso...' : 'Accedi'}
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
              Accedi con Google
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
              Accedi con Apple
            </button>
          </div>

          <p style={{
            marginTop: '32px',
            textAlign: 'center',
            fontSize: '0.875rem',
            color: '#6B7280'
          }}>
            Non hai un account?{' '}
            <Link href="/register" style={{
              fontWeight: 700,
              color: '#00C853',
              textDecoration: 'none'
            }}>Registrati gratuitamente</Link>
          </p>
        </div>
      </div>

      {/* Right Column: Branding/Value Prop */}
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
      }} className="login-image-side">
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
            marginBottom: '24px',
            letterSpacing: '-1px'
          }}>
            Trasparenza bancaria <br />
            <span style={{ color: '#00C853' }}>senza compromessi.</span>
          </h2>

          <p style={{
            fontSize: '1.125rem',
            lineHeight: 1.6,
            color: '#4B5563',
            marginBottom: '40px'
          }}>
            Unisciti a migliaia di investitori che hanno già scoperto i costi nascosti dei loro portafogli.
            Analisi ricalcolate da zero, verificate e indipendenti.
          </p>

          {/* Testimonial Card */}
          <div style={{
            backgroundColor: '#FFFFFF',
            padding: '32px',
            borderRadius: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            border: '1px solid #F3F4F6'
          }}>
            <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
              {[1, 2, 3, 4, 5].map((s) => (
                <span key={s} style={{ color: '#F59E0B' }}>★</span>
              ))}
            </div>
            <p style={{
              fontSize: '1rem',
              fontWeight: 500,
              color: '#1F2937',
              fontStyle: 'italic',
              marginBottom: '20px',
              lineHeight: 1.5
            }}>
              &ldquo;iMieiInvestimenti mi ha permesso di capire esattamente dove finivano i miei soldi.
              Ho risparmiato oltre 2.500€ di commissioni orfane in soli 6 mesi.&rdquo;
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: '#F3F4F6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                color: '#6B7280',
                fontSize: '0.875rem'
              }}>GT</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#111827' }}>Giorgio T.</div>
                <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>Imprenditore</div>
              </div>
            </div>
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
          .login-container {
             flex-direction: column;
          }
          .login-image-side {
            display: none !important;
          }
          .login-form-side {
             flex: none;
             width: 100%;
             padding-top: 6rem !important; /* Adjusted for mobile header */
          }
        }
      `}</style>
    </div>
  )
}
