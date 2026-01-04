import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        // Return a mock or minimal client to prevent crashes if keys are missing
        console.warn('Supabase env vars missing. Auth features will be disabled.')
        return createBrowserClient(
            'https://placeholder.supabase.co',
            'placeholder-key'
        )
    }
    return createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
}
