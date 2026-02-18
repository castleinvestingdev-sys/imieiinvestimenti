import { readFileSync } from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

async function main() {
    const filePath = process.argv[2]
    if (!filePath) {
        console.error('Usage: npx tsx scripts/test-single-upload.ts <path-to-pdf>')
        process.exit(1)
    }

    const envPath = path.join(process.cwd(), '.env.local')
    const envContent = readFileSync(envPath, 'utf-8')
    const env: Record<string, string> = {}
    envContent.split('\n').forEach(line => {
        const [key, ...vals] = line.split('=')
        if (key && vals.length) env[key.trim()] = vals.join('=').trim()
    })

    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    const { data, error } = await supabase.auth.signInWithPassword({ email: 'leonrivas27@gmail.com', password: '123456' })
    if (error || !data.user || !data.session) throw new Error(`Login failed: ${error?.message}`)
    const userId = data.user.id
    const accessToken = data.session.access_token
    const refreshToken = data.session.refresh_token

    const projectRef = 'xmgsashgwntaslnweisr'
    const tokenData = JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
    })
    const cookieName = `sb-${projectRef}-auth-token`
    const cookies = `${cookieName}=${encodeURIComponent(tokenData)}`

    const fileBuffer = readFileSync(filePath)
    const formData = new FormData()
    formData.append('file', new Blob([fileBuffer], { type: 'application/pdf' }), path.basename(filePath))
    formData.append('userId', userId)

    console.log(`Uploading ${path.basename(filePath)}...`)
    const startTime = Date.now()
    const resp = await fetch('http://localhost:3000/api/parse-pdf', {
        method: 'POST',
        body: formData,
        headers: { 'Cookie': cookies },
        signal: AbortSignal.timeout(300000),
    })
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    const result = await resp.json()

    if (!result.success) {
        console.log(`❌ (${elapsed}s) ${result.error}`)
    } else {
        console.log(`✅ (${elapsed}s)`)
        console.log(JSON.stringify(result, null, 2).substring(0, 2000))
    }
}
main().catch(console.error)
