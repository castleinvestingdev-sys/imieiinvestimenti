import { createBrowserClient } from '@supabase/ssr'

let cachedClient: ReturnType<typeof createBrowserClient> | null = null
let warnedOnce = false

export function createClient() {
    if (cachedClient) return cachedClient

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        if (!warnedOnce) {
            console.warn('Supabase env vars missing. Auth features will be disabled.')
            warnedOnce = true
        }
        cachedClient = createBrowserClient(
            'https://placeholder.supabase.co',
            'placeholder-key'
        )
    } else {
        cachedClient = createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        )
    }
    return cachedClient
}
