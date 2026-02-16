'use client'

import { useState } from 'react'
import { useUpload } from '@/contexts/UploadContext'

export default function UploadNotification() {
  const { hasActiveUploads, activeHolder, uploadQueue, completedCount, totalCount, overallProgress } = useUpload()
  const [expanded, setExpanded] = useState(false)

  if (!hasActiveUploads) return null

  const currentFile = uploadQueue.find(f => f.status === 'uploading' || f.status === 'analyzing')
  const errorCount = uploadQueue.filter(f => f.status === 'error').length
  const holderDisplay = currentFile?.holder || activeHolder || null

  return (
    <div
      onClick={() => setExpanded(prev => !prev)}
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        right: '1.5rem',
        zIndex: 9999,
        background: 'white',
        borderRadius: '16px',
        padding: '16px 20px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        border: errorCount > 0 ? '1px solid #fca5a5' : '1px solid #e2e8f0',
        cursor: 'pointer',
        minWidth: '280px',
        maxWidth: '360px',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.2)'
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
          animation: 'notifPulse 1.5s ease-in-out infinite',
        }}>
          {errorCount > 0 && completedCount + errorCount === totalCount ? '⚠️' : '📤'}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a' }}>
            {errorCount > 0 && completedCount + errorCount === totalCount
              ? `Completato con ${errorCount} errori`
              : 'Analisi in corso'}
          </div>
          {holderDisplay && (
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
              {holderDisplay}
            </div>
          )}
        </div>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: errorCount > 0 ? '#ef4444' : '#64748b' }}>
          {completedCount}/{totalCount}
          {errorCount > 0 && ` (${errorCount} err)`}
        </span>
      </div>

      {/* Current file with stage */}
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
          background: errorCount > 0
            ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
            : 'linear-gradient(90deg, #10b981, #34d399)',
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
            animation: 'notifShimmer 1.5s infinite',
          }} />
        </div>
      </div>

      {/* Expanded file list */}
      {expanded && uploadQueue.length > 0 && (
        <div style={{
          marginTop: '10px',
          maxHeight: '240px',
          overflowY: 'auto',
          borderTop: '1px solid #e2e8f0',
          paddingTop: '8px',
        }}>
          {uploadQueue.map(f => {
            const isActive = f.status === 'uploading' || f.status === 'analyzing'
            return (
              <div key={f.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '5px 0',
                fontSize: '0.72rem',
                borderBottom: '1px solid #f1f5f9',
              }}>
                <span style={{ flexShrink: 0 }}>
                  {f.status === 'done' ? '✅' : f.status === 'error' ? '❌' : isActive ? '⏳' : '🔜'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: f.status === 'error' ? '#ef4444' : f.status === 'done' ? '#10b981' : '#334155',
                    fontWeight: isActive ? 600 : 400,
                  }}>
                    {f.name}
                  </div>
                  {f.status === 'error' && f.error && (
                    <div style={{
                      color: '#ef4444',
                      fontSize: '0.65rem',
                      marginTop: '2px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {f.error}
                    </div>
                  )}
                  {isActive && f.stage && (
                    <div style={{
                      color: '#64748b',
                      fontSize: '0.65rem',
                      marginTop: '1px',
                    }}>
                      {f.stage}
                    </div>
                  )}
                </div>
                {isActive && (
                  <span style={{ color: '#10b981', fontWeight: 700, flexShrink: 0, fontSize: '0.75rem' }}>
                    {f.progress}%
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Hint */}
      <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '6px', textAlign: 'center' }}>
        {expanded ? 'Clicca per ridurre' : 'Clicca per dettagli'}
      </div>

      <style>{`
        @keyframes notifPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes notifShimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  )
}
