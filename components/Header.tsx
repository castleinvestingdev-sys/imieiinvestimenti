'use client'

import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'

export default function Header() {
  const [user, setUser] = useState<User | null>(null)
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
    }
    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    const handleScroll = () => {
      setScrolled(window.scrollY > 20)
    }
    window.addEventListener('scroll', handleScroll)

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)

    return () => {
      subscription.unsubscribe()
      window.removeEventListener('scroll', handleScroll)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [supabase.auth])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setMenuOpen(false)
    router.push('/')
    setUser(null)
  }

  const navLinkStyle: React.CSSProperties = {
    color: '#555',
    textDecoration: 'none',
    fontWeight: 500,
    fontSize: '0.85rem',
    padding: '8px 16px',
    borderRadius: '25px',
    transition: 'all 0.2s ease',
    whiteSpace: 'nowrap',
  }

  return (
    <>
      <header style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        padding: scrolled ? '10px 24px' : '16px 24px',
        transition: 'all 0.3s ease',
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: '50px',
          boxShadow: scrolled
            ? '0 8px 40px rgba(0, 0, 0, 0.1)'
            : '0 4px 24px rgba(0, 0, 0, 0.06)',
          border: '1px solid rgba(0,0,0,0.04)',
          transition: 'all 0.3s ease',
        }}>
          <nav style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: '54px',
            padding: '0 10px 0 22px',
          }}>

            {/* Logo */}
            <Link href="/" style={{
              textDecoration: 'none',
              fontSize: '1.15rem',
              fontWeight: 700,
              color: '#1a1a1a',
              letterSpacing: '-0.3px',
            }}>
              <span style={{ color: '#00C853' }}>i</span>MieiInvestimenti
            </Link>

            {/* Nav Center */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              padding: '5px 6px',
              background: '#f3f4f6',
              borderRadius: '30px',
            }}>
              <Link href="/come-funziona" style={navLinkStyle}>COME FUNZIONA</Link>
              <Link href="/commissioni" style={navLinkStyle}>LE COMMISSIONI DEL SISTEMA</Link>
              <Link href="/rendimenti" style={navLinkStyle}>RENDIMENTI DI MERCATO</Link>
              <Link href="/reati" style={navLinkStyle}>ATTENZIONE AI REBATES</Link>
            </div>

            {/* Right Actions */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}>
              {user ? (
                <>
                  <Link href="/dashboard" style={{
                    color: '#555',
                    textDecoration: 'none',
                    fontWeight: 500,
                    fontSize: '0.85rem',
                    padding: '8px 14px',
                  }}>
                    Dashboard
                  </Link>

                  <div style={{ position: 'relative' }} ref={menuRef}>
                    <div
                      onClick={() => setMenuOpen(!menuOpen)}
                      style={{
                        width: '34px',
                        height: '34px',
                        background: '#00C853',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        transition: 'transform 0.2s',
                        transform: menuOpen ? 'scale(1.05)' : 'scale(1)',
                        boxShadow: '0 2px 8px rgba(0,200,83,0.3)'
                      }}
                    >
                      {user.email?.charAt(0).toUpperCase() || 'U'}
                    </div>

                    {menuOpen && (
                      <div style={{
                        position: 'absolute',
                        top: '45px',
                        right: 0,
                        background: 'white',
                        borderRadius: '16px',
                        padding: '10px',
                        width: '200px',
                        boxShadow: '0 10px 40px rgba(0,0,0,0.12)',
                        border: '1px solid rgba(0,0,0,0.05)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        animation: 'fadeIn 0.2s ease-out'
                      }}>
                        <div style={{ padding: '8px 12px', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', borderBottom: '1px solid #f1f5f9', marginBottom: '4px' }}>
                          IMPOSTAZIONI
                        </div>
                        <button onClick={handleLogout} style={{
                          background: 'transparent',
                          border: 'none',
                          textAlign: 'left',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '0.9rem',
                          color: '#ef4444',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }} className="menu-item-hover">
                          Esci
                        </button>
                        <style jsx>{`
                                .menu-item-hover:hover { background: #fef2f2 !important; }
                                @keyframes fadeIn {
                                    from { opacity: 0; transform: translateY(-10px); }
                                    to { opacity: 1; transform: translateY(0); }
                                }
                             `}</style>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <Link href="/login" style={{
                    color: '#555',
                    textDecoration: 'none',
                    fontWeight: 500,
                    fontSize: '0.85rem',
                    padding: '8px 14px',
                  }}>
                    Accedi
                  </Link>
                  <Link href="/dashboard" style={{
                    background: '#00C853',
                    color: '#fff',
                    padding: '10px 20px',
                    borderRadius: '30px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    textDecoration: 'none',
                    boxShadow: '0 4px 12px rgba(0, 200, 83, 0.3)'
                  }}>
                    Provalo Ora
                  </Link>
                </>
              )}
            </div>

          </nav>
        </div>
      </header>

      <div style={{ height: '86px' }}></div>
    </>
  )
}
