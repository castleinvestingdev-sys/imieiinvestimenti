"use client"
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, usePathname } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import Link from 'next/link'

export default function Header() {
  const [user, setUser] = useState<User | null>(null)
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const pathname = usePathname()
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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setMenuOpen(false)
    router.push('/')
    setUser(null)
  }

  const getNavLinkStyle = (linkPath: string): React.CSSProperties => {
    const isActive = pathname === linkPath
    return {
      color: isActive ? '#000' : '#555',
      textDecoration: 'none',
      fontWeight: isActive ? 700 : 500,
      fontSize: '0.85rem',
      padding: '8px 12px',
      borderRadius: '25px',
      transition: 'all 0.2s ease',
      whiteSpace: 'nowrap',
      background: isActive ? 'rgba(0,0,0,0.03)' : 'transparent',
    }
  }

  const navLinks = [
    { href: '/come-funziona', label: 'Come funziona' },
    { href: '/commissioni', label: 'Le commissioni del sistema' },
    { href: '/rendimenti', label: 'Rendimenti di mercato' },
    { href: '/reati', label: 'Attenzione ai rebates' },
  ]

  const isFullscreenPage = pathname === '/login' || pathname === '/register' || pathname === '/consulente' || pathname?.startsWith('/dashboard') || pathname?.startsWith('/analisi')

  if (isFullscreenPage) return null

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

            {/* Nav Center - Desktop */}
            <div className="nav-center" style={{
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              padding: '5px 6px',
              background: 'transparent',
              borderRadius: '30px',
            }}>
              {navLinks.map(link => (
                <Link key={link.href} href={link.href} style={getNavLinkStyle(link.href)}>{link.label}</Link>
              ))}
            </div>

            {/* Right Actions */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }} key={user ? 'auth-true' : 'auth-false'}>
              <div className="desktop-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>

                {user ? (
                  <>
                    <Link href="/consulente" style={{
                      background: 'linear-gradient(135deg, #00C853 0%, #009624 100%)',
                      color: '#fff',
                      padding: '0 24px',
                      borderRadius: '50px',
                      fontWeight: 600,
                      fontSize: '0.9rem',
                      textDecoration: 'none',
                      boxShadow: '0 4px 15px rgba(0, 200, 83, 0.3)',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      height: '44px',
                      border: '1px solid rgba(255,255,255,0.1)',
                      whiteSpace: 'nowrap',
                    }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)'
                        e.currentTarget.style.boxShadow = '0 8px 25px rgba(0, 200, 83, 0.4)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)'
                        e.currentTarget.style.boxShadow = '0 4px 15px rgba(0, 200, 83, 0.3)'
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect width="7" height="9" x="3" y="3" rx="1" />
                        <rect width="7" height="5" x="14" y="3" rx="1" />
                        <rect width="7" height="9" x="14" y="12" rx="1" />
                        <rect width="7" height="5" x="3" y="16" rx="1" />
                      </svg>
                      Dashboard
                    </Link>

                    <div style={{ position: 'relative' }} ref={menuRef}>
                      <div
                        onClick={(e) => {
                          e.stopPropagation()
                          setMenuOpen(!menuOpen)
                        }}
                        style={{
                          width: '44px',
                          height: '44px',
                          background: '#ffffff',
                          border: '2px solid #00C853',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#00C853',
                          fontWeight: 700,
                          fontSize: '1.1rem',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
                          userSelect: 'none'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'scale(1.05)'
                          e.currentTarget.style.boxShadow = '0 4px 15px rgba(0, 200, 83, 0.2)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'scale(1)'
                          e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.05)'
                        }}
                      >
                        {user.email?.charAt(0).toUpperCase() || 'U'}
                      </div>

                      {menuOpen && (
                        <div style={{
                          position: 'absolute',
                          top: '58px',
                          right: 0,
                          background: 'white',
                          borderRadius: '16px',
                          padding: '8px',
                          width: '220px',
                          boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
                          border: '1px solid rgba(0,0,0,0.08)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                          animation: 'fadeIn 0.2s ease-out',
                          overflow: 'hidden',
                          zIndex: 1001
                        }}>
                          <div style={{
                            padding: '12px 16px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            color: '#64748b',
                            letterSpacing: '0.5px',
                            borderBottom: '1px solid #f1f5f9',
                            marginBottom: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00C853' }}></span>
                            ACCOUNT
                          </div>
                          <button onClick={(e) => {
                            e.stopPropagation()
                            handleLogout()
                          }} style={{
                            background: 'transparent',
                            border: 'none',
                            textAlign: 'left',
                            padding: '12px 16px',
                            borderRadius: '12px',
                            cursor: 'pointer',
                            fontSize: '0.95rem',
                            color: '#ef4444',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            width: '100%',
                            transition: 'background 0.2s'
                          }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fef2f2'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                              <polyline points="16 17 21 12 16 7" />
                              <line x1="21" x2="9" y1="12" y2="12" />
                            </svg>
                            Esci
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <Link href="/login" className="desktop-login" style={{
                      color: '#333',
                      textDecoration: 'none',
                      fontWeight: 600,
                      fontSize: '0.9rem',
                      padding: '10px 20px',
                      transition: 'color 0.2s',
                      whiteSpace: 'nowrap',
                    }}
                      onMouseEnter={(e) => e.currentTarget.style.color = '#00C853'}
                      onMouseLeave={(e) => e.currentTarget.style.color = '#333'}
                    >
                      Accedi
                    </Link>
                    <Link href="/discover" className="desktop-cta" style={{
                      background: 'linear-gradient(135deg, #00C853 0%, #009624 100%)',
                      color: '#fff',
                      padding: '0 24px',
                      borderRadius: '50px',
                      fontWeight: 600,
                      fontSize: '0.9rem',
                      textDecoration: 'none',
                      boxShadow: '0 4px 15px rgba(0, 200, 83, 0.3)',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      height: '44px',
                      border: '1px solid rgba(255,255,255,0.1)',
                      whiteSpace: 'nowrap',
                    }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)'
                        e.currentTarget.style.boxShadow = '0 8px 25px rgba(0, 200, 83, 0.4)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)'
                        e.currentTarget.style.boxShadow = '0 4px 15px rgba(0, 200, 83, 0.3)'
                      }}>
                      Provalo ora
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14" />
                        <path d="m12 5 7 7-7 7" />
                      </svg>
                    </Link>
                  </>
                )}
              </div>

              {/* Hamburger Button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="hamburger"
                style={{
                  display: 'none',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '8px',
                  color: '#1a1a1a',
                }}
              >
                {mobileMenuOpen ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </svg>
                )}
              </button>
            </div>
          </nav>

          {/* Mobile Menu Overlay */}
          {mobileMenuOpen && (
            <div className="mobile-menu" style={{
              padding: '20px',
              borderTop: '1px solid rgba(0,0,0,0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              animation: 'slideDown 0.3s ease-out',
            }}>
              {navLinks.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '12px',
                    textDecoration: 'none',
                    color: pathname === link.href ? '#00C853' : '#1a1a1a',
                    fontWeight: 700,
                    background: pathname === link.href ? 'rgba(0, 200, 83, 0.05)' : 'transparent',
                    fontSize: '1rem',
                  }}
                >
                  {link.label}
                </Link>
              ))}
              <hr style={{ border: 'none', borderTop: '1px solid #f1f5f9', margin: '8px 0' }} />
              {user ? (
                <Link
                  href="/consulente"
                  onClick={() => setMobileMenuOpen(false)}
                  style={{
                    padding: '14px',
                    textAlign: 'center',
                    background: '#00C853',
                    color: '#fff',
                    borderRadius: '12px',
                    textDecoration: 'none',
                    fontWeight: 800,
                  }}
                >
                  Dashboard
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    style={{
                      padding: '14px',
                      textAlign: 'center',
                      background: '#f1f5f9',
                      color: '#1a1a1a',
                      borderRadius: '12px',
                      textDecoration: 'none',
                      fontWeight: 700,
                    }}
                  >
                    Accedi
                  </Link>
                  <Link
                    href="/discover"
                    onClick={() => setMobileMenuOpen(false)}
                    style={{
                      padding: '14px',
                      textAlign: 'center',
                      background: '#00C853',
                      color: '#fff',
                      borderRadius: '12px',
                      textDecoration: 'none',
                      fontWeight: 800,
                    }}
                  >
                    Provalo ora
                  </Link>
                </>
              )}
            </div>
          )}
        </div>
        <style jsx>{`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes slideDown {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @media (max-width: 1024px) {
            .nav-center { display: none !important; }
            .desktop-actions { display: none !important; }
            .hamburger { display: block !important; }
          }
          @media (max-width: 480px) {
            header {
              padding-left: 12px !important;
              padding-right: 12px !important;
            }
          }
        `}</style>
      </header>
    </>
  )
}
