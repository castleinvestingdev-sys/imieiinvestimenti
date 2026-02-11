'use client'

import { UploadProvider } from '@/contexts/UploadContext'
import UploadNotification from '@/components/UploadNotification'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <UploadProvider>
      {children}
      <UploadNotification />
    </UploadProvider>
  )
}
