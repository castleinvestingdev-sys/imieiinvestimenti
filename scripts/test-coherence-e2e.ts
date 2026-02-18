/**
 * End-to-end coherence test: simulates what a user would do.
 * 1. Logs in to Supabase
 * 2. Deletes existing analyses for each bank
 * 3. Uploads PDFs one by one (chronological order)
 * 4. After each upload, checks coherence between consecutive periods
 * 5. Reports any issues
 *
 * Usage: npx tsx scripts/test-coherence-e2e.ts [--bank=CA115|CA591|CA990|INTESA|GENERALI] [--dry-run]
 */
import { readFileSync, readdirSync } from 'fs'
import path from 'path'

const BASE_URL = 'http://localhost:3000'
const EMAIL = 'leonrivas27@gmail.com'
const PASSWORD = '123456'

// Bank configurations
const BANKS: Record<string, { dir: string; label: string }> = {
    CA115: { dir: '/Users/leon/Desktop/banche EC/Credit Agricole/Dossier Titoli/115', label: 'Crédit Agricole 115' },
    CA591: { dir: '/Users/leon/Desktop/banche EC/Credit Agricole/Dossier Titoli/591', label: 'Crédit Agricole 591' },
    CA990: { dir: '/Users/leon/Desktop/banche EC/Credit Agricole/Dossier Titoli/990', label: 'Crédit Agricole 990' },
    INTESA: { dir: '/Users/leon/Desktop/banche EC/BANCA INTESA/BANCA INTESA/Dossier titoli', label: 'Banca Intesa' },
    GENERALI: { dir: '/Users/leon/Desktop/banche EC/banca generali', label: 'Banca Generali' },
}

interface DryRunResult {
    success: boolean
    type?: string
    bank?: string
    period?: string
    account?: string
    holdingsCount?: number
    movementsCount?: number
    portfolioTotal?: number
    coherenceErrors?: any[]
    holdings?: { isin: string; name: string; qty: number; price: number; mktVal: number }[]
    movements?: { isin: string; name: string; op: string; qty: number; price: number; gross: number; date: string }[]
    error?: string
}

interface PeriodData {
    file: string
    period: string
    account: string
    holdings: Map<string, number>  // ISIN → qty
    movements: Map<string, { buys: number; sells: number }> // ISIN → {buys, sells}
    portfolioTotal: number
}

// Login and get auth token
async function login(): Promise<string> {
    const { createClient } = await import('@supabase/supabase-js')
    // Read env from .env.local
    const envPath = path.join(process.cwd(), '.env.local')
    const envContent = readFileSync(envPath, 'utf-8')
    const env: Record<string, string> = {}
    envContent.split('\n').forEach(line => {
        const [key, ...vals] = line.split('=')
        if (key && vals.length) env[key.trim()] = vals.join('=').trim()
    })

    const supabase = createClient(
        env.NEXT_PUBLIC_SUPABASE_URL,
        env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
    const { data, error } = await supabase.auth.signInWithPassword({
        email: EMAIL,
        password: PASSWORD,
    })
    if (error) throw new Error(`Login failed: ${error.message}`)
    return data.user.id
}

// Upload a single PDF in dryRun mode
async function uploadPdf(filePath: string, userId: string): Promise<DryRunResult> {
    const fileBuffer = readFileSync(filePath)
    const fileName = path.basename(filePath)

    const formData = new FormData()
    formData.append('file', new Blob([fileBuffer], { type: 'application/pdf' }), fileName)
    formData.append('userId', userId)
    formData.append('dryRun', 'true')

    const resp = await fetch(`${BASE_URL}/api/parse-pdf`, {
        method: 'POST',
        body: formData,
    })

    if (!resp.ok) {
        const text = await resp.text()
        return { success: false, error: `HTTP ${resp.status}: ${text.substring(0, 200)}` }
    }

    return await resp.json()
}

// Check coherence between consecutive periods
function checkCoherence(periods: PeriodData[]): { ok: boolean; details: string[] } {
    const details: string[] = []

    for (let i = 1; i < periods.length; i++) {
        const prev = periods[i - 1]
        const curr = periods[i]

        // For each ISIN in current period: calcInit = currentQty - buys + sells
        // Should match prev period's qty
        const allIsins = new Set([
            ...prev.holdings.keys(),
            ...curr.holdings.keys(),
            ...curr.movements.keys(),
        ])

        const mismatches: string[] = []

        for (const isin of allIsins) {
            const prevQty = prev.holdings.get(isin) || 0
            const currQty = curr.holdings.get(isin) || 0
            const mov = curr.movements.get(isin) || { buys: 0, sells: 0 }
            const calcInit = currQty - mov.buys + mov.sells

            // If no movements and fully appeared/disappeared, skip (expected for PDFs without MOVIMENTI)
            if (mov.buys === 0 && mov.sells === 0) {
                if ((prevQty > 0 && currQty === 0) || (prevQty === 0 && currQty > 0)) {
                    continue // Can't verify without movements data
                }
            }

            if (Math.abs(calcInit - prevQty) > 0.01) {
                mismatches.push(`  ${isin}: prevQty=${prevQty.toFixed(4)}, calcInit=${calcInit.toFixed(4)} (curr=${currQty.toFixed(4)} - buys=${mov.buys.toFixed(4)} + sells=${mov.sells.toFixed(4)}), diff=${(calcInit - prevQty).toFixed(4)}`)
            }
        }

        if (mismatches.length > 0) {
            details.push(`❌ ${curr.period} vs ${prev.period}: ${mismatches.length} mismatch(es)`)
            mismatches.forEach(m => details.push(m))
        } else {
            details.push(`✅ ${curr.period} vs ${prev.period}: OK`)
        }
    }

    return {
        ok: details.every(d => d.startsWith('✅')),
        details,
    }
}

async function testBank(bankKey: string, bank: typeof BANKS[string], userId: string, dryRunOnly: boolean) {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`🏦 ${bank.label} (${bankKey})`)
    console.log(`${'='.repeat(60)}`)

    // Get PDF files sorted chronologically
    const files = readdirSync(bank.dir)
        .filter(f => f.toLowerCase().endsWith('.pdf'))
        .sort() // Filename starts with YYMMDD, so alphabetical = chronological
        .map(f => path.join(bank.dir, f))

    console.log(`📁 ${files.length} PDF trovati\n`)

    const periods: PeriodData[] = []
    let errorCount = 0

    for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const fileName = path.basename(file)
        process.stdout.write(`[${i + 1}/${files.length}] ${fileName}... `)

        try {
            const result = await uploadPdf(file, userId)

            if (!result.success) {
                console.log(`❌ ${result.error}`)
                errorCount++
                continue
            }

            if (result.type !== 'DOSSIER') {
                console.log(`⏭️  Tipo: ${result.type} (skip)`)
                continue
            }

            // Build period data
            const holdings = new Map<string, number>()
            const movements = new Map<string, { buys: number; sells: number }>()

            for (const h of result.holdings || []) {
                if (h.isin) holdings.set(h.isin, h.qty || 0)
            }

            for (const m of result.movements || []) {
                if (!m.isin) continue
                const existing = movements.get(m.isin) || { buys: 0, sells: 0 }
                if (m.op === 'Acquisto') existing.buys += m.qty || 0
                else if (m.op === 'Vendita') existing.sells += m.qty || 0
                movements.set(m.isin, existing)
            }

            periods.push({
                file: fileName,
                period: result.period || '?',
                account: result.account || '?',
                holdings,
                movements,
                portfolioTotal: result.portfolioTotal || 0,
            })

            console.log(`✅ ${result.holdingsCount} titoli, ${result.movementsCount} mov, €${(result.portfolioTotal || 0).toFixed(0)}`)

            // Self-coherence check (negative calcInit)
            if (result.coherenceErrors && result.coherenceErrors.length > 0) {
                console.log(`  ⚠️  Self-coherence errors:`)
                result.coherenceErrors.forEach(e => {
                    console.log(`    ${e.isin}: ${e.issue} (qty=${e.qty}, buys=${e.buys}, sells=${e.sells})`)
                })
            }

            // Cross-period coherence check after each upload (like a user would see on dashboard)
            if (periods.length >= 2) {
                const lastTwo = periods.slice(-2)
                const coh = checkCoherence(lastTwo)
                if (!coh.ok) {
                    coh.details.filter(d => d.startsWith('❌') || d.startsWith('  ')).forEach(d => console.log(`  ${d}`))
                }
            }
        } catch (err: any) {
            console.log(`❌ Error: ${err.message}`)
            errorCount++
        }
    }

    // Final cross-period coherence summary
    if (periods.length >= 2) {
        console.log(`\n--- Riepilogo coerenza ${bank.label} ---`)
        const coh = checkCoherence(periods)
        coh.details.forEach(d => console.log(d))
        return coh.ok
    } else {
        console.log(`\n⚠️  Solo ${periods.length} periodo(i) — coerenza non verificabile`)
        return true
    }
}

async function main() {
    const args = process.argv.slice(2)
    const bankArg = args.find(a => a.startsWith('--bank='))?.split('=')[1]
    const dryRunOnly = args.includes('--dry-run')

    console.log('🔐 Login...')
    const userId = await login()
    console.log(`✅ Logged in (user: ${userId})\n`)

    const bankKeys = bankArg ? [bankArg.toUpperCase()] : Object.keys(BANKS)
    const results: Record<string, boolean> = {}

    for (const key of bankKeys) {
        const bank = BANKS[key]
        if (!bank) {
            console.log(`❌ Banca sconosciuta: ${key}. Opzioni: ${Object.keys(BANKS).join(', ')}`)
            continue
        }
        results[key] = await testBank(key, bank, userId, dryRunOnly)
    }

    // Final summary
    console.log(`\n${'='.repeat(60)}`)
    console.log(`📊 RIEPILOGO FINALE`)
    console.log(`${'='.repeat(60)}`)
    for (const [key, ok] of Object.entries(results)) {
        console.log(`${ok ? '✅' : '❌'} ${BANKS[key].label}: ${ok ? 'Coerenza OK' : 'PROBLEMI DI COERENZA'}`)
    }
}

main().catch(console.error)
