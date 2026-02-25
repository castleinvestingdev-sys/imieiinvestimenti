import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'iMieiInvestimenti.it - I tuoi investimenti rendono davvero?'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          background: 'linear-gradient(135deg, #f8fffe 0%, #e8f9f0 50%, #d4f5e2 100%)',
          fontFamily: 'Inter, system-ui, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background decorative chart line */}
        <svg
          viewBox="0 0 1200 630"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            opacity: 0.08,
          }}
        >
          <path
            d="M0 500 Q150 420 300 450 T600 350 T900 280 T1200 200"
            fill="none"
            stroke="#00C853"
            strokeWidth="4"
          />
          <path
            d="M0 520 Q200 460 400 480 T800 380 T1200 250"
            fill="none"
            stroke="#00C853"
            strokeWidth="2"
          />
        </svg>

        {/* Bottom gradient bar */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '6px',
            background: 'linear-gradient(90deg, #00C853, #00E676, #00C853)',
          }}
        />

        {/* Content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '24px',
            padding: '0 80px',
          }}
        >
          {/* Logo text */}
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              fontSize: '42px',
              fontWeight: 700,
              letterSpacing: '-0.5px',
              color: '#1a1a1a',
            }}
          >
            <span style={{ color: '#00C853' }}>i</span>
            <span>MieiInvestimenti.it</span>
          </div>

          {/* Main headline */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <div
              style={{
                fontSize: '56px',
                fontWeight: 800,
                color: '#111827',
                textAlign: 'center',
                lineHeight: 1.15,
                letterSpacing: '-1px',
              }}
            >
              I tuoi investimenti
            </div>
            <div
              style={{
                fontSize: '56px',
                fontWeight: 800,
                color: '#111827',
                textAlign: 'center',
                lineHeight: 1.15,
                letterSpacing: '-1px',
              }}
            >
              rendono davvero?
            </div>
          </div>

          {/* Subtitle */}
          <div
            style={{
              fontSize: '26px',
              color: '#4B5563',
              textAlign: 'center',
              lineHeight: 1.4,
              maxWidth: '700px',
            }}
          >
            La banca non te lo dice. Noi sì.
          </div>

          {/* CTA badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginTop: '12px',
              padding: '12px 32px',
              background: '#00C853',
              borderRadius: '50px',
              color: 'white',
              fontSize: '20px',
              fontWeight: 600,
            }}
          >
            Analisi gratuita e indipendente
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
