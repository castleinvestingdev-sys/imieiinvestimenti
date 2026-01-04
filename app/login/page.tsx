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

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      backgroundColor: '#FFFFFF',
      marginTop: '-86px', // Offset of the header height
      position: 'relative',
      zIndex: 10,
    }}>

      {/* Left Column: The Form */}
      <div style={{
        flex: '1',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '2rem',
        backgroundColor: '#FFFFFF',
      }}>
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
        @media (max-width: 1024px) {
          div:first-child > div:last-child {
            display: none !important;
          }
        }
      `}</style>
    </div>
  )
}
