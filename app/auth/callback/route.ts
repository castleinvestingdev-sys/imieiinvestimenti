import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/consulente'

    if (!code) {
        return NextResponse.redirect(`${origin}/auth/auth-code-error`)
    }

    try {
        // Scambio del codice autorizzazione con i token Google
        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code: code,
                client_id: '220358867378-v1t5608r6917j7sq5q66si3bopgkfbkm.apps.googleusercontent.com',
                client_secret: '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',
                redirect_uri: `${origin}/auth/callback`,
                grant_type: 'authorization_code',
            }),
        })

        const data = await response.json()

        if (data.id_token) {
            const supabase = await createClient()

            // Login in Supabase usando l'ID Token ricevuto da Google
            const { error } = await supabase.auth.signInWithIdToken({
                provider: 'google',
                token: data.id_token,
                access_token: data.access_token || undefined,
            })

            if (!error) {
                return NextResponse.redirect(`${origin}${next}`)
            }
        }
    } catch (err) {
        console.error('Auth verification failed:', err)
    }

    // In caso di errore, redirige alla pagina di errore standard
    return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
