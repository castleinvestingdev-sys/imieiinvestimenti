#!/usr/bin/env npx tsx
/**
 * Test end-to-end: carica tutti i 42 PDF CA Liquidità tramite /api/parse-pdf
 * Verifica che OGNI PDF passi (success=true), nessuno escluso.
 */
import { readFileSync, readdirSync } from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

const envContent = readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8')
const env: Record<string, string> = {}
envContent.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=')
    if (key && vals.length) env[key.trim()] = vals.join('=').trim()
})

const DIR = '/Users/leon/Desktop/banche EC/Credit Agricole/Liquidità/6. Credit Agricole 6 - Frigeri Maria Cristina/'

async function main() {
    // Auth
    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
        email: 'leonrivas27@gmail.com', password: '123456'
    })
    if (authErr || !auth?.user) { console.error('Auth failed:', authErr); process.exit(1) }
    const userId = auth.user.id
    const accessToken = auth.session.access_token
    const refreshToken = auth.session.refresh_token

    const projectRef = 'xmgsashgwntaslnweisr'
    const tokenData = JSON.stringify({
        access_token: accessToken, refresh_token: refreshToken,
        token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
    })
    const cookieName = `sb-${projectRef}-auth-token`
    const cookies = `${cookieName}=${encodeURIComponent(tokenData)}`

    // Get all PDFs sorted
    const files = readdirSync(DIR)
        .filter(f => f.toLowerCase().endsWith('.pdf'))
        .sort()

    console.log(`\n=== Test upload reale: ${files.length} PDF CA Liquidità ===\n`)

    let passed = 0
    let failed = 0
    const failures: string[] = []

    for (let i = 0; i < files.length; i++) {
        const name = files[i]
        const filePath = path.join(DIR, name)
        const buf = readFileSync(filePath)

        const formData = new FormData()
        formData.append('file', new Blob([buf], { type: 'application/pdf' }), name)
        formData.append('userId', userId)
        formData.append('force', 'true')  // forza ricalcolo se duplicato

        const start = Date.now()
        process.stdout.write(`  [${i + 1}/${files.length}] ${name.substring(0, 60).padEnd(60)} `)

        try {
            const resp = await fetch('http://localhost:3000/api/parse-pdf', {
                method: 'POST', body: formData,
                headers: { 'Cookie': cookies },
                signal: AbortSignal.timeout(600000),  // 10 min max
            })
            const text = await resp.text()
            let result: any
            try { result = JSON.parse(text) }
            catch { result = { success: false, error: text.substring(0, 200) } }

            const elapsed = ((Date.now() - start) / 1000).toFixed(1)

            if (result.success) {
                const type = result.analysis?.account_type || '?'
                const bank = result.analysis?.bank_name || '?'
                const pv = result.analysis?.portfolio_value?.toFixed(2) || '?'
                const iv = result.analysis?.initial_value?.toFixed(2) || '?'
                const txn = result.analysis?.transactions?.length || 0
                console.log(`✅ ${elapsed}s | ${type} | ${iv} → ${pv} | ${txn} mov`)
                passed++
            } else {
                console.log(`❌ ${elapsed}s | ${result.error?.substring(0, 100)}`)
                failures.push(`${name}: ${result.error}`)
                failed++
            }
        } catch (err: any) {
            const elapsed = ((Date.now() - start) / 1000).toFixed(1)
            console.log(`❌ ${elapsed}s | ${err.message}`)
            failures.push(`${name}: ${err.message}`)
            failed++
        }
    }

    console.log(`\n========== RISULTATI ==========`)
    console.log(`Totale: ${files.length}`)
    console.log(`Passati: ${passed} ✅`)
    console.log(`Falliti: ${failed} ❌`)
    if (failures.length > 0) {
        console.log(`\nDettaglio errori:`)
        for (const f of failures) console.log(`  - ${f}`)
    }
    if (failed === 0) {
        console.log(`\n🎉 TUTTI I ${files.length} PDF PASSANO!`)
    }
}
main().catch(console.error)
