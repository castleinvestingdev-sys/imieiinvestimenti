/**
 * Full end-to-end test: uploads PDFs to the real API (saves to DB),
 * then fetches the dashboard data and verifies coherence.
 *
 * Usage: npx tsx scripts/test-upload-all.ts [--bank=CA115|CA591|CA990|INTESA|GENERALI|GEN_CONDORELLI_DT|GEN_CONDORELLI_CC|GEN_ZANACCA_DT|GEN_ZANACCA_CC|GEN_UGHETTI_DT|GEN_UGHETTI_LIQ|ALL]
 */
import { readFileSync, readdirSync } from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

const BASE_URL = 'http://localhost:3000'
const EMAIL = 'leonrivas27@gmail.com'
const PASSWORD = '123456'

const BANKS: Record<string, { dir: string; label: string }> = {
    CA115: { dir: '/Users/leon/Desktop/banche EC/Credit Agricole/Dossier Titoli/115', label: 'Crédit Agricole 115' },
    CA591: { dir: '/Users/leon/Desktop/banche EC/Credit Agricole/Dossier Titoli/591', label: 'Crédit Agricole 591' },
    CA990: { dir: '/Users/leon/Desktop/banche EC/Credit Agricole/Dossier Titoli/990', label: 'Crédit Agricole 990' },
    INTESA: { dir: '/Users/leon/Desktop/banche EC/BANCA INTESA/BANCA INTESA/Dossier titoli', label: 'Banca Intesa' },
    GENERALI: { dir: '/Users/leon/Desktop/banche EC/banca generali', label: 'Banca Generali' },
    // Nuovi clienti Banca Generali
    GEN_CONDORELLI_DT: { dir: '/Users/leon/Desktop/Banca Generali/Banca Generali (Condorelli Zanacca Zanacca)/DT', label: 'Generali Condorelli DT' },
    GEN_CONDORELLI_CC: { dir: '/Users/leon/Desktop/Banca Generali/Banca Generali (Condorelli Zanacca Zanacca)/CC', label: 'Generali Condorelli CC' },
    GEN_ZANACCA_DT: { dir: '/Users/leon/Desktop/Banca Generali/Banca Generali (Zanacca)/DT', label: 'Generali Zanacca DT' },
    GEN_ZANACCA_CC: { dir: '/Users/leon/Desktop/Banca Generali/Banca Generali (Zanacca)/CC', label: 'Generali Zanacca CC' },
    GEN_UGHETTI_DT: { dir: '/Users/leon/Desktop/Banca Generali/Banca generali (ughetti)/Dossier Titoli', label: 'Generali Ughetti DT' },
    GEN_UGHETTI_LIQ: { dir: '/Users/leon/Desktop/Banca Generali/Banca generali (ughetti)/Liquidità', label: 'Generali Ughetti Liquidità' },
}

let supabase: ReturnType<typeof createClient>
let userId: string
let accessToken: string
let refreshToken: string
let loginAt: number

// Global error accumulator — every coherence error across all banks
const allCoherenceErrors: { bank: string; period: string; account: string; isin: string; detail: string }[] = []
const allGapErrors: { bank: string; period: string; account: string; detail: string }[] = []
let totalUploadErrors = 0

async function init() {
    const envPath = path.join(process.cwd(), '.env.local')
    const envContent = readFileSync(envPath, 'utf-8')
    const env: Record<string, string> = {}
    envContent.split('\n').forEach(line => {
        const [key, ...vals] = line.split('=')
        if (key && vals.length) env[key.trim()] = vals.join('=').trim()
    })

    supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    await login()
}

async function login() {
    const { data, error } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
    if (error) throw new Error(`Login failed: ${error.message}`)
    userId = data.user.id
    accessToken = data.session.access_token
    refreshToken = data.session.refresh_token
    loginAt = Date.now()
    console.log(`Logged in: ${userId}\n`)
}

function getAuthCookies(): string {
    const projectRef = 'xmgsashgwntaslnweisr'
    const tokenData = JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
    })

    const CHUNK_SIZE = 3500
    const chunks: string[] = []
    for (let i = 0; i < tokenData.length; i += CHUNK_SIZE) {
        chunks.push(tokenData.substring(i, i + CHUNK_SIZE))
    }

    const cookieName = `sb-${projectRef}-auth-token`
    if (chunks.length === 1) {
        return `${cookieName}=${encodeURIComponent(chunks[0])}`
    }
    return chunks.map((chunk, i) => `${cookieName}.${i}=${encodeURIComponent(chunk)}`).join('; ')
}

async function refreshIfNeeded() {
    const elapsed = Date.now() - loginAt
    if (elapsed > 45 * 60 * 1000) { // Refresh every 45 minutes (JWT expires at 60)
        console.log('🔄 Refreshing auth token...')
        await login()
    }
}

async function uploadPdf(filePath: string): Promise<any> {
    await refreshIfNeeded()
    const fileBuffer = readFileSync(filePath)
    const fileName = path.basename(filePath)

    const formData = new FormData()
    formData.append('file', new Blob([fileBuffer], { type: 'application/pdf' }), fileName)
    formData.append('userId', userId)

    const resp = await fetch(`${BASE_URL}/api/parse-pdf`, {
        method: 'POST',
        body: formData,
        headers: {
            'Cookie': getAuthCookies(),
        },
        signal: AbortSignal.timeout(600000),
    })

    return await resp.json()
}

async function fetchAnalyses(): Promise<any[]> {
    const { data } = await supabase
        .from('analyses')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('period_end', { ascending: true })
    return data || []
}

function checkCoherenceFromDB(analyses: any[], bankLabel: string): { errors: string[]; ok: number; total: number } {
    const errors: string[] = []
    let okCount = 0
    let totalChecked = 0

    const dossiers = analyses.filter(a => a.account_type === 'DOSSIER')
    const normalizeAcc = (s: string) => {
        const parts = s.replace(/[^0-9/]/g, '').split('/').filter(Boolean)
        return parts.length >= 2 ? parts.slice(-2).join('/') : s.trim() || 'ND'
    }

    for (const doc of dossiers) {
        const normAcc = normalizeAcc(doc.benchmark_comparison || '')
        if (!doc.period_start || !doc.period_end || normAcc === 'ND') continue
        const docEnd = new Date(doc.period_end)

        const prevDoc = dossiers
            .filter(a => a.id !== doc.id
                && normalizeAcc(a.benchmark_comparison || '') === normAcc
                && a.period_end && new Date(a.period_end) < docEnd)
            .sort((a, b) => new Date(b.period_end).getTime() - new Date(a.period_end).getTime())[0]

        if (!prevDoc) continue
        const prevEnd = new Date(prevDoc.period_end)
        const gapDays = (docEnd.getTime() - prevEnd.getTime()) / 86400000
        if (gapDays > 200 || gapDays <= 0) continue

        const docDays = (docEnd.getTime() - new Date(doc.period_start).getTime()) / 86400000
        const getQ = (d: Date) => ({ q: Math.floor(d.getMonth() / 3), y: d.getFullYear() })
        const dQ = getQ(docEnd), pQ = getQ(prevEnd)
        const expQ = dQ.q === 0 ? 3 : dQ.q - 1
        const expY = dQ.q === 0 ? dQ.y - 1 : dQ.y

        if (docDays < 45) {
            const expM = docEnd.getMonth() === 0 ? 11 : docEnd.getMonth() - 1
            const expMY = docEnd.getMonth() === 0 ? docEnd.getFullYear() - 1 : docEnd.getFullYear()
            if (prevEnd.getMonth() !== expM || prevEnd.getFullYear() !== expMY) continue
        } else if (docDays > 330) {
            // ok
        } else if (docDays > 150) {
            const getH = (d: Date) => ({ h: d.getMonth() < 6 ? 0 : 1, y: d.getFullYear() })
            const dH = getH(docEnd), pH = getH(prevEnd)
            if (pH.h !== (dH.h === 0 ? 1 : 0) || pH.y !== (dH.h === 0 ? dH.y - 1 : dH.y)) continue
        } else if (pQ.q !== expQ || pQ.y !== expY) continue

        const secMovements = doc.costs_breakdown?.securityMovements || []
        // Skip coherence if no MOVIMENTI section in text
        if (doc.costs_breakdown?.hasMovementsSection === false) {
            okCount++; totalChecked++; continue
        }
        const hasTyped = secMovements.some((m: any) => m.operationType === 'Acquisto' || m.operationType === 'Vendita')
        if (secMovements.length > 0 && !hasTyped) { okCount++; totalChecked++; continue }

        totalChecked++

        const prevH: Record<string, number> = {}
        ;(prevDoc.holdings || []).forEach((h: any) => { if (h.isin) prevH[h.isin] = h.quantity || 0 })
        const movD: Record<string, { b: number; s: number }> = {}
        secMovements.forEach((m: any) => {
            if (!m.isin) return
            if (!movD[m.isin]) movD[m.isin] = { b: 0, s: 0 }
            if (m.operationType === 'Acquisto') movD[m.isin].b += m.quantity || 0
            else if (m.operationType === 'Vendita') movD[m.isin].s += m.quantity || 0
        })

        const calcInit: Record<string, number> = {}
        const currH: Record<string, number> = {}
        ;(doc.holdings || []).forEach((h: any) => {
            if (!h.isin) return; currH[h.isin] = h.quantity || 0
            const d = movD[h.isin] || { b: 0, s: 0 }
            calcInit[h.isin] = (h.quantity || 0) - d.b + d.s
        })
        Object.entries(movD).forEach(([isin, d]) => {
            if (!(isin in calcInit)) { const q = 0 - d.b + d.s; if (q !== 0) calcInit[isin] = q }
        })

        const allIsins = new Set([...Object.keys(prevH), ...Object.keys(calcInit)])
        const isIncomplete = doc.costs_breakdown?.incompleteMovements === true
        const mismatches: string[] = []
        allIsins.forEach(isin => {
            if (Math.abs((calcInit[isin] || 0) - (prevH[isin] || 0)) >= 0.01) {
                const mov = movD[isin]
                const hasNoNetMov = !mov || (mov.b === 0 && mov.s === 0) || (mov.b === mov.s)
                const fullyGone = (prevH[isin] || 0) > 0 && (currH[isin] || 0) === 0
                const fullyNew = (prevH[isin] || 0) === 0 && (currH[isin] || 0) > 0
                if (hasNoNetMov && (fullyGone || fullyNew)) return
                // Intesa incomplete movements: movements don't cover all portfolio changes
                if (isIncomplete) return
                const CA_KW = ['RAGGR', 'DIRITTO', 'DIRITTI', 'FRAZION', 'CONCAMBIO', 'CONVERSIONE', 'SPLIT AZ']
                const name = (doc.holdings || []).find((h: any) => h.isin === isin)?.name ||
                             (prevDoc.holdings || []).find((h: any) => h.isin === isin)?.name || ''
                if (CA_KW.some(kw => (name || '').toUpperCase().includes(kw))) return
                mismatches.push(isin)
            }
        })

        if (mismatches.length > 0) {
            const period = `${doc.period_start} → ${doc.period_end}`
            const account = doc.benchmark_comparison || 'ND'
            errors.push(`❌ COERENZA [${bankLabel}] ${period} [${account}]: ${mismatches.length} mismatch`)
            mismatches.forEach(isin => {
                const prev = prevH[isin] || 0, calc = calcInit[isin] || 0, curr = currH[isin] || 0
                const mov = movD[isin] || { b: 0, s: 0 }
                const detail = `prev=${prev.toFixed(2)}, calcInit=${calc.toFixed(2)} (curr=${curr.toFixed(2)}, buy=${mov.b.toFixed(2)}, sell=${mov.s.toFixed(2)})`
                errors.push(`   ${isin}: ${detail}`)
                // Add to global error list
                allCoherenceErrors.push({ bank: bankLabel, period, account, isin, detail })
            })
        } else {
            okCount++
        }
    }
    return { errors, ok: okCount, total: totalChecked }
}

function checkPortfolioGap(analyses: any[], bankLabel: string): string[] {
    const warnings: string[] = []
    for (const doc of analyses) {
        if (doc.account_type !== 'DOSSIER' || !(doc.holdings?.length > 0)) continue
        const sum = doc.holdings.reduce((s: number, h: any) => s + (h.marketValue || 0), 0)
        const total = doc.portfolio_value || 0
        if (total === 0) continue
        const gap = Math.abs(sum - total)
        const pct = gap / total * 100
        if (pct > 5) {
            const detail = `gap ${gap.toFixed(0)}€ (${pct.toFixed(1)}%)`
            warnings.push(`⚠️  GAP [${bankLabel}] ${doc.period_end} [${doc.benchmark_comparison}]: ${detail}`)
            allGapErrors.push({ bank: bankLabel, period: doc.period_end, account: doc.benchmark_comparison, detail })
        }
    }
    return warnings
}

async function cleanupAll() {
    console.log('🗑️  Pulizia database via API...')
    const resp = await fetch(`${BASE_URL}/api/cleanup`, {
        method: 'POST',
        headers: { 'Cookie': getAuthCookies() },
        signal: AbortSignal.timeout(300000),
    })
    const result = await resp.json()
    if (!result.success) {
        console.log(`⚠️  Cleanup error: ${result.error}`)
    }
    console.log(`✅ ${result.totalSoftDeleted || 0} soft-deleted, ${result.totalCleaned || 0} stripped\n`)
}

async function testBank(bankKey: string, bank: typeof BANKS[string]) {
    console.log(`\n${'='.repeat(70)}`)
    console.log(`🏦 ${bank.label} (${bankKey})`)
    console.log(`${'='.repeat(70)}`)

    const files = readdirSync(bank.dir)
        .filter(f => f.toLowerCase().endsWith('.pdf'))
        .sort()
        .map(f => path.join(bank.dir, f))

    console.log(`📁 ${files.length} PDF\n`)
    let uploadErrors = 0

    for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const fileName = path.basename(file)
        const startTime = Date.now()
        process.stdout.write(`[${i + 1}/${files.length}] ${fileName}... `)

        try {
            const result = await uploadPdf(file)
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

            if (!result.success) {
                console.log(`❌ (${elapsed}s) ${result.error}`)
                uploadErrors++
                totalUploadErrors++
                continue
            }

            const type = result.type || result.analysis?.account_type || '?'
            const bankName = result.analysis?.bank_name || '?'
            console.log(`✅ (${elapsed}s) ${type} — ${bankName}`)

            // Check coherence after each DOSSIER upload
            if (type === 'DOSSIER') {
                const allAnalyses = await fetchAnalyses()
                const coh = checkCoherenceFromDB(allAnalyses, bank.label)
                if (coh.errors.length > 0) {
                    console.log(`  🔴 COERENZA: ${coh.errors.length} problemi:`)
                    coh.errors.forEach(e => console.log(`    ${e}`))
                }
                const gaps = checkPortfolioGap([result.analysis].filter(Boolean), bank.label)
                gaps.forEach(g => console.log(`  ${g}`))
            }
        } catch (err: any) {
            console.log(`❌ (${((Date.now() - startTime) / 1000).toFixed(1)}s) ${err.message}`)
            uploadErrors++
            totalUploadErrors++
        }
    }

    // Final bank check
    console.log(`\n--- Riepilogo ${bank.label} ---`)
    const allAnalyses = await fetchAnalyses()
    const coh = checkCoherenceFromDB(allAnalyses, bank.label)
    const gaps = checkPortfolioGap(allAnalyses, bank.label)
    console.log(`Coerenza: ${coh.ok}/${coh.total} OK`)
    if (coh.errors.length > 0) { console.log('Problemi coerenza:'); coh.errors.forEach(e => console.log(`  ${e}`)) }
    if (gaps.length > 0) { console.log('Gap portafoglio:'); gaps.forEach(g => console.log(`  ${g}`)) }
    if (uploadErrors > 0) console.log(`Upload falliti: ${uploadErrors}`)

    return coh.errors.length === 0 && gaps.length === 0 && uploadErrors === 0
}

async function main() {
    const args = process.argv.slice(2)
    const bankArg = args.find(a => a.startsWith('--bank='))?.split('=')[1]?.toUpperCase()

    await init()

    // Always clean first — soft-delete active rows + strip JSONB from old rows to free DB space
    await cleanupAll()

    const bankKeys = bankArg === 'ALL' || !bankArg ? Object.keys(BANKS) : [bankArg]
    const results: Record<string, boolean> = {}

    for (const key of bankKeys) {
        const bank = BANKS[key]
        if (!bank) { console.log(`❌ Banca sconosciuta: ${key}`); continue }
        results[key] = await testBank(key, bank)
    }

    // ══════════════════════════════════════════════════════════════════════
    // RIEPILOGO FINALE — every single error must be visible here
    // ══════════════════════════════════════════════════════════════════════
    console.log(`\n${'═'.repeat(70)}`)
    console.log(`📊 RIEPILOGO FINALE`)
    console.log(`${'═'.repeat(70)}`)

    // Per-bank summary
    for (const [key, ok] of Object.entries(results)) {
        console.log(`${ok ? '✅' : '❌'} ${BANKS[key].label}: ${ok ? 'TUTTO OK' : 'PROBLEMI'}`)
    }

    // Detailed coherence errors
    if (allCoherenceErrors.length > 0) {
        console.log(`\n${'─'.repeat(70)}`)
        console.log(`🔴 ERRORI COERENZA: ${allCoherenceErrors.length} mismatch totali`)
        console.log(`${'─'.repeat(70)}`)
        // Group by bank + period
        const grouped = new Map<string, typeof allCoherenceErrors>()
        for (const err of allCoherenceErrors) {
            const key = `${err.bank} | ${err.period} | ${err.account}`
            if (!grouped.has(key)) grouped.set(key, [])
            grouped.get(key)!.push(err)
        }
        for (const [key, errs] of grouped) {
            console.log(`\n  ${key}:`)
            for (const err of errs) {
                console.log(`    ${err.isin}: ${err.detail}`)
            }
        }
    }

    // Detailed gap errors
    if (allGapErrors.length > 0) {
        console.log(`\n${'─'.repeat(70)}`)
        console.log(`⚠️  GAP PORTAFOGLIO: ${allGapErrors.length} gap > 5%`)
        console.log(`${'─'.repeat(70)}`)
        for (const err of allGapErrors) {
            console.log(`  ${err.bank} | ${err.period} [${err.account}]: ${err.detail}`)
        }
    }

    if (totalUploadErrors > 0) {
        console.log(`\n❌ Upload falliti: ${totalUploadErrors}`)
    }

    // Final verdict
    const hasErrors = allCoherenceErrors.length > 0 || allGapErrors.length > 0 || totalUploadErrors > 0
    console.log(`\n${'═'.repeat(70)}`)
    if (hasErrors) {
        console.log(`❌ FALLITO: ${allCoherenceErrors.length} errori coerenza, ${allGapErrors.length} gap, ${totalUploadErrors} upload falliti`)
    } else {
        console.log(`✅ TUTTO OK: 0 errori coerenza, 0 gap, 0 upload falliti`)
    }
    console.log(`${'═'.repeat(70)}`)

    process.exit(hasErrors ? 1 : 0)
}

main().catch(err => {
    console.error('❌ FATAL:', err)
    process.exit(1)
})
