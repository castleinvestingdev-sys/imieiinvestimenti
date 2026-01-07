import Link from 'next/link'

export default function AuthCodeErrorPage() {
    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            backgroundColor: '#ffffff',
            fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
            <div style={{
                maxWidth: '480px',
                width: '100%',
                textAlign: 'center',
                padding: '40px',
                borderRadius: '24px',
                backgroundColor: '#ffffff',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                border: '1px solid #f3f4f6'
            }}>
                <div style={{
                    fontSize: '64px',
                    marginBottom: '24px'
                }}>⚠️</div>
                <h1 style={{
                    fontSize: '24px',
                    fontWeight: 700,
                    color: '#111827',
                    marginBottom: '16px'
                }}>Errore di Autenticazione</h1>
                <p style={{
                    fontSize: '16px',
                    color: '#4b5563',
                    lineHeight: 1.6,
                    marginBottom: '32px'
                }}>
                    Non è stato possibile completare l&apos;accesso tramite il provider social.
                    Il link potrebbe essere scaduto o essersi verificato un errore di comunicazione con il server.
                </p>
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                }}>
                    <Link href="/login" style={{
                        display: 'block',
                        padding: '14px',
                        backgroundColor: '#111827',
                        color: '#ffffff',
                        borderRadius: '12px',
                        textDecoration: 'none',
                        fontWeight: 600,
                        transition: 'opacity 0.2s'
                    }}>
                        Torna al Login
                    </Link>
                    <Link href="/" style={{
                        display: 'block',
                        padding: '14px',
                        backgroundColor: 'transparent',
                        color: '#6b7280',
                        borderRadius: '12px',
                        textDecoration: 'none',
                        fontWeight: 600
                    }}>
                        Torna alla Home
                    </Link>
                </div>
            </div>
        </div>
    )
}
