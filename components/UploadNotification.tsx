'use client'

import { useUpload } from '@/contexts/UploadContext'
import { usePathname, useRouter } from 'next/navigation'

export default function UploadNotification() {
  const { hasActiveUploads, activeHolder, uploadQueue, completedCount, totalCount, overallProgress } = useUpload()
  const pathname = usePathname()
  const router = useRouter()

  if (!hasActiveUploads) return null

  const currentFile = uploadQueue.find(f => f.status === 'uploading' || f.status === 'analyzing')
  const holderDisplay = currentFile?.holder || activeHolder || null
  const isOnDashboard = pathname === '/dashboard'

  return (
    <div
      onClick={() => { if (!isOnDashboard) router.push('/dashboard') }}
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        right: '1.5rem',
        zIndex: 9999,
        background: 'white',
        borderRadius: '16px',
        padding: '16px 20px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        border: '1px solid #e2e8f0',
        cursor: isOnDashboard ? 'default' : 'pointer',
        minWidth: '280px',
        maxWidth: '360px',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
      }}
      onMouseEnter={(e) => {
        if (!isOnDashboard) {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.2)'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.15)'
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <span style={{
          fontSize: '1.2rem',
          animation: 'pulse 1.5s ease-in-out infinite',
        }}>
          📤
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a' }}>
            Analisi in corso
          </div>
          {holderDisplay && (
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
              {holderDisplay}
            </div>
          )}
        </div>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>
          {completedCount}/{totalCount}
        </span>
      </div>

      {/* Current file */}
      {currentFile && (
        <div style={{
          fontSize: '0.75rem',
          color: '#64748b',
          marginBottom: '8px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {currentFile.stage || currentFile.name}
        </div>
      )}

      {/* Progress bar */}
      <div style={{
        width: '100%',
        height: '6px',
        background: '#e2e8f0',
        borderRadius: '3px',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${overallProgress}%`,
          height: '100%',
          background: 'linear-gradient(90deg, #10b981, #34d399)',
          borderRadius: '3px',
          transition: 'width 0.3s ease',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
            animation: 'shimmer 1.5s infinite',
          }} />
        </div>
      </div>

      {/* Hint */}
      {!isOnDashboard && (
        <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '6px', textAlign: 'center' }}>
          Clicca per tornare alla dashboard
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  )
}
