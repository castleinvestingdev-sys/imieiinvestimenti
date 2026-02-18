import { readFileSync } from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

async function main() {
    const envPath = path.join(process.cwd(), '.env.local')
    const envContent = readFileSync(envPath, 'utf-8')
    const env: Record<string, string> = {}
    envContent.split('\n').forEach(line => {
        const [key, ...vals] = line.split('=')
        if (key && vals.length) env[key.trim()] = vals.join('=').trim()
    })

    const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    const { data: auth, error: ae } = await sb.auth.signInWithPassword({
        email: 'leonrivas27@gmail.com',
        password: '123456',
    })
    if (ae) throw ae

    const projectRef = 'xmgsashgwntaslnweisr'
    const tokenData = JSON.stringify({
        access_token: auth.session!.access_token,
        refresh_token: auth.session!.refresh_token,
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
    })
    const cookieName = `sb-${projectRef}-auth-token`
    const cookies = `${cookieName}=${encodeURIComponent(tokenData)}`

    console.log('Calling cleanup API...')
    const resp = await fetch('http://localhost:3000/api/cleanup', {
        method: 'POST',
        headers: { 'Cookie': cookies },
        signal: AbortSignal.timeout(300000),
    })
    const result = await resp.json()
    console.log('Result:', JSON.stringify(result, null, 2))
}
main().catch(console.error)
