import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as https from 'https'
import crypto from 'crypto'

// Allow up to 5 minutes for Gemini PDF processing
export const maxDuration = 300

// Module-level cache for Gemini system instruction (persists across warm invocations)
let cachedContentName: string | null = null
let cachedContentExpiry: number = 0
const CACHE_TTL_SECONDS = 3600 // 1 hour

// Funzione per riparare JSON troncato (spostata fuori per evitare errori strict mode)
function repairTruncatedJson(jsonStr: string): string | null {
    let repaired = jsonStr

    // Phase 1: Traccia stato stringa con gestione escape corretta
    let inString = false
    let lastStringStart = -1

    for (let i = 0; i < repaired.length; i++) {
        const char = repaired[i]
        if (inString) {
            if (char === '\\') {
                i++ // skip carattere successivo (gestisce \\, \", \n, \t, etc.)
                continue
            }
            if (char === '"') {
                inString = false
            }
        } else {
            if (char === '"') {
                inString = true
                lastStringStart = i
            }
        }
    }

    // Phase 2: Se troncato dentro una stringa, taglia prima della chiave incompleta
    if (inString && lastStringStart > 0) {
        repaired = repaired.substring(0, lastStringStart)
        repaired = repaired.replace(/,?\s*$/, '')
    }

    // Phase 3: Rimuovi valori primitivi incompleti (tru, fal, nul, numeri parziali)
    repaired = repaired.replace(/,\s*"[^"]*"\s*:\s*(tru|fal|nul|[\d.eE+-]*)?\s*$/, '')
    repaired = repaired.replace(/:\s*(tru|fal|nul)?\s*$/, ': null')

    // Phase 4: Rimuovi virgola finale
    repaired = repaired.replace(/,\s*$/, '')

    // Phase 5: Conta brackets/braces con scanning escape-aware
    let openBraces = 0
    let openBrackets = 0
    inString = false

    for (let i = 0; i < repaired.length; i++) {
        const char = repaired[i]
        if (inString) {
            if (char === '\\') { i++; continue }
            if (char === '"') { inString = false }
        } else {
            if (char === '"') { inString = true }
            else if (char === '{') openBraces++
            else if (char === '}') openBraces--
            else if (char === '[') openBrackets++
            else if (char === ']') openBrackets--
        }
    }

    // Phase 6: Chiudi strutture non chiuse
    while (openBrackets > 0) { repaired += ']'; openBrackets-- }
    while (openBraces > 0) { repaired += '}'; openBraces-- }

    // Phase 7: Valida che il risultato sia JSON valido
    try {
        JSON.parse(repaired)
        return repaired
    } catch {
        return null
    }
}

// === ITALIAN NUMBER FORMAT FIX ===
// Rileva "1.000" (italiano per 1000) interpretato come 1.0 dall'AI.
// Testa moltiplicatori 1000 e 1000000, corregge solo se il rapporto originale
// è sbagliato > 50% e quello corretto è vicino (< 15%).
function normalizeItalianQuantity(
    quantity: number,
    price: number,
    referenceValue: number,
    exchangeRate: number = 1
): number {
    if (quantity <= 0 || price <= 0 || referenceValue <= 0) return quantity

    for (const multiplier of [1000, 1000000]) {
        const originalExpected = quantity * price * exchangeRate
        const correctedExpected = quantity * multiplier * price * exchangeRate

        const originalRatio = Math.abs(originalExpected - referenceValue) / referenceValue
        const correctedRatio = Math.abs(correctedExpected - referenceValue) / referenceValue

        if (originalRatio > 0.5 && correctedRatio < 0.15) {
            return quantity * multiplier
        }
    }

    return quantity
}

// === BOND PRICE NORMALIZATION ===
// Obbligazioni (BTP, BOT, CCT, CTZ, corporate bonds) sono quotate in "centesimi"
// ovvero percentuale del valore nominale (es. 98,79 = 98,79% del nominale).
// Il prezzo reale è price / 100 (es. 0,9879 EUR per EUR nominale).
function isBondQuotedInCentesimi(name: string): boolean {
    if (!name) return false
    const upper = name.toUpperCase()
    // Titoli di stato italiani — sempre quotati in percentuale
    if (/\b(BTP|BOT|CCT|CTZ)\b/.test(upper)) return true
    // Obbligazioni dirette (non fondi obbligazionari)
    if (/\bOBBLIGAZION[EI]\b/.test(upper) && !/OBBLIGAZIONARI/i.test(upper)) return true
    // Bond con cedola nel nome (es. "ENI 4.75% 2028") — escludendo fondi/ETF
    if (/\d+[,.]?\d*\s*%/.test(name) && !/\b(FUND|FONDO|ETF|SICAV|COMPARTO|CLASSE)\b/i.test(upper)) return true
    return false
}

function normalizeBondPrice(price: number): number {
    // Price quoted as percentage (e.g., 98.79) → real price (0.9879)
    return price / 100
}

// === PORTFOLIO VALIDATION HELPERS ===

function validatePortfolioTotals(parsed: any): {
    needsRetry: boolean
    gap: number
    gapPercent: number
    sumOfMarketValues: number
    extractedTotal: number
} {
    const holdings = parsed.finalPortfolio || []
    const extractedTotal = parsed.summary?.portfolio_total_extracted || 0

    if (extractedTotal <= 0 || holdings.length === 0) {
        return { needsRetry: false, gap: 0, gapPercent: 0, sumOfMarketValues: 0, extractedTotal }
    }

    const sumOfMarketValues = holdings.reduce(
        (acc: number, h: any) => acc + (h.marketValue || 0), 0
    )

    const gap = Math.abs(extractedTotal - sumOfMarketValues)
    const gapPercent = (gap / extractedTotal) * 100

    // Don't retry if the sum is ~1000x the total (Italian decimal misinterpretation — fixed in normalization)
    const ratio = sumOfMarketValues / extractedTotal
    if (ratio > 800 && ratio < 1200) {
        return { needsRetry: false, gap, gapPercent, sumOfMarketValues, extractedTotal }
    }

    // Trigger retry only if gap is significant (> 0.5% of total AND > 50€)
    const needsRetry = gap > 50 && gapPercent > 0.5

    return { needsRetry, gap, gapPercent, sumOfMarketValues, extractedTotal }
}

function findSuspiciousMissingIsins(
    currentHoldings: any[],
    currentSecurityMovements: any[],
    prevHoldings: any[]
): Array<{ isin: string; name: string; prevQuantity: number }> {
    const currentIsinSet = new Set(
        currentHoldings.map((h: any) => h.isin).filter(Boolean)
    )

    const soldIsins = new Set(
        currentSecurityMovements
            .filter((m: any) => m.operationType === 'Vendita')
            .map((m: any) => m.isin)
            .filter(Boolean)
    )

    const suspicious: Array<{ isin: string; name: string; prevQuantity: number }> = []

    for (const h of prevHoldings) {
        if (!h.isin) continue
        if (currentIsinSet.has(h.isin)) continue
        if (soldIsins.has(h.isin)) continue
        if ((h.quantity || 0) <= 0) continue
        if ((h.marketValue || 0) <= 0) continue

        suspicious.push({
            isin: h.isin,
            name: h.name || h.isin,
            prevQuantity: h.quantity || 0
        })
    }

    return suspicious
}

function mergeTargetedFindings(
    parsed: any,
    findings: any[]
): { merged: number; skipped: number } {
    const existingIsins = new Set(
        (parsed.finalPortfolio || []).map((h: any) => h.isin).filter(Boolean)
    )

    let merged = 0
    let skipped = 0

    for (const f of findings) {
        if (!f.isin) { skipped++; continue }
        if (existingIsins.has(f.isin)) { skipped++; continue }
        if (!f.quantity || f.quantity <= 0) { skipped++; continue }
        if (!f.marketValue || f.marketValue <= 0) { skipped++; continue }

        if (!parsed.finalPortfolio) parsed.finalPortfolio = []
        parsed.finalPortfolio.push({
            isin: f.isin,
            name: f.name || f.isin,
            assetType: f.assetType || 'Fondo',
            currency: f.currency || 'EUR',
            exchangeRate: f.exchangeRate || 1,
            quantity: f.quantity,
            price: f.price || 0,
            marketValue: f.marketValue
        })
        existingIsins.add(f.isin)
        merged++
    }

    return { merged, skipped }
}

function parseFlexibleNumber(value: any): number {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0
    }
    if (typeof value !== 'string') return 0

    const cleaned = value
        .trim()
        .replace(/\s+/g, '')
        .replace(/[€$£]/g, '')

    if (!cleaned) return 0

    // Italian format: 1.234,56 -> 1234.56
    if (cleaned.includes(',') && cleaned.includes('.')) {
        const normalized = cleaned.replace(/\./g, '').replace(',', '.')
        const parsed = Number(normalized)
        return Number.isFinite(parsed) ? parsed : 0
    }

    // Italian decimal comma: 12,34 -> 12.34
    if (cleaned.includes(',')) {
        const normalized = cleaned.replace(',', '.')
        const parsed = Number(normalized)
        return Number.isFinite(parsed) ? parsed : 0
    }

    // Italian thousands with dots only: 20.000 -> 20000
    if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
        const normalized = cleaned.replace(/\./g, '')
        const parsed = Number(normalized)
        return Number.isFinite(parsed) ? parsed : 0
    }

    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : 0
}

function normalizeDateToItalian(value: any): string {
    if (typeof value !== 'string') return ''
    const s = value.trim()
    if (!s) return ''

    // Already DD/MM/YYYY or DD.MM.YYYY or DD-MM-YYYY
    let m = s.match(/^(\d{2})[\/\.-](\d{2})[\/\.-](\d{4})$/)
    if (m) return `${m[1]}/${m[2]}/${m[3]}`

    // ISO YYYY-MM-DD
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (m) return `${m[3]}/${m[2]}/${m[1]}`

    return s
}

function inferSecurityOperationType(raw: any): 'Acquisto' | 'Vendita' {
    const op = String(raw?.operationType || raw?.operation_type || '').toLowerCase()
    const text = `${raw?.description || ''} ${raw?.name || ''}`.toLowerCase()

    if (
        op.includes('vend') || op.includes('riscatt') || op.includes('disinv') ||
        op.includes('scaric') || op.includes('switch out') ||
        /vend|riscatt|disinv|switch out|scarico|liquidaz|prelievo quote/.test(text)
    ) {
        return 'Vendita'
    }

    return 'Acquisto'
}

function normalizeSecurityMovementRecord(raw: any): any | null {
    if (!raw || typeof raw !== 'object') return null

    const rawText = `${raw?.isin || ''} ${raw?.name || ''} ${raw?.description || ''}`.toUpperCase()
    const isinFromText = rawText.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/)?.[0] || ''
    const isin = String(raw?.isin || isinFromText).trim().toUpperCase()
    if (!isin) return null

    const operationType = inferSecurityOperationType(raw)

    let quantity = Math.abs(parseFlexibleNumber(raw?.quantity))
    let price = Math.abs(parseFlexibleNumber(raw?.price))
    let exchangeRate = parseFlexibleNumber(raw?.exchangeRate)
    if (exchangeRate <= 0) exchangeRate = 1

    let grossAmount = Math.abs(parseFlexibleNumber(raw?.grossAmount))
    let netAmount = Math.abs(parseFlexibleNumber(raw?.netAmount ?? raw?.amount))

    if (quantity <= 0 && grossAmount > 0 && price > 0) {
        quantity = grossAmount / (price * exchangeRate)
    }
    if (quantity <= 0) return null

    if (grossAmount <= 0 && quantity > 0 && price > 0) {
        grossAmount = quantity * price * exchangeRate
    }
    if (netAmount <= 0) {
        netAmount = grossAmount
    }

    const fees = Math.abs(parseFlexibleNumber(raw?.fees))
    const taxes = Math.abs(parseFlexibleNumber(raw?.taxes))

    const currencyRaw = String(raw?.currency || '').trim().toUpperCase()
    const currency = currencyRaw || 'EUR'

    const nameRaw = String(raw?.name || raw?.description || isin).trim()
    const name = nameRaw.replace(new RegExp(`\\b${isin}\\b`, 'gi'), '').trim() || isin

    return {
        isin,
        date: normalizeDateToItalian(raw?.date),
        name,
        operationType,
        quantity,
        price,
        exchangeRate,
        currency,
        grossAmount,
        fees,
        taxes,
        netAmount
    }
}

function normalizeSecurityMovementsArray(rawMovements: any[]): any[] {
    if (!Array.isArray(rawMovements)) return []

    const normalized = rawMovements
        .map((m: any) => normalizeSecurityMovementRecord(m))
        .filter((m: any) => m !== null)

    const seen = new Set<string>()
    const unique: any[] = []

    for (const m of normalized) {
        const key = [
            m.isin,
            m.date || '',
            m.operationType,
            Number(m.quantity).toFixed(6),
            Number(m.netAmount).toFixed(2)
        ].join('|')

        if (seen.has(key)) continue
        seen.add(key)
        unique.push(m)
    }

    return unique
}

function extractTitleMovementCandidates(rawMovements: any[]): any[] {
    if (!Array.isArray(rawMovements)) return []

    return rawMovements.filter((m: any) => {
        const movementType = String(m?.movement_type || '').toLowerCase()
        if (movementType === 'acquisto' || movementType === 'vendita') return true

        const desc = String(m?.description || '').toLowerCase()
        return /acquisto|vendita|sottosc|riscatt|disinv|switch in|switch out|nota inf\./.test(desc)
    })
}

async function recoverSecurityMovementsFromPdf(
    apiKey: string,
    model: string,
    pdfBase64: string
): Promise<any[]> {
    const recoveryPrompt = `Estrai SOLO i movimenti titoli (acquisto/vendita) dal documento PDF.

Regole:
- Cerca la sezione "Movimenti" / "Operazioni" del dossier titoli.
- Ogni riga della tabella titoli deve diventare un elemento di "securityMovements".
- "Sottoscrizione", "Acquisto", "Switch In", "Carico" => operationType "Acquisto"
- "Vendita", "Riscatto", "Switch Out", "Disinvestimento", "Scarico" => operationType "Vendita"
- quantity deve essere positiva.
- netAmount deve essere positivo.
- currency default "EUR", exchangeRate default 1.
- Se grossAmount non è esplicitato, usa quantity * price * exchangeRate.
- NON includere movimenti di conto corrente non titoli.`

    const responseText = await callGemini(apiKey, model, recoveryPrompt, pdfBase64)

    let parsed: any = null
    try {
        parsed = JSON.parse(responseText)
    } catch {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/)
        if (!jsonMatch) return []
        try {
            parsed = JSON.parse(jsonMatch[0])
        } catch {
            const repaired = repairTruncatedJson(jsonMatch[0])
            if (repaired) parsed = JSON.parse(repaired)
        }
    }

    return normalizeSecurityMovementsArray(parsed?.securityMovements || [])
}

// === CROSS-FIELD VALIDATION ===
// Programmatic checks that catch extraction errors without AI calls.
function crossFieldValidation(parsed: any): {
    issues: string[]
    holdingIssues: Array<{ isin: string; name: string; issue: string }>
    movementIssues: Array<{ index: number; issue: string }>
} {
    const issues: string[] = []
    const holdingIssues: Array<{ isin: string; name: string; issue: string }> = []
    const movementIssues: Array<{ index: number; issue: string }> = []

    // --- ISIN validation ---
    const isinRegex = /^[A-Z]{2}[A-Z0-9]{10}$/
    const holdings = parsed.finalPortfolio || []
    const secMov = parsed.securityMovements || []

    for (const h of holdings) {
        if (h.isin && !isinRegex.test(h.isin)) {
            holdingIssues.push({ isin: h.isin, name: h.name || '', issue: `ISIN formato invalido: ${h.isin}` })
        }
        // qty × price ≈ marketValue (with bond and FX handling)
        if (h.quantity > 0 && h.price > 0 && h.marketValue > 0) {
            const fx = h.exchangeRate || 1
            // Try multiple formulas to find the best match:
            // 1. Standard: qty × price (no fx or fx=1)
            // 2. Standard with fx multiply: qty × price × fx
            // 3. Standard with fx divide: qty × price / fx
            // 4. Bond: (qty/100) × price (nominal qty, percentage price)
            // 5. Bond with fx multiply: (qty/100) × price × fx
            // 6. Bond with fx divide: (qty/100) × price / fx
            const candidates = [
                h.quantity * h.price,
                h.quantity * h.price * fx,
                fx > 1 ? h.quantity * h.price / fx : Infinity,
                (h.quantity / 100) * h.price,
                (h.quantity / 100) * h.price * fx,
                fx > 1 ? (h.quantity / 100) * h.price / fx : Infinity,
            ]
            const bestMatch = candidates.reduce((best, c) =>
                Math.abs(c - h.marketValue) < Math.abs(best - h.marketValue) ? c : best
            )
            const diff = Math.abs(bestMatch - h.marketValue)
            const pct = (diff / h.marketValue) * 100
            if (pct > 15 && diff > 50) {
                holdingIssues.push({
                    isin: h.isin || '',
                    name: h.name || '',
                    issue: `Nessuna formula qty×price corrisponde a marketValue(${h.marketValue}) [best: ${bestMatch.toFixed(2)}, ${pct.toFixed(0)}% off]`
                })
            }
        }
        // Negative quantity
        if ((h.quantity || 0) < 0) {
            holdingIssues.push({ isin: h.isin || '', name: h.name || '', issue: 'Quantità negativa' })
        }
    }

    // --- Portfolio total check ---
    const extractedTotal = parsed.summary?.portfolio_total_extracted || 0
    if (extractedTotal > 0 && holdings.length > 0) {
        const sumMarket = holdings.reduce((s: number, h: any) => s + (h.marketValue || 0), 0)
        const gap = Math.abs(extractedTotal - sumMarket)
        const gapPct = (gap / extractedTotal) * 100
        if (gapPct > 2 && gap > 100) {
            issues.push(`Somma holdings (${sumMarket.toFixed(2)}) ≠ portfolio_total_extracted (${extractedTotal.toFixed(2)}) [gap ${gapPct.toFixed(1)}%]`)
        }
    }

    // --- Date validation ---
    const periodStart = parsed.info?.period_start
    const periodEnd = parsed.info?.period_end
    if (periodStart && periodEnd) {
        const pStart = new Date(periodStart)
        const pEnd = new Date(periodEnd)
        if (pEnd < pStart) {
            issues.push(`period_end (${periodEnd}) prima di period_start (${periodStart})`)
        }
        // Check movement dates are within period (with 30-day grace for value dates)
        const movements = parsed.movements || []
        const graceDays = 30
        const minDate = new Date(pStart.getTime() - graceDays * 86400000)
        const maxDate = new Date(pEnd.getTime() + graceDays * 86400000)
        for (let i = 0; i < movements.length; i++) {
            const m = movements[i]
            if (!m.date) continue
            const parts = m.date.split('/')
            if (parts.length !== 3) continue
            const mDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`)
            if (mDate < minDate || mDate > maxDate) {
                movementIssues.push({
                    index: i,
                    issue: `Data ${m.date} fuori periodo ${periodStart}..${periodEnd}`
                })
            }
        }
    }

    // --- Balance math (solo LIQUIDITY — i DOSSIER non hanno movimenti di cassa) ---
    const movements = parsed.movements || []
    const initial = parsed.summary?.initial_balance?.value || 0
    const final_ = parsed.summary?.final_balance?.value || 0
    if (parsed.type !== 'DOSSIER' && (initial !== 0 || final_ !== 0) && movements.length > 0) {
        const sum = movements.reduce((s: number, m: any) => s + (m.amount || 0), 0)
        const expected = final_ - initial
        const error = Math.abs(expected - sum)
        if (error > 1) {
            issues.push(`Errore matematico: saldo_finale(${final_}) - saldo_iniziale(${initial}) = ${expected.toFixed(2)}, somma_movimenti = ${sum.toFixed(2)} [diff ${error.toFixed(2)}€]`)
        }
    }

    // --- Security movements ISIN check ---
    for (const m of secMov) {
        if (m.isin && !isinRegex.test(m.isin)) {
            issues.push(`Security movement ISIN invalido: ${m.isin}`)
        }
        if ((m.quantity || 0) < 0) {
            issues.push(`Security movement quantità negativa: ${m.isin} qty=${m.quantity}`)
        }
    }

    return { issues, holdingIssues, movementIssues }
}

// === GEMINI CONTEXT CACHING ===
// Caches the system prompt on Google's servers to save 75-90% on cached tokens.
// Cache persists for 1 hour and is reused across warm invocations.
// Falls back gracefully to inline system_instruction if caching fails (e.g., content too small).

function createGeminiCache(apiKey: string, model: string, systemPrompt: string): Promise<string | null> {
    return new Promise((resolve) => {
        const requestBody = JSON.stringify({
            model: `models/${model}`,
            system_instruction: {
                parts: [{ text: systemPrompt }]
            },
            ttl: `${CACHE_TTL_SECONDS}s`
        })

        const reqOptions = {
            hostname: 'generativelanguage.googleapis.com',
            port: 443,
            path: `/v1beta/cachedContents?key=${apiKey}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(requestBody)
            }
        }

        const req = https.request(reqOptions, (res) => {
            let data = ''
            res.on('data', (chunk: Buffer) => { data += chunk.toString() })
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const json = JSON.parse(data)
                        resolve(json.name || null)
                    } catch {
                        resolve(null)
                    }
                } else {
                    console.log(`[CACHE] Context caching non disponibile (HTTP ${res.statusCode}): ${data.substring(0, 200)}`)
                    resolve(null)
                }
            })
        })

        req.on('error', () => resolve(null))
        req.write(requestBody)
        req.end()
    })
}

async function getOrCreateCache(apiKey: string, model: string, systemPrompt: string): Promise<string | null> {
    // Check if existing cache is still valid (expire 1 min early for safety)
    if (cachedContentName && Date.now() < cachedContentExpiry) {
        return cachedContentName
    }

    const name = await createGeminiCache(apiKey, model, systemPrompt)
    if (name) {
        cachedContentName = name
        cachedContentExpiry = Date.now() + (CACHE_TTL_SECONDS - 60) * 1000
        console.log(`[CACHE] Context cache creata: ${name}`)
    }
    return name
}

// === GEMINI API CALLS ===
// Sends PDF as base64 inline data directly to Gemini vision (no OCR needed).
// Uses system_instruction, JSON schema enforcement, media_resolution_high, and thinking config.

// JSON schema enforced by Gemini — ensures exact output structure
const PARSE_PDF_JSON_SCHEMA = {
    type: 'object',
    properties: {
        type: { type: 'string', enum: ['DOSSIER', 'LIQUIDITY', 'UNOFFICIAL'] },
        layout_detected: { type: 'string' },
        info: {
            type: 'object',
            properties: {
                bankName: { type: 'string' },
                accountNumber: { type: 'string' },
                period_start: { type: 'string' },
                period_end: { type: 'string' },
                holder: { type: 'string' },
                settlementAccount: { type: 'string' }
            },
            required: ['bankName', 'period_start', 'period_end']
        },
        scalar_data: {
            type: 'object',
            properties: {
                numeri_creditori: { type: 'number' },
                numeri_debitori: { type: 'number' },
                interessi_attivi_lordi: { type: 'number' },
                interessi_passivi_lordi: { type: 'number' },
                interessi_creditori_periodi: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            data: { type: 'string' },
                            interessi: { type: 'number' }
                        }
                    }
                },
                tasso_attivo: { type: 'string' },
                tasso_passivo: { type: 'string' },
                acquisto_titoli_count: { type: 'number' },
                vendita_titoli_count: { type: 'number' },
                movimenti_titoli_count: { type: 'number' },
                acquisto_titoli_amount: { type: 'number' },
                vendita_titoli_amount: { type: 'number' }
            }
        },
        movements: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    date: { type: 'string' },
                    description: { type: 'string' },
                    amount: { type: 'number' },
                    sign_source: { type: 'string' },
                    movement_type: { type: 'string', enum: ['Commissioni', 'Acquisto', 'Vendita', 'Proventi', 'Altro'] }
                },
                required: ['date', 'description', 'amount', 'movement_type']
            }
        },
        summary: {
            type: 'object',
            properties: {
                initial_balance: {
                    type: 'object',
                    properties: { value: { type: 'number' }, source: { type: 'string' } },
                    required: ['value']
                },
                final_balance: {
                    type: 'object',
                    properties: { value: { type: 'number' }, source: { type: 'string' } },
                    required: ['value']
                },
                total_movements_amount: {
                    type: 'object',
                    properties: { value: { type: 'number' }, source: { type: 'string' } }
                },
                total_commissions: {
                    type: 'object',
                    properties: { value: { type: 'number' }, source: { type: 'string' } }
                },
                total_proventi: {
                    type: 'object',
                    properties: { value: { type: 'number' }, source: { type: 'string' } }
                },
                math_verification: {
                    type: 'object',
                    properties: {
                        expected_delta: { type: 'number' },
                        actual_sum: { type: 'number' },
                        matches: { type: 'boolean' }
                    }
                },
                portfolio_total_extracted: { type: 'number' },
                portfolio_currency: { type: 'string' }
            }
        },
        finalPortfolio: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    isin: { type: 'string' },
                    name: { type: 'string' },
                    assetType: { type: 'string' },
                    currency: { type: 'string' },
                    exchangeRate: { type: 'number' },
                    quantity: { type: 'number' },
                    price: { type: 'number' },
                    marketValue: { type: 'number' }
                },
                required: ['isin', 'name', 'quantity', 'marketValue']
            }
        },
        securityMovements: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    isin: { type: 'string' },
                    date: { type: 'string' },
                    name: { type: 'string' },
                    operationType: { type: 'string', enum: ['Acquisto', 'Vendita'] },
                    quantity: { type: 'number' },
                    price: { type: 'number' },
                    exchangeRate: { type: 'number' },
                    currency: { type: 'string' },
                    grossAmount: { type: 'number' },
                    fees: { type: 'number' },
                    taxes: { type: 'number' },
                    netAmount: { type: 'number' }
                },
                required: ['isin', 'name', 'operationType', 'quantity']
            }
        },
        dividends: { type: 'array' }
    },
    required: ['type', 'info', 'movements', 'summary']
}

function callGemini(
    apiKey: string,
    model: string,
    systemPrompt: string,
    pdfBase64: string,
    options?: { thinkingLevel?: string; jsonSchema?: any; cachedContent?: string }
): Promise<string> {
    return new Promise((resolve, reject) => {
        const thinkingLevel = options?.thinkingLevel || 'low'
        const jsonSchema = options?.jsonSchema || null

        const generationConfig: any = {
            responseMimeType: 'application/json',
            temperature: 0,
            topP: 1,
            topK: 1,
            maxOutputTokens: 200000,
            thinkingConfig: {
                thinkingLevel
            }
        }

        // Add JSON schema enforcement if provided
        if (jsonSchema) {
            generationConfig.responseJsonSchema = jsonSchema
        }

        const body: any = {
            contents: [{
                parts: [
                    { text: 'Analizza questo documento PDF ed estrai i dati in formato JSON.' },
                    {
                        inlineData: { mimeType: 'application/pdf', data: pdfBase64 },
                        mediaResolution: { level: 'media_resolution_high' }
                    }
                ]
            }],
            generationConfig
        }

        // Use cached content if available, otherwise inline system_instruction
        if (options?.cachedContent) {
            body.cachedContent = options.cachedContent
        } else {
            body.system_instruction = { parts: [{ text: systemPrompt }] }
        }

        const requestBody = JSON.stringify(body)

        const reqOptions = {
            hostname: 'generativelanguage.googleapis.com',
            port: 443,
            path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(requestBody)
            },
            // No timeout - let Gemini take as long as needed (maxDuration=300s is the outer boundary)
        }

        const req = https.request(reqOptions, (res) => {
            let data = ''
            res.on('data', (chunk: Buffer) => { data += chunk.toString() })
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const json = JSON.parse(data)
                        const text = json.candidates?.[0]?.content?.parts?.[0]?.text || ''
                        resolve(text)
                    } catch (e: any) {
                        reject(new Error(`JSON parse error: ${e.message}`))
                    }
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 500)}`))
                }
            })
        })

        req.on('error', (e: Error) => reject(e))
        req.write(requestBody)
        req.end()
    })
}

// Text-only variant for recovery paths
function callGeminiWithText(apiKey: string, model: string, systemPrompt: string, documentText: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const requestBody = JSON.stringify({
            system_instruction: {
                parts: [{ text: systemPrompt }]
            },
            contents: [{
                parts: [
                    { text: documentText }
                ]
            }],
            generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0,
                topP: 1,
                topK: 1,
                maxOutputTokens: 200000,
                thinkingConfig: {
                    thinkingLevel: 'low'
                }
            }
        })

        const reqOptions = {
            hostname: 'generativelanguage.googleapis.com',
            port: 443,
            path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(requestBody)
            },
        }

        const req = https.request(reqOptions, (res) => {
            let data = ''
            res.on('data', (chunk: Buffer) => { data += chunk.toString() })
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const json = JSON.parse(data)
                        const text = json.candidates?.[0]?.content?.parts?.[0]?.text || ''
                        resolve(text)
                    } catch (e: any) {
                        reject(new Error(`JSON parse error: ${e.message}`))
                    }
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 500)}`))
                }
            })
        })

        req.on('error', (e: Error) => reject(e))
        req.write(requestBody)
        req.end()
    })
}

export async function POST(request: NextRequest) {
    const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY

    const startTime = Date.now()
    const logProgress = (stage: string, details?: string) => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
        console.log(`[${elapsed}s] 📊 ${stage}${details ? ` - ${details}` : ''}`)
    }

    try {
        console.log('\n========== NUOVA RICHIESTA PARSE PDF ==========')
        console.log('⏰ Timestamp:', new Date().toISOString())

        const formData = await request.formData()
        const file = formData.get('file') as File
        const userId = formData.get('userId') as string
        const guestEmail = formData.get('guestEmail') as string
        const forceRecalculate = formData.get('force') === 'true'
        const reanalyzeId = formData.get('reanalyzeId') as string // ID analisi da ri-analizzare

        let fileName = file?.name || 'documento.pdf'
        let pdfBuffer: Buffer
        let isReanalysis = false

        if (reanalyzeId && userId) {
            // === RE-ANALYSIS MODE: Fetch PDF from Supabase Storage or uploaded file ===
            isReanalysis = true
            logProgress('🔄 RI-ANALISI', `Recupero PDF per analisi ${reanalyzeId}`)

            let foundInStorage = false
            const supabaseForStorage = await createClient()
            const pdfStoragePath = `${userId}/${reanalyzeId}.pdf`
            const { data: pdfData, error: downloadError } = await supabaseForStorage.storage
                .from('documenti')
                .download(pdfStoragePath)

            if (!downloadError && pdfData) {
                const arrayBuf = await pdfData.arrayBuffer()
                pdfBuffer = Buffer.from(arrayBuf)
                fileName = `reanalysis_${reanalyzeId}.pdf`
                foundInStorage = true
                logProgress('📁 PDF RECUPERATO', `${(pdfBuffer.length / 1024).toFixed(0)}KB da storage`)
            } else if (file) {
                // Fallback: user re-uploaded the PDF file for re-analysis
                const fileBuffer = await file.arrayBuffer()
                pdfBuffer = Buffer.from(fileBuffer)
                fileName = file.name || `reanalysis_${reanalyzeId}.pdf`
                logProgress('📁 PDF DA UPLOAD', `${(pdfBuffer.length / 1024).toFixed(0)}KB (storage non disponibile, usato file caricato)`)
            } else {
                console.error(`[STORAGE] Download fallito: ${downloadError?.message}`)
                return NextResponse.json({
                    success: false,
                    error: 'PDF non trovato nello storage. Ricarica il PDF originale per ri-analizzare.'
                }, { status: 404 })
            }
        } else if (file && (userId || guestEmail)) {
            // === NORMAL MODE: File from upload ===
            const fileBuffer = await file.arrayBuffer()
            pdfBuffer = Buffer.from(fileBuffer)
        } else {
            console.error('[SERVER] ERRORE: File, UserId o Email mancante')
            return NextResponse.json({ success: false, error: 'File, UserId o Email mancante' }, { status: 400 })
        }

        logProgress('RICHIESTA RICEVUTA', `${fileName} (${(pdfBuffer.length / 1024).toFixed(0)}KB)`)
        console.log(`👤 UserID: ${userId || 'Guest'} | Email: ${guestEmail || 'N/A'} | Force: ${forceRecalculate} | Reanalyze: ${reanalyzeId || 'no'} | Provider: gemini`)

        if (!GEMINI_API_KEY) {
            console.error('ERRORE: GOOGLE_GEMINI_API_KEY non trovata in process.env')
            return NextResponse.json({
                success: false,
                error: 'Configurazione API Google Gemini mancante. Imposta GOOGLE_GEMINI_API_KEY in .env.local.'
            }, { status: 500 })
        }

        logProgress('API KEY CARICATA', `Gemini (lunghezza: ${GEMINI_API_KEY.length})`)

        logProgress('CONVERSIONE PDF', 'Encoding file in base64...')
        const base64Data = pdfBuffer.toString('base64')
        logProgress('PDF CONVERTITO', `${(base64Data.length / 1024).toFixed(0)}KB base64`)

        const systemPrompt = `Sei un esperto analista finanziario italiano specializzato in estratti conto bancari.
Il tuo compito è analizzare il documento PDF ed estrarre i dati in formato JSON rigoroso.

### FASE 1: CLASSIFICAZIONE DEL DOCUMENTO
- "ESTRATTO CONTO", "CONTO CORRENTE", "E/C" → type = "LIQUIDITY"
- "DOSSIER TITOLI", "ESTRATTO CONTO TITOLI" → type = "DOSSIER"

**RICONOSCIMENTO BANCA**: Normalizza il nome della banca al nome ufficiale. Banche supportate:
Intesa Sanpaolo, UniCredit, Banco BPM, BPER Banca, Monte dei Paschi di Siena, Crédit Agricole Italia (anche Cariparma, Friuladria, CA), BNL (BNP Paribas), Credem, Banca Mediolanum, FinecoBank, Banca Generali, Azimut, CheBanca! (Mediobanca Premier), Banca Sella, Banca Popolare di Sondrio, Banco di Desio, Banca di Asti, Banca Passadore, Cassa di Risparmio di Bolzano, Volksbank Alto Adige, Banca del Piemonte, Banca Carige (BPER), Banca Ifis, Illimity Bank, Banca Progetto, Banca CF+, Banca Sistema, Banca Valsabbina, Cassa Centrale Banca, Raiffeisen, Cassa Rurale, BCC (Banca di Credito Cooperativo), Iccrea Banca, Deutsche Bank Italia, ING Italia, N26, Revolut, Widiba, Webank, Buddybank, BBVA Italia, Santander Consumer Bank, Banca Aletti, Banca Euromobiliare, Fideuram, Sanpaolo Invest, IW Bank.

### FASE 1.5: DETERMINAZIONE DEL PERIODO (CRITICA)
**Per LIQUIDITY**: Il periodo NON si deduce dall'intestazione ma dai MOVIMENTI.
- **period_start**: La data della riga "SALDO INIZIALE" (o "SALDO AL", "SALDO CONTABILE INIZIALE") nella tabella movimenti. Questa è la data ESATTA di inizio periodo.
- **period_end**: La data della riga "SALDO FINALE" (o "SALDO AL", "SALDO CONTABILE FINALE") nella tabella movimenti. Questa è la data ESATTA di fine periodo.
- IMPORTANTE: Gli estratti conto possono essere trimestrali, bimestrali o mensili. NON assumere che siano sempre trimestrali. La data del saldo iniziale e finale ti dice esattamente il periodo.
- Esempio: se il saldo iniziale ha data 31/07/2025 e il saldo finale ha data 31/08/2025, allora period_start = "2025-07-31" e period_end = "2025-08-31" (è un estratto mensile).
- Esempio: se il saldo iniziale ha data 01/07/2025 e il saldo finale ha data 31/08/2025, allora period_start = "2025-07-01" e period_end = "2025-08-31" (è un estratto bimestrale).

**Per DOSSIER**: Determina il periodo ESATTO del rendiconto:
- Cerca "PERIODO RENDICONTATO", "PERIODO DI RIFERIMENTO", "DAL ... AL ..."
- "SITUAZIONE AL [data]" o "CONSISTENZA AL [data]" indica la data di FINE periodo (period_end)
- Il period_start è la fine del periodo PRECEDENTE (= inizio di questo periodo)
- Per DOSSIER MENSILI: period_start = fine mese precedente, period_end = fine mese corrente
  Esempio: "Situazione al 30/11/2024" → period_start = "2024-10-31", period_end = "2024-11-30"
  Esempio: "Situazione al 31/05/2024" → period_start = "2024-04-30", period_end = "2024-05-31"
- Per DOSSIER TRIMESTRALI: period_start = fine trimestre precedente, period_end = fine trimestre corrente
  Esempio: "Situazione al 30/09/2024" → period_start = "2024-06-30", period_end = "2024-09-30"
  Esempio: "Situazione al 31/03/2025" → period_start = "2024-12-31", period_end = "2025-03-31"
- ATTENZIONE: NON usare date di "confronto precedente", "situazione precedente" o "riferimento precedente" come period_start. Queste sono date del VECCHIO rendiconto, non di questo.
- Se il documento mostra "DAL 30/06/2024 AL 30/11/2024" ma contiene dati di UN SOLO MESE (novembre), allora period_start = "2024-10-31", period_end = "2024-11-30". La data 30/06 è un riferimento storico, non l'inizio del periodo.
- I periodi DOSSIER validi sono: ~30 giorni (mensile), ~90 giorni (trimestrale), ~180 giorni (semestrale), ~365 giorni (annuale). Se il tuo periodo non corrisponde a uno di questi, probabilmente hai preso la data di inizio sbagliata.

### REGOLE SPECIFICHE PER CRÉDIT AGRICOLE
Se il documento è di Crédit Agricole (CA, Crédit Agricole, Cariparma, Friuladria):
- Layout: DUE COLONNE SEPARATE per DARE e AVERE
- **DARE** (colonna sinistra degli importi) = USCITE = **NEGATIVO**
- **AVERE** (colonna destra degli importi) = ENTRATE = **POSITIVO**
- Un importo può apparire SOLO in una delle due colonne, mai in entrambe
- Se l'importo è nella posizione sinistra → è un DARE → **NEGATIVO**
- Se l'importo è nella posizione destra → è un AVERE → **POSITIVO**

### FASE 2: ANALISI DEL LAYOUT (CRITICA - NON SALTARE)
**PRIMA di estrarre i movimenti, DEVI analizzare il layout del documento:**

1. **IDENTIFICA LE COLONNE**: Cerca le intestazioni delle colonne nella tabella dei movimenti.
   - Possibili nomi per USCITE: "DARE", "ADDEBITI", "USCITE", "PRELIEVI", "-"
   - Possibili nomi per ENTRATE: "AVERE", "ACCREDITI", "ENTRATE", "VERSAMENTI", "+"

2. **DETERMINA LA STRUTTURA**: Il documento può avere:
   - **Due colonne separate** (DARE | AVERE) → importo nella colonna DARE = negativo, AVERE = positivo
   - **Una colonna unica** con segno (+/-) → leggi il segno direttamente
   - **Una colonna unica** senza segno → usa la posizione o il contesto per determinare il segno

3. **VERIFICA CON I SALDI**:
   - Estrai SALDO INIZIALE e SALDO FINALE dal documento
   - Calcola: Somma Movimenti = Saldo Finale - Saldo Iniziale
   - Usa questa differenza per VERIFICARE che i segni siano corretti

### FASE 3: DETERMINAZIONE DEL SEGNO (IN ORDINE DI PRIORITÀ)

**PRIORITÀ 1 - LAYOUT COLONNE**: Se il documento ha colonne DARE/AVERE separate:
- Importo in colonna DARE/ADDEBITI → NEGATIVO
- Importo in colonna AVERE/ACCREDITI → POSITIVO

**PRIORITÀ 2 - SEGNO ESPLICITO**: Se il documento mostra +/- davanti agli importi:
- Leggi il segno direttamente

**PRIORITÀ 3 - KEYWORDS NELLA DESCRIZIONE** (usa se il layout non è chiaro):
- **NEGATIVO (-)**: "ADDEBITO", "SDD", "BOLLO", "COMMISSIONI", "SPESE", "PRELIEVO", "PREL.", "PAGAMENTO", "BONIFICO A FAVORE", "V/ORDINE", "PAGAM", "EMESSO", "SOTTOSC", "SOTTOSCRIZIONE", "MAV", "RAV", "F24", "CANONE"
- **POSITIVO (+)**: "ACCREDITO", "STIPENDIO", "PENSIONE", "EMOLUMENTI", "DIVIDENDO", "CEDOLA", "BONIFICO DA", "VERSAMENTO", "RIMBORSO", "STORNO"

**PRIORITÀ 4 - VERIFICA MATEMATICA**: Se ancora ambiguo:
- Calcola la somma con entrambe le ipotesi di segno
- Scegli il segno che fa tornare: Saldo Finale - Saldo Iniziale = Somma Movimenti

**MAI ASSUMERE UN SEGNO DI DEFAULT** - Usa sempre una delle 4 priorità sopra.

### FASE 3.5: CLASSIFICAZIONE movement_type (SOLO 5 CATEGORIE)

**ESISTONO SOLO 5 CATEGORIE - USA ESCLUSIVAMENTE QUESTE:**

**"Commissioni"** - TUTTI i costi bancari e imposte:
- Commissioni di gestione e amministrazione
- Spese rendiconto, spese E/C, spese emissione E/C
- Canone mensile / canone fisso mensile
- Canone carta di debito
- Invio rendicontazione/contabili titoli
- Costo emissione comunicazione di legge
- Commissioni prelievo Bancocard
- Commissioni bonifico (es. "Comm.ne bonifico")
- Competenze Fruttifere / Competenze di chiusura (importo POSITIVO)
- Rimborso canone/spese (solo importi piccoli < 20€)
- Donazione su sportello automatico
- Storno id. op. / storno operazione
- **IMPOSTA DI BOLLO E/C e Rendiconto** → Commissioni
- **IMPOSTA DI BOLLO su Prodotti Finanziari** → Commissioni
- **Ritenuta fiscale** → Commissioni
- **Imposta transazioni finanziarie (Tobin Tax)** → Commissioni

**"Acquisto"** - Investimenti in titoli:
- Sottoscrizione fondi, PAC, acquisto titoli/ETF/obbligazioni

**"Vendita"** - Disinvestimenti:
- Riscatto fondi, vendita titoli, rimborso quote

**"Proventi"** - Rendite da investimenti:
- Cedole, dividendi, proventi titoli

**"Altro"** - TUTTO IL RESTO (categoria predefinita):
- Bonifici in entrata/uscita
- Pensione INPS, stipendio, emolumenti
- Affitto, canone locazione
- Premio polizza, assicurazione
- Prelievo contante
- Rimborsi > 20€
- Pagamenti utenze, bollette, F24, MAV, RAV
- Qualsiasi altro movimento non nelle categorie sopra

**ATTENZIONE - NON SONO COMMISSIONI (usa "Altro"):**
- Pensione INPS / Pensione / INPS
- Stipendio / Emolumenti / Retribuzione
- Affitto / Canone locazione
- Premio polizza
- Rimborsi > 20€
- Bollette / Utenze / F24 / MAV / RAV
- Prelievo contante / Prelievo ATM
- Bonifici (sia in entrata che in uscita)

**REGOLA D'ORO**: Le COMMISSIONI includono SOLO costi/spese bancarie E imposte/bolli. Tutto il resto va in "Altro"!

### FASE 4: ESTRAZIONE MOVIMENTI

**REGOLA CRITICA - ESTRARRE OGNI SINGOLO MOVIMENTO**:
- DEVI estrarre OGNI SINGOLA riga della tabella movimenti, ANCHE se hanno la stessa data e importo.
- Transazioni come "INVESTIMENTO IN FONDI COMUNI" spesso si ripetono con stessa data e stesso importo (es. 500€ per ciascun fondo). Queste sono transazioni DIVERSE e vanno estratte TUTTE.
- NON deduplicare, NON raggruppare, NON saltare transazioni simili.
- Se il PDF ha più pagine di movimenti, estrai i movimenti da TUTTE le pagine.
- NON estrarre lo stesso movimento con segni diversi.
- Se la somma non torna, probabilmente stai sbagliando i segni, NON duplicando.
- SEGNI: Commissioni, spese, canoni, imposte, donazioni, storni sono ADDEBITI → importo NEGATIVO. Competenze Fruttifere e rimborsi → importo POSITIVO.

1. **DESCRIZIONI MULTI-RIGA**:
   - Molte transazioni hanno descrizioni su più righe
   - CONCATENA le righe successive (senza data/importo) alla transazione precedente
   - Cerca keywords anche nelle righe successive

2. **FORMATI NUMERICI**:
   - Converti "1.234,56" → 1234.56 (punto come decimale)
   - Ignora simboli come \`*\` prima dei numeri
   - Ignora simboli valuta (€, EUR)

3. **FORMATI DATA**:
   - Accetta: GG/MM/AAAA, GG.MM.AAAA, GG-MM-AAAA, AAAA-MM-GG
   - Restituisci sempre: GG/MM/AAAA

### FASE 5: ESTRAZIONE DATI SCALARI (COMPETENZE)

**ISTRUZIONI DETTAGLIATE PER BANCA INTESA/INTESA SANPAOLO:**

#### 5.1 NUMERI CREDITORI E DEBITORI
Cerca nel documento la sezione "CONTO SCALARE" o "RIASSUNTO SCALARE".
Trova la riga "TOTALE NUMERI" o cerca le righe individuali con "Numeri creditori" / "Numeri debitori".

**Esempio tipico Banca Intesa:**
[ESEMPIO]
TOTALE NUMERI          0,00        5.737.125,02
                    (Debitori)    (Creditori)
[/ESEMPIO]
oppure:
[ESEMPIO]
Numeri creditori    3.282.024,02
Numeri debitori     11.113.738,56
[/ESEMPIO]

Estrai:
- **numeri_creditori**: Il valore dei numeri creditori dell'ULTIMO periodo (ultima riga con data). Se la tabella ha più righe con date diverse (es. periodi precedenti + periodo corrente), estrai SOLO il valore dell'ULTIMA riga con data (quella del periodo corrente di questo estratto conto). NON sommare i valori di periodi diversi. Ignora la riga "Già liquidati" e "Invariati fino al".
- **numeri_debitori**: Il valore totale dei numeri debitori (stessa regola: ultimo periodo)

#### 5.2 INTERESSI CREDITORI E DEBITORI (LORDI)
Cerca la sezione "ELEMENTI PER IL CONTEGGIO DELLE COMPETENZE" o "INTERESSI CREDITORI" / "INTERESSI DEBITORI".

**PROCEDURA STEP-BY-STEP PER ESTRARRE GLI INTERESSI:**

**STEP 1**: Individua la tabella "INTERESSI CREDITORI" nel PDF.
**STEP 2**: Conta quante righe hanno una DATA nella colonna "Decorrenza" (formato GG.MM.AAAA).
  - Le righe "Totale lordo", "Ritenuta fiscale", "Totale" NON hanno una data = NON contarle.
  - Solo le righe con una data come "30.06.2018" o "30.09.2018" contano.
**STEP 3**: Estrai TUTTE le righe con data come array interessi_creditori_periodi.
**STEP 4**: Per interessi_attivi_lordi:
  - Se hai trovato 1 SOLA riga con data → interessi_attivi_lordi = il valore "Totale lordo" dalla tabella
  - Se hai trovato 2 O PIU' righe con data → interessi_attivi_lordi = valore "Interessi" dell'ULTIMA riga (data piu' recente). ATTENZIONE: il "Totale lordo" in questo caso e' la somma di tutte le righe, NON il valore che cerchi!

**ESEMPIO CON 2 RIGHE (ATTENZIONE!):**
[ESEMPIO]
INTERESSI CREDITORI
Decorrenza    Tasso    Numeri creditori    Interessi
30.06.2018    0,0100   5.000.000,00        0,78     ← Riga 1 (ha data!)
30.09.2018    0,0100   10.979.877,26       2,21     ← Riga 2 (ha data!)
                       Totale lordo         2,99     ← SOMMA (NO data!) = 0,78+2,21
                       Ritenuta fiscale    -0,78
                       Totale               2,21
[/ESEMPIO]
Righe con data: 2 → interessi_attivi_lordi = 2.21 (valore dalla Riga 2, l'ultima con data)
interessi_creditori_periodi: [{"data":"30/06/2018","interessi":0.78},{"data":"30/09/2018","interessi":2.21}]
ERRORE COMUNE: estrarre 2.99 (il Totale lordo) come interessi_attivi_lordi. 2.99 e' SBAGLIATO perche' e' la somma.

**ESEMPIO CON 1 RIGA:**
[ESEMPIO]
INTERESSI CREDITORI
Decorrenza    Tasso    Numeri creditori    Interessi
31.12.2018    0,0100   3.282.024,02        1,61     ← Riga 1 (unica con data)
                       Totale lordo         1,61     ← SOMMA = 1,61 (coincide)
                       Ritenuta fiscale    -0,42
                       Totale               1,19
[/ESEMPIO]
Righe con data: 1 → interessi_attivi_lordi = 1.61 (Totale lordo)
interessi_creditori_periodi: [{"data":"31/12/2018","interessi":1.61}]

**VERIFICA OBBLIGATORIA**: Il numeri_creditori estratto dal Conto Scalare DEVE corrispondere al valore "Numeri creditori" dell'ULTIMA riga con data. Se non corrisponde, stai leggendo la riga sbagliata!

Estrai:
- **interessi_attivi_lordi**: Segui la procedura Step 1-4 sopra
- **interessi_passivi_lordi**: Il "Totale lordo" degli interessi debitori
- **interessi_creditori_periodi**: ARRAY con OGNI riga che ha una data nella colonna Decorrenza. Ogni elemento:
  - "data": la data decorrenza (GG/MM/AAAA)
  - "interessi": il valore dalla colonna Interessi di quella riga
  CRITICO: Se la tabella ha 2 righe con data, DEVI restituire 2 elementi. Se restituisci 1 solo elemento con il valore del "Totale lordo", stai sbagliando!

#### 5.3 TASSO ATTIVO E PASSIVO
Il tasso si trova nella colonna "TASSO" della tabella interessi creditori/debitori.
Cerca il valore percentuale (es. 0,0100 o 0,01%).

Estrai:
- **tasso_attivo**: Tasso applicato agli interessi creditori (es. "0.01%" o 0.0100)
- **tasso_passivo**: Tasso applicato agli interessi debitori

#### 5.4 MOVIMENTI TITOLI (Acquisti e Vendite)
Analizza la lista movimenti e identifica operazioni su titoli:

**ACQUISTI TITOLI (importi NEGATIVI - uscite di denaro):**
Keywords: "ACQ.", "ACQUISTO", "SOTTOSC", "SOTTOSCRIZIONE", "NOTA INF. ACQ.", "PAC FONDI"

**VENDITE TITOLI (importi POSITIVI - entrate di denaro):**
Keywords per vendite: "NOTA INF. VEND.", "RISCATTO QUOTE", "RISCATTO TOTALE", "RISCATTO PARZIALE", "DISINV", "DISINVESTIMENTO", "LIQUIDAZ FONDI", "SWITCH OUT"
Keyword RIMBORSO: conta come vendita SOLO se seguito da: "FONDI", "SICAV", "QUOTE", "ETF", "OBBLIG"
**ESCLUSIONI - NON contare come vendite:**
- "CEDOLA", "DIVIDENDO", "STACCO CED" = PROVENTI
- "RIMBORSO BUONO", "RIMBORSO SPESE", "RIMBORSO BOLLO" = NON sono vendite titoli
- "RISCATTO" generico senza riferimento a fondi = verificare contesto

Calcola e inserisci in scalar_data:
- **acquisto_titoli_count**: numero di operazioni di acquisto
- **vendita_titoli_count**: numero di operazioni di vendita
- **movimenti_titoli_count**: acquisto_titoli_count + vendita_titoli_count
- **acquisto_titoli_amount**: somma importi acquisti (sarà negativo)
- **vendita_titoli_amount**: somma importi vendite (sarà positivo)

**IMPORTANTE per interessi**: Estrai il valore "Totale lordo" (LORDO), NON il "Totale" finale netto.

Se un valore non è presente, usa 0.

### FASE 6: VALIDAZIONE FINALE (OBBLIGATORIA - ESEGUI SEMPRE)
Prima di restituire il JSON:
1. Calcola: expected_delta = Saldo Finale - Saldo Iniziale
2. Calcola: actual_sum = Somma di tutti i movimenti.amount
3. Se abs(expected_delta - actual_sum) > 0.01€:
   - HAI SBAGLIATO I SEGNI DI UNO O PIÙ MOVIMENTI
   - Calcola: errore = (expected_delta - actual_sum) / 2
   - Cerca il movimento con importo ≈ abs(errore) e INVERTI IL SUO SEGNO
   - Ripeti finché expected_delta ≈ actual_sum

**CASO COMUNE DI ERRORE**: I "RIMBORSO" o "ACCREDITO" o "VERSAMENTO" in colonna AVERE sono POSITIVI ma spesso vengono erroneamente marcati negativi. Se il calcolo non torna, verifica questi movimenti.

### FASE 7: COMPLETEZZA (OBBLIGATORIA)
- Se il PDF ha più pagine, DEVI leggere e estrarre i movimenti da TUTTE le pagine.
- Conta il numero totale di righe nella tabella movimenti nel PDF. Il tuo JSON DEVE avere lo STESSO numero di elementi nell'array "movements".
- NON fermarti prima di aver estratto TUTTI i movimenti. Anche se ci sono 50+ movimenti, estraili TUTTI.
- "BONIFICO A VOSTRO FAVORE" da fondi/SGR (es. Eurizon Capital) è un bonifico, NON una vendita titoli. Usa movement_type "Altro", NON "Vendita".

### FASE 8: ESTRAZIONE PORTAFOGLIO TITOLI (SOLO PER type="DOSSIER")
Se il documento è un DOSSIER TITOLI, estrai la CONSISTENZA del portafoglio.

**QUESTA FASE È CRITICA - DEVI ESTRARRE TUTTI I TITOLI SENZA ECCEZIONI.**

**8.1 CONTROVALORE TOTALE**
Cerca nel PDF il valore "CONTROVALORE TOTALE APPARENTE" o "CONTROVALORE TOTALE" o simile.
Esempio: "CONTROVALORE TOTALE APPARENTE AL 31/03/2019 Euro 527.413,10"
Estrai:
- Il valore numerico → summary.portfolio_total_extracted (es. 527413.10)
- La valuta → summary.portfolio_currency (es. "EUR" se dice "Euro", "USD" se dice "Dollar", ecc.)

**8.2 PROCEDURA STEP-BY-STEP PER ESTRARRE TUTTI I TITOLI**

**STEP 1 - IDENTIFICA TUTTE LE SEZIONI DEL PORTAFOGLIO:**
Il PDF può avere il portafoglio diviso in sezioni separate. DEVI cercare e leggere TUTTE queste sezioni:
- "AZIONI" / "TITOLI AZIONARI"
- "OBBLIGAZIONI" / "TITOLI OBBLIGAZIONARI" / "TITOLI DI STATO"
- "FONDI COMUNI" / "FONDI" / "O.I.C.R." / "OICR"
- "SICAV"
- "ETF" / "ETC" / "ETN"
- "CERTIFICATES" / "CERTIFICATI"
- "GESTIONI PATRIMONIALI" / "GPM" / "GPF"
- "POLIZZE" / "PRODOTTI ASSICURATIVI"
- Qualsiasi altra sezione con titoli nella tabella "CONSISTENZA"

**STEP 2 - LEGGI TUTTE LE PAGINE:**
La sezione portafoglio può estendersi su PIÙ PAGINE del PDF. NON fermarti alla prima pagina!
- Se una tabella continua nella pagina successiva, DEVI leggere anche quella
- Cerca "segue" / "continua" / intestazioni ripetute che indicano continuazione
- I titoli possono essere distribuiti su 2, 3 o più pagine

**STEP 3 - CONTA I TITOLI:**
Dopo aver estratto tutti i titoli, CONTA quanti ne hai trovati.
Ogni riga della tabella con un codice ISIN è UN titolo da estrarre.

**STEP 4 - VERIFICA LA SOMMA (OBBLIGATORIA):**
Calcola: somma_controvalore = somma di tutti i marketValue estratti
Confronta con portfolio_total_extracted (il totale dal PDF).
- Se somma_controvalore ≈ portfolio_total_extracted (differenza < 1%) → OK, hai estratto tutto
- Se somma_controvalore < portfolio_total_extracted → HAI PERSO DEI TITOLI! Torna allo Step 1 e cerca meglio
- NON procedere finché la somma non corrisponde al totale (con tolleranza < 1%)

**8.3 CAMPI DA ESTRARRE PER OGNI TITOLO**
Per OGNI titolo nella sezione "CONSISTENZA":
- **isin**: Codice ISIN del titolo (es. "FR0010245514", "IT0001047437")
- **name**: Nome/Descrizione del titolo ESATTAMENTE come appare nel PDF (es. "LYXOR JAPAN (TOPIX)D", "EURIZON BREVE TERM $", "CARMIGNAC PATRIMOINE")
- **currency**: Divisa/Valuta (es. "EUR", "USD") - dalla colonna "Divisa"
- **exchangeRate**: Tasso di cambio (es. 1.1235) - dalla colonna "Cambio". Se vuoto o EUR, usa 1
- **quantity**: Quantità/Consistenza (numero di quote/azioni)
- **price**: Quotazione/Prezzo unitario - dalla colonna "Quotazione"
- **marketValue**: Controvalore in Euro - dalla colonna "Controvalore Euro"
- **assetType**: Classificazione del titolo. Deduci dal nome, dalla sezione del PDF o dall'ISIN:
  - "Azione" → Titoli azionari individuali (es. "ENI SPA", "ENEL", "UNICREDIT")
  - "Obbligazione" → BTP, BOT, CCT, obbligazioni corporate, titoli di stato (es. "BTP 01MG2023", "MEDIOBANCA 2025")
  - "Fondo" → Fondi comuni di investimento, SICAV (es. "ANIMA FONDO TRADING", "EURIZON BREVE TERM", "CARMIGNAC PATRIMOINE", "PHARUS SICAV")
  - "ETF" → Exchange Traded Fund (es. "LYXOR JAPAN (TOPIX)", "ISHARES CORE", "AMUNDI MSCI", "VANGUARD")
  - "Altro" → Se non classificabile con certezza

**ATTENZIONE CRITICA - FORMATO NUMERI ITALIANI NELLE QUANTITÀ:**
I numeri nelle colonne "Consistenza" e "Quotazione" usano il formato italiano:
- Il PUNTO "." è SEMPRE il separatore delle MIGLIAIA (NON il decimale!)
- La VIRGOLA "," è SEMPRE il separatore DECIMALE
- Esempi di conversione CORRETTA:
  - "1.000,000" → quantity: 1000 (MILLE, non 1!)
  - "5.000,000" → quantity: 5000 (CINQUEMILA, non 5!)
  - "1.000" senza virgola → quantity: 1000 (MILLE, il punto è separatore migliaia!)
  - "2556,138" → quantity: 2556.138
  - "28,3550000" → price: 28.355
  - "28.355,00" → marketValue: 28355
- ERRORE COMUNE: leggere "1.000,000" come 1.0 o "5.000,000" come 5.0. Questo è SBAGLIATO!
- VERIFICA: se quantity × price ≠ marketValue (con tolleranza), probabilmente hai sbagliato la quantità.
  Esempio: se quantity=1, price=28.355 → 28.355 ≠ 28355 (marketValue) → ERRORE! Deve essere quantity=1000.

IMPORTANTE:
- Estrai il nome del titolo dalla colonna "Descrizione" del PDF
- Il nome può essere abbreviato nel PDF (es. "ANIMA FONDO TRADING" o "LYXOR COMMOD. THOM.R")
- NON inventare nomi - usa ESATTAMENTE quello che appare nel PDF
- Per titoli in default (es. "Titolo in default"), metti marketValue = 0
- I titoli in default NON contribuiscono al controvalore totale
- Se la quotazione non è disponibile ("Non dispon."), metti price = 0
- **ERRORE COMUNE**: saltare titoli che si trovano su pagine successive. LEGGI TUTTE LE PAGINE!
- **VERIFICA FINALE**: il numero di elementi in finalPortfolio DEVE corrispondere al numero di righe nella tabella del PDF

### FASE 9: ESTRAZIONE MOVIMENTI TITOLI (SOLO PER type="DOSSIER")
Se il documento è un DOSSIER TITOLI, estrai TUTTI i movimenti di acquisto/vendita titoli.

**9.1 IDENTIFICAZIONE OPERAZIONI**
Le banche usano terminologie diverse per indicare acquisti e vendite:

**ACQUISTO (Carico titoli)** - Keywords:
- "ACQUISTO", "ACQ.", "ACQ", "CARICO", "CARICO TITOLI"
- "SOTTOSCRIZIONE", "SOTTOSC.", "SOTTOSCR."
- "VERSAMENTO QUOTE", "CONFERIMENTO"
- "PAC" (Piano Accumulo Capitale)
- "NOTA INF. ACQ.", "SWITCH IN"
- "INVESTIMENTO", "INV."

**VENDITA (Scarico titoli)** - Keywords:
- "VENDITA", "VEND.", "SCARICO", "SCARICO TITOLI"
- "RISCATTO", "RISCATTO QUOTE", "RISCATTO TOTALE", "RISCATTO PARZIALE"
- "RIMBORSO", "RIMB.", "LIQUIDAZIONE", "LIQUIDAZ."
- "DISINVESTIMENTO", "DISINV."
- "NOTA INF. VEND.", "SWITCH OUT"
- "PRELIEVO QUOTE"

**9.2 STRUTTURA MOVIMENTI**
Per OGNI movimento titoli estrai:
- **isin**: Codice ISIN del titolo (se presente)
- **date**: Data operazione (formato "DD/MM/YYYY")
- **name**: Nome/Descrizione del titolo
- **operationType**: "Acquisto" o "Vendita" (normalizza sempre a questi due valori)
- **quantity**: Quantità/Numero quote (positivo)
- **price**: Prezzo/Quotazione unitario
- **exchangeRate**: Tasso di cambio (1 se EUR o non specificato)
- **currency**: Valuta/Divisa (EUR, USD, etc.)
- **grossAmount**: Importo lordo dell'operazione (controvalore = quantity × price × exchangeRate)
- **fees**: Spese/Commissioni dell'operazione (se presente nel PDF)
- **taxes**: Imposte, bolli, ritenute (se presente nel PDF)
- **netAmount**: Importo netto totale dell'operazione

**CALCOLO SPESE/IMPOSTE:**
- Se il PDF mostra una colonna "Spese", "Commissioni", "Imposte" o "Spese/Imposte" → estrai il valore direttamente
- Se NON presente → lascia fees=0 e taxes=0, verranno calcolati come |netAmount - grossAmount|

**9.3 NOTE IMPORTANTI**
- La sezione movimenti può essere chiamata: "MOVIMENTI", "OPERAZIONI", "LISTA OPERAZIONI", "DETTAGLIO MOVIMENTI"
- Alcune banche mostrano solo il totale, altre mostrano il dettaglio per ogni titolo
- Se non ci sono movimenti nel periodo, lascia l'array vuoto
- Il netAmount per acquisti è l'importo pagato (positivo), per vendite è l'importo ricevuto (positivo)
- fees e taxes potrebbero essere inclusi nel netAmount o mostrati separatamente
- CRITICO: Per type="DOSSIER", ogni acquisto/vendita titoli DEVE essere presente nell'array "securityMovements".
- L'array "movements" NON sostituisce "securityMovements": se "securityMovements" è vuoto ma esistono operazioni titoli, la risposta è sbagliata.

**ATTENZIONE CRITICA - FORMATO NUMERI ITALIANI NEI MOVIMENTI:**
Come per il portafoglio, anche i movimenti titoli usano il formato italiano:
- Il PUNTO "." è SEMPRE il separatore delle MIGLIAIA (NON il decimale!)
- La VIRGOLA "," è SEMPRE il separatore DECIMALE
- Esempi di conversione CORRETTA:
  - "6.000" → quantity: 6000 (SEIMILA, non 6!)
  - "1.000" → quantity: 1000 (MILLE, non 1!)
  - "84.000" → quantity: 84000 (OTTANTAQUATTROMILA, non 84!)
  - "5.000.000" → quantity: 5000000 (CINQUE MILIONI, non 5!)
  - "2556,138" → quantity: 2556.138
- ERRORE COMUNE: leggere "6.000" come 6.0 o "84.000" come 84.0. Questo è SBAGLIATO! Il punto è separatore migliaia.
- VERIFICA: se la quantità del movimento è molto piccola rispetto al controvalore (es. qty=6, amount=14.707) probabilmente hai sbagliato. qty=6000 è corretto.

### STRUTTURA JSON RICHIESTA:
{
  "type": "DOSSIER" | "LIQUIDITY",
  "layout_detected": "two_columns_dare_avere" | "single_column_with_sign" | "single_column_no_sign" | "other",
  "info": {
    "bankName": "Nome Banca",
    "accountNumber": "Numero Conto o Dossier Titoli (es. 445/0000004742990)",
    "period_start": "YYYY-MM-DD",
    "period_end": "YYYY-MM-DD",
    "holder": "Intestatario",
    "settlementAccount": "Per DOSSIER: cerca 'Conto di Regolamento', 'Conto Regolamento', 'Conto di appoggio', 'Conto corrente tecnico', 'Cash account', 'C/C Regolamento', 'Conto Corrente', 'N. Conto Corrente', 'C/EURO' (es. C/EURO 00445/00035652638). Per LIQUIDITY: IBAN"
  },
  "scalar_data": {
    "numeri_creditori": 0,
    "numeri_debitori": 0,
    "interessi_attivi_lordi": 0,
    "interessi_passivi_lordi": 0,
    "interessi_creditori_periodi": [{"data": "GG/MM/AAAA", "interessi": 0}],
    "tasso_attivo": "0%",
    "tasso_passivo": "0%",
    "acquisto_titoli_count": 0,
    "vendita_titoli_count": 0,
    "movimenti_titoli_count": 0,
    "acquisto_titoli_amount": 0,
    "vendita_titoli_amount": 0
  },
  "movements": [
    {
      "date": "GG/MM/AAAA",
      "description": "Descrizione completa concatenata",
      "amount": 0,
      "sign_source": "column_position" | "explicit_sign" | "keyword" | "math_verification",
      "movement_type": "Commissioni" | "Acquisto" | "Vendita" | "Proventi" | "Altro"
    }
  ],
  "summary": {
    "initial_balance": { "value": 0, "source": "extracted" },
    "final_balance": { "value": 0, "source": "extracted" },
    "total_movements_amount": { "value": 0, "source": "calculated" },
    "total_commissions": { "value": 0, "source": "calculated" },
    "total_proventi": { "value": 0, "source": "calculated" },
    "math_verification": { "expected_delta": 0, "actual_sum": 0, "matches": true },
    "portfolio_total_extracted": 0,
    "portfolio_currency": "EUR"
  },
  "finalPortfolio": [
    {
      "isin": "CODICE_ISIN",
      "name": "Nome del titolo dal PDF",
      "assetType": "Fondo",
      "currency": "EUR",
      "exchangeRate": 1,
      "quantity": 0,
      "price": 0,
      "marketValue": 0
    }
  ],
  "securityMovements": [
    {
      "isin": "CODICE_ISIN",
      "date": "DD/MM/YYYY",
      "name": "Nome del titolo",
      "operationType": "Acquisto" | "Vendita",
      "quantity": 0,
      "price": 0,
      "exchangeRate": 1,
      "currency": "EUR",
      "grossAmount": 0,
      "fees": 0,
      "taxes": 0,
      "netAmount": 0
    }
  ],
  "dividends": []
}

Restituisci SOLO il JSON, nessun altro testo.`;

        const modelName = process.env.GEMINI_MODEL || 'gemini-3-pro-preview'

        // Try to create/reuse context cache for system prompt (saves 75-90% on cached tokens)
        const cachedContent = await getOrCreateCache(GEMINI_API_KEY!, modelName, systemPrompt)
        if (cachedContent) {
            logProgress('CONTEXT CACHE', `System prompt cached: ${cachedContent}`)
        } else {
            logProgress('CONTEXT CACHE', 'Fallback a system_instruction inline')
        }

        // First pass: low thinking for speed. If validation fails, retry with high thinking.
        const maxRetries = 3
        let resText = ''
        let parseSuccess = false
        let lastParseError = ''
        let currentThinkingLevel = 'low'

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                logProgress('CHIAMATA GEMINI AI', `Tentativo ${attempt}/${maxRetries} con ${modelName} (thinking: ${currentThinkingLevel})`)
                resText = await callGemini(GEMINI_API_KEY!, modelName, systemPrompt, base64Data, {
                    thinkingLevel: currentThinkingLevel,
                    jsonSchema: PARSE_PDF_JSON_SCHEMA,
                    cachedContent: cachedContent || undefined
                })
                logProgress('RISPOSTA RICEVUTA', `${resText.length} caratteri da Gemini`)

                if (resText && resText.length > 10) {
                    parseSuccess = true
                    break
                }
            } catch (err: any) {
                const errMsg = err.message || ''
                lastParseError = errMsg
                console.error(`[GEMINI ERROR] Attempt ${attempt}/${maxRetries}: ${errMsg}`)

                if (errMsg.includes('not found') || errMsg.includes('404')) {
                    break // Model not found, no point retrying
                }

                const isRateLimit = errMsg.includes('429') || errMsg.includes('rate limit') ||
                    errMsg.includes('quota') || errMsg.includes('Resource has been exhausted') ||
                    errMsg.includes('RATE_LIMIT')
                const isNetworkError = errMsg.includes('ECONNRESET') || errMsg.includes('ETIMEDOUT') ||
                    errMsg.includes('socket hang up') || errMsg.includes('timeout')
                const isServerError = errMsg.includes('500') || errMsg.includes('502') ||
                    errMsg.includes('503') || errMsg.includes('Internal Server Error')

                if (isRateLimit) {
                    const waitTime = Math.pow(2, attempt) * 30000 // 60s, 120s, 240s
                    logProgress('RATE LIMIT', `Attendo ${waitTime / 1000}s prima del prossimo tentativo`)
                    await new Promise(resolve => setTimeout(resolve, waitTime))
                } else if (isServerError) {
                    const waitTime = attempt * 10000 // 10s, 20s, 30s
                    logProgress('SERVER ERROR', `${errMsg.substring(0, 80)}, riprovo tra ${waitTime / 1000}s`)
                    await new Promise(resolve => setTimeout(resolve, waitTime))
                } else if (isNetworkError) {
                    const waitTime = attempt * 15000
                    logProgress('ERRORE RETE', `Riprovo tra ${waitTime / 1000}s`)
                    await new Promise(resolve => setTimeout(resolve, waitTime))
                } else {
                    if (attempt < maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, 5000))
                    } else {
                        break
                    }
                }
            }
        }

        if (!parseSuccess) {
            return NextResponse.json({ success: false, error: 'Gemini AI parsing fallito: ' + lastParseError }, { status: 500 })
        }

        // Parse JSON from response (Gemini JSON mode should return valid JSON directly)
        logProgress('PARSING JSON', 'Estrazione dati dalla risposta Gemini')
        let parsed = null
        let jsonError = ''

        try {
            // With responseMimeType: 'application/json', Gemini should return pure JSON
            try {
                parsed = JSON.parse(resText)
                logProgress('JSON PARSED', 'Parsing completato (JSON mode)')
            } catch {
                // Fallback: extract JSON from response text (in case of markdown wrapping)
                const jsonMatch = resText.match(/\{[\s\S]*\}/)
                if (!jsonMatch) {
                    throw new Error('Risposta AI non valida - nessun JSON trovato')
                }
                try {
                    parsed = JSON.parse(jsonMatch[0])
                    logProgress('JSON PARSED', 'Parsing completato (regex fallback)')
                } catch {
                    logProgress('RIPARAZIONE JSON', 'Tentativo di riparazione JSON troncato')
                    const repaired = repairTruncatedJson(jsonMatch[0])
                    if (repaired) {
                        parsed = JSON.parse(repaired)
                        logProgress('JSON RIPARATO', 'Riparazione completata con successo')
                    } else {
                        throw new Error('JSON non riparabile')
                    }
                }
            }
        } catch (parseErr: any) {
            jsonError = parseErr.message
            console.error(`JSON parse fallito: ${jsonError}`)
        }

        if (!parsed) {
            return NextResponse.json({ success: false, error: 'Parsing JSON fallito: ' + jsonError }, { status: 500 })
        }

        // === VALIDATION-RETRY: Check math, retry with high thinking if needed ===
        const validationMovements = parsed.movements || []
        const validationInitial = parsed.summary?.initial_balance?.value || 0
        const validationFinal = parsed.summary?.final_balance?.value || 0
        const validationSum = validationMovements.reduce((sum: number, m: any) => sum + (m.amount || 0), 0)
        const validationExpected = validationFinal - validationInitial
        const validationError = Math.abs(validationExpected - validationSum)

        const needsValidationRetry = parsed.type === 'DOSSIER'
            ? // DOSSIER: retry solo se nessun holding estratto
              (!parsed.finalPortfolio || parsed.finalPortfolio.length === 0)
            : // LIQUIDITY: retry se la matematica dei saldi non torna
              (validationInitial !== 0 && validationFinal !== 0 && validationError > 5) ||
              (validationInitial === 0 && validationFinal === 0 && validationMovements.length > 0)

        if (needsValidationRetry && currentThinkingLevel === 'low') {
            logProgress('VALIDATION RETRY',
                `Errore matematico: ${validationError.toFixed(2)}€ (atteso: ${validationExpected.toFixed(2)}, ottenuto: ${validationSum.toFixed(2)}). ` +
                `Retry con thinking: high`
            )

            try {
                const retryPrompt = systemPrompt + (validationError > 5 ?
                    `\n\nATTENZIONE: L'estrazione precedente aveva un errore matematico di ${validationError.toFixed(2)}€. ` +
                    `La somma dei movimenti (${validationSum.toFixed(2)}) non corrisponde a Saldo Finale (${validationFinal.toFixed(2)}) - Saldo Iniziale (${validationInitial.toFixed(2)}) = ${validationExpected.toFixed(2)}. ` +
                    `Verifica attentamente i segni di ogni movimento e assicurati di estrarre TUTTI i movimenti.` : '')

                const retryText = await callGemini(GEMINI_API_KEY!, modelName, retryPrompt, base64Data, {
                    thinkingLevel: 'medium',
                    jsonSchema: PARSE_PDF_JSON_SCHEMA
                })

                if (retryText && retryText.length > 10) {
                    let retryParsed: any = null
                    try {
                        retryParsed = JSON.parse(retryText)
                    } catch {
                        const retryJsonMatch = retryText.match(/\{[\s\S]*\}/)
                        if (retryJsonMatch) {
                            try { retryParsed = JSON.parse(retryJsonMatch[0]) } catch {
                                const repaired = repairTruncatedJson(retryJsonMatch[0])
                                if (repaired) retryParsed = JSON.parse(repaired)
                            }
                        }
                    }

                    if (retryParsed?.movements?.length) {
                        const retryMov = retryParsed.movements
                        const retryInitial = retryParsed.summary?.initial_balance?.value || 0
                        const retryFinal = retryParsed.summary?.final_balance?.value || 0
                        const retrySum = retryMov.reduce((sum: number, m: any) => sum + (m.amount || 0), 0)
                        const retryExpected = retryFinal - retryInitial
                        const retryError = Math.abs(retryExpected - retrySum)

                        const retryIsBetter = (
                            // Retry has lower math error
                            (retryError < validationError) ||
                            // Retry has more movements with reasonable math
                            (retryMov.length > validationMovements.length && retryError < validationError * 2) ||
                            // Original had zero balances, retry has real ones
                            (validationInitial === 0 && validationFinal === 0 && (retryInitial !== 0 || retryFinal !== 0))
                        )

                        if (retryIsBetter) {
                            logProgress('VALIDATION RETRY ACCEPTED',
                                `Errore ridotto: ${validationError.toFixed(2)}€ → ${retryError.toFixed(2)}€, ` +
                                `Movimenti: ${validationMovements.length} → ${retryMov.length}`
                            )
                            parsed = retryParsed
                        } else {
                            logProgress('VALIDATION RETRY KEPT ORIGINAL',
                                `Retry non migliora (errore: ${retryError.toFixed(2)}€ vs ${validationError.toFixed(2)}€)`
                            )
                        }
                    }
                }
            } catch (retryErr: any) {
                logProgress('VALIDATION RETRY ERROR', `${retryErr.message}. Proseguo con originale.`)
            }
        } else if (!needsValidationRetry) {
            logProgress('VALIDATION OK',
                `Errore matematico: ${validationError.toFixed(2)}€ (${validationMovements.length} movimenti)`
            )
        }

        // === CROSS-FIELD VALIDATION: Programmatic checks ===
        const cfv = crossFieldValidation(parsed)
        const totalCfvIssues = cfv.issues.length + cfv.holdingIssues.length + cfv.movementIssues.length

        if (totalCfvIssues > 0) {
            logProgress('CROSS-FIELD VALIDATION',
                `${totalCfvIssues} problemi trovati: ${cfv.issues.length} generali, ${cfv.holdingIssues.length} holdings, ${cfv.movementIssues.length} movimenti`
            )
            cfv.issues.forEach(i => console.log(`  [CFV] ${i}`))
            cfv.holdingIssues.forEach(h => console.log(`  [CFV] ${h.isin}: ${h.issue}`))
            if (cfv.movementIssues.length <= 5) {
                cfv.movementIssues.forEach(m => console.log(`  [CFV] Mov#${m.index}: ${m.issue}`))
            } else {
                console.log(`  [CFV] ${cfv.movementIssues.length} movimenti con date fuori periodo (troppi per elencare)`)
            }

            // === SELF-VERIFICATION PASS: Send JSON + PDF back to Gemini to fix issues ===
            // Only trigger if significant issues found (holdings math or balance math)
            const significantIssues = cfv.issues.filter(i =>
                i.includes('Errore matematico') || i.includes('Somma holdings')
            ).length + cfv.holdingIssues.filter(h => h.issue.includes('≠ marketValue')).length

            if (significantIssues > 0) {
                logProgress('SELF-VERIFICATION',
                    `${significantIssues} problemi significativi, invio JSON + PDF a Gemini per verifica`
                )

                const issuesSummary = [
                    ...cfv.issues,
                    ...cfv.holdingIssues.map(h => `${h.isin} (${h.name}): ${h.issue}`)
                ].join('\n- ')

                const verifyPrompt = `Sei un revisore di dati finanziari. Ti viene fornito un JSON estratto da un PDF bancario e la lista degli errori trovati dalla validazione automatica.

ERRORI TROVATI:
- ${issuesSummary}

Il JSON estratto è:
${JSON.stringify(parsed, null, 0).substring(0, 50000)}

ISTRUZIONI:
1. Riesamina il PDF originale confrontandolo con il JSON
2. Per ogni errore segnalato, verifica nel PDF il valore corretto
3. Correggi SOLO i campi con errori verificati — NON modificare campi corretti
4. Per holdings con qty×price≠marketValue: verifica la quantità nel PDF (ricorda: "1.000" = mille in italiano)
5. Per errori matematici nei saldi: verifica i segni dei movimenti

Restituisci il JSON COMPLETO corretto con le stesse identiche chiavi.`

                try {
                    const verifyText = await callGemini(GEMINI_API_KEY!, modelName, verifyPrompt, base64Data, {
                        thinkingLevel: 'medium',
                        jsonSchema: PARSE_PDF_JSON_SCHEMA
                    })

                    if (verifyText && verifyText.length > 10) {
                        let verifiedParsed: any = null
                        try {
                            verifiedParsed = JSON.parse(verifyText)
                        } catch {
                            const vjm = verifyText.match(/\{[\s\S]*\}/)
                            if (vjm) {
                                try { verifiedParsed = JSON.parse(vjm[0]) } catch {
                                    const repaired = repairTruncatedJson(vjm[0])
                                    if (repaired) verifiedParsed = JSON.parse(repaired)
                                }
                            }
                        }

                        if (verifiedParsed?.movements?.length) {
                            // Re-validate the verified version
                            const cfv2 = crossFieldValidation(verifiedParsed)
                            const totalCfv2 = cfv2.issues.length + cfv2.holdingIssues.length + cfv2.movementIssues.length

                            if (totalCfv2 < totalCfvIssues) {
                                logProgress('SELF-VERIFICATION ACCEPTED',
                                    `Problemi ridotti: ${totalCfvIssues} → ${totalCfv2}`
                                )
                                parsed = verifiedParsed
                            } else {
                                logProgress('SELF-VERIFICATION KEPT ORIGINAL',
                                    `Verifica non migliora (${totalCfv2} vs ${totalCfvIssues} problemi)`
                                )
                            }
                        }
                    }
                } catch (verifyErr: any) {
                    logProgress('SELF-VERIFICATION ERROR', `${verifyErr.message}. Proseguo con originale.`)
                }
            }
        } else {
            logProgress('CROSS-FIELD VALIDATION', 'Nessun problema trovato')
        }

        // Calcolo fallback summary se mancante o troncato
        if (!parsed.summary) {
            parsed.summary = {}
        }

        const movements = parsed.movements || []
        const calculatedTotal = movements.reduce((sum: number, m: any) => sum + (m.amount || 0), 0)

        // Post-process: riclassifica movimenti erroneamente classificati
        movements.forEach((m: any) => {
            const desc = m.description?.toLowerCase() || ''

            // Bonifici erroneamente classificati come Commissioni -> Altro
            if (m.movement_type === 'Commissioni' &&
                desc.includes('bonifico') &&
                desc.includes('disposto')) {
                m.movement_type = 'Altro'
            }

            // PENSIONE INPS, STIPENDIO, ecc. NON sono commissioni -> Altro
            if (m.movement_type === 'Commissioni' && (
                desc.includes('pensione') ||
                desc.includes('inps') ||
                desc.includes('stipendio') ||
                desc.includes('emolument') ||
                desc.includes('retribuzione') ||
                desc.includes('affitto') ||
                desc.includes('canone locazione') ||
                desc.includes('premio polizza') ||
                desc.includes('assicurazione') ||
                desc.includes('bolletta') ||
                desc.includes('utenz') ||
                desc.includes('prelievo')
            )) {
                m.movement_type = 'Altro'
            }

            // Vecchia categoria "Bonifico" -> Altro
            if (m.movement_type === 'Bonifico') {
                m.movement_type = 'Altro'
            }
            // Vecchia categoria "Spesa" -> Commissioni (bolli e imposte ora vanno sotto Commissioni)
            if (m.movement_type === 'Spesa') {
                m.movement_type = 'Commissioni'
            }
        })

        // Correzione segni conservativa: solo single-flip, tolerance 5%, solo se entrambi i saldi presenti
        const initialBalance = parsed.summary?.initial_balance?.value || 0
        const finalBalance = parsed.summary?.final_balance?.value || 0
        const expectedDelta = finalBalance - initialBalance
        let currentSum = movements.reduce((sum: number, m: any) => sum + (m.amount || 0), 0)

        if (initialBalance !== 0 && finalBalance !== 0 && Math.abs(currentSum - expectedDelta) > 0.01) {
            const error = currentSum - expectedDelta
            const targetFlipAmount = Math.abs(error / 2)

            let bestMatch = -1
            let bestDiff = Infinity
            for (let i = 0; i < movements.length; i++) {
                const absAmount = Math.abs(movements[i].amount || 0)
                const diff = Math.abs(absAmount - targetFlipAmount)
                if (diff < bestDiff) {
                    bestDiff = diff
                    bestMatch = i
                }
            }

            // Ultra-conservativo: solo se entro 5% del target, con floor 0.50€
            const tolerance = Math.max(targetFlipAmount * 0.05, 0.50)
            if (bestMatch >= 0 && bestDiff < tolerance) {
                const before = movements[bestMatch].amount
                movements[bestMatch].amount = -movements[bestMatch].amount
                movements[bestMatch].sign_source = 'auto_corrected'
                currentSum = movements.reduce((sum: number, m: any) => sum + (m.amount || 0), 0)
                console.log(`[PARSE-PDF] Auto-corrected sign: ${before} -> ${movements[bestMatch].amount} (error: ${Math.abs(currentSum - expectedDelta).toFixed(2)}€)`)
            }
        }

        // Commissioni = abs(somma netta dei movimenti classificati "Commissioni")
        // Include già bolli, imposte, Tobin Tax (ora classificati direttamente come Commissioni)
        const periodEndStr = parsed.info?.period_end || ''
        const periodYear = periodEndStr ? parseInt(periodEndStr.split(/[-/]/).find((p: string) => p.length === 4) || '0') : 0
        const periodMonthStr = periodEndStr.match(/[-/](\d{2})[-/]/)?.[1] || periodEndStr.split(/[-/]/)[1] || ''
        const periodMonth = parseInt(periodMonthStr) || 0

        // Post-process: "Spese emis. E/C.-Rendiconto-Comunicazioni" con sotto-voce "comunicazioni"
        // Dal 2024+: l'Excel conta solo la parte E/C (0.70), non le comunicazioni.
        if (periodYear >= 2024) {
            movements.forEach((m: any) => {
                if (m.movement_type === 'Commissioni' &&
                    m.description?.toLowerCase().includes('spese emis') &&
                    m.description?.toLowerCase().includes('comunicazioni') &&
                    Math.abs(m.amount || 0) >= 0.80) {
                    m.amount = m.amount > 0 ? 0.70 : -0.70
                }
            })
        }

        // Split: somma solo i negativi (costi reali), ignora positivi (competenze/rimborsi)
        const negativeCommissions = movements
            .filter((m: any) => m.movement_type === 'Commissioni' && (m.amount || 0) < 0)
            .reduce((sum: number, m: any) => sum + (m.amount || 0), 0)
        let calculatedCommissions = Math.abs(negativeCommissions)

        // Dal 2017+ (escluso Q1/marzo): l'Excel usa il totale LORDO delle commissioni (non sottrae competenze)
        if (periodYear >= 2017 && periodMonth !== 3) {
            const competenzeAmount = movements
                .filter((m: any) => m.movement_type === 'Commissioni' &&
                    (m.amount || 0) > 0 &&
                    m.description?.toLowerCase().includes('competenz'))
                .reduce((sum: number, m: any) => sum + (m.amount || 0), 0)
            if (competenzeAmount > 0) {
                calculatedCommissions += competenzeAmount
            }
        }

        const calculatedProventi = movements
            .filter((m: any) => m.movement_type === 'Proventi' || m.movement_type === 'Dividendo')
            .reduce((sum: number, m: any) => sum + (m.amount || 0), 0)

        // Imposta valori calcolati se mancanti
        if (!parsed.summary.total_movements_amount) {
            parsed.summary.total_movements_amount = { value: calculatedTotal, source: 'calculated' }
        }
        // ALWAYS override with calculated commissions (hybrid formula is more reliable than Gemini's value)
        parsed.summary.total_commissions = { value: calculatedCommissions, source: 'calculated' }
        if (!parsed.summary.total_proventi) {
            parsed.summary.total_proventi = { value: calculatedProventi, source: 'calculated' }
        }
        if (!parsed.summary.initial_balance) {
            parsed.summary.initial_balance = { value: 0, source: 'missing' }
        }
        if (!parsed.summary.final_balance) {
            const initial = parsed.summary.initial_balance?.value || 0
            parsed.summary.final_balance = { value: initial + calculatedTotal, source: 'calculated' }
        }

        if (parsed.type === 'UNOFFICIAL') {
            console.warn(`[SERVER] Documento rifiutato (UNOFFICIAL): ${fileName}`)
            return NextResponse.json({
                success: false,
                error: 'Questo documento non è un estratto conto ufficiale. Per un\'analisi accurata, carica solo gli estratti conto trimestrali o annuali originali della banca.'
            }, { status: 400 })
        }

        const isDossier = parsed.type === 'DOSSIER'

        // Normalize security movements immediately; some models output malformed types/numbers.
        parsed.securityMovements = normalizeSecurityMovementsArray(parsed.securityMovements || [])

        // Recovery path: in some cases buy/sell title operations are emitted in "movements"
        // while "securityMovements" is left empty. Recover them with a focused extraction.
        if (isDossier && parsed.securityMovements.length === 0) {
            const titleMovementCandidates = extractTitleMovementCandidates(parsed.movements || [])
            if (titleMovementCandidates.length > 0) {
                logProgress(
                    'PHASE 9 RECOVERY',
                    `securityMovements vuoto, recupero mirato da PDF (${titleMovementCandidates.length} candidati in movements)`
                )

                try {
                    const recoveredSecurityMovements = await recoverSecurityMovementsFromPdf(
                        GEMINI_API_KEY!,
                        modelName,
                        base64Data
                    )

                    if (recoveredSecurityMovements.length > 0) {
                        parsed.securityMovements = recoveredSecurityMovements
                        logProgress('PHASE 9 RECOVERED', `${recoveredSecurityMovements.length} movimenti titoli recuperati`)
                    } else {
                        logProgress('PHASE 9 RECOVERY EMPTY', 'Nessun movimento titoli recuperato')
                    }
                } catch (recoveryErr: any) {
                    logProgress('PHASE 9 RECOVERY ERROR', recoveryErr.message || 'Errore sconosciuto')
                }
            }
        }

        logProgress('✅ ANALISI COMPLETATA', fileName)
        console.log(`📋 Tipo: ${parsed.type} | 🏦 Banca: ${parsed.info?.bankName} | 💳 Conto: ${parsed.info?.accountNumber}`)

        // === PERIOD DATE VALIDATION ===
        // Validate that period_start/period_end form a standard banking period
        if (parsed.info?.period_start && parsed.info?.period_end) {
            const pStart = new Date(parsed.info.period_start)
            const pEnd = new Date(parsed.info.period_end)
            const diffDays = Math.round((pEnd.getTime() - pStart.getTime()) / (1000 * 60 * 60 * 24))

            // Standard periods with tolerance: monthly(28-35), bimonthly(56-66), quarterly(85-100), semiannual(175-190), annual(360-370)
            const isStandard = (
                (diffDays >= 28 && diffDays <= 35) ||   // monthly
                (diffDays >= 56 && diffDays <= 66) ||   // bimonthly
                (diffDays >= 85 && diffDays <= 100) ||  // quarterly
                (diffDays >= 175 && diffDays <= 190) || // semiannual
                (diffDays >= 360 && diffDays <= 370)    // annual
            )

            if (!isStandard && diffDays > 0) {
                logProgress('⚠️ PERIODO NON STANDARD',
                    `${diffDays} giorni (${parsed.info.period_start} → ${parsed.info.period_end}). Normalizzo period_start.`
                )

                // Use period_end as anchor (more reliable), compute closest standard period_start
                // Find closest standard duration
                const standards = [30, 61, 91, 182, 365]
                const closest = standards.reduce((best, d) =>
                    Math.abs(d - diffDays) < Math.abs(best - diffDays) ? d : best
                )

                // Compute new period_start by subtracting the closest standard months from period_end
                const monthsMap: Record<number, number> = { 30: 1, 61: 2, 91: 3, 182: 6, 365: 12 }
                const monthsToSubtract = monthsMap[closest] || 1
                const newStart = new Date(pEnd)
                newStart.setMonth(newStart.getMonth() - monthsToSubtract)
                // Adjust to end-of-month (banking periods end on last day of month)
                // E.g., if period_end = 30/11/2024 and monthly, newStart should be 31/10/2024
                const lastDayOfNewStartMonth = new Date(newStart.getFullYear(), newStart.getMonth() + 1, 0)
                const correctedStart = lastDayOfNewStartMonth.toISOString().split('T')[0]

                logProgress('📅 PERIODO CORRETTO',
                    `${parsed.info.period_start} → ${correctedStart} (${closest} giorni standard, ${monthsToSubtract} mesi)`
                )
                parsed.info.period_start = correctedStart
            }
        }

        // === PHASE A: Self-contained Portfolio Total Validation ===
        if (isDossier) {
            try {
                const phaseAResult = validatePortfolioTotals(parsed)

                logProgress('PHASE A',
                    `Somma titoli: ${phaseAResult.sumOfMarketValues.toFixed(2)}€ | ` +
                    `Totale PDF: ${phaseAResult.extractedTotal.toFixed(2)}€ | ` +
                    `Gap: ${phaseAResult.gap.toFixed(2)}€ (${phaseAResult.gapPercent.toFixed(1)}%)`
                )

                if (phaseAResult.needsRetry) {
                    const holdingsCount = (parsed.finalPortfolio || []).length
                    logProgress('PHASE A RETRY',
                        `Gap significativo (${phaseAResult.gap.toFixed(0)}€, ${phaseAResult.gapPercent.toFixed(1)}%). Retry con prompt rinforzato.`
                    )

                    const phaseAPrompt = systemPrompt + `\n\n### ATTENZIONE - PORTAFOGLIO INCOMPLETO
L'estrazione iniziale ha trovato ${holdingsCount} titoli con controvalore totale ${phaseAResult.sumOfMarketValues.toFixed(2)}€, ma il PDF riporta un controvalore totale di ${phaseAResult.extractedTotal.toFixed(2)}€. Mancano circa ${phaseAResult.gap.toFixed(0)}€ di titoli.
DEVI ri-esaminare attentamente la sezione "CONSISTENZA" o "PORTAFOGLIO" del PDF e estrarre TUTTI i titoli, inclusi quelli su pagine successive.
Verifica che la somma dei controvalore individuali sia uguale al controvalore totale del PDF.
NON inventare titoli. Estrai SOLO quelli effettivamente presenti nel PDF.`

                    try {
                        const retryText = await callGemini(GEMINI_API_KEY!, modelName, phaseAPrompt, base64Data, {
                            thinkingLevel: 'medium',
                            jsonSchema: PARSE_PDF_JSON_SCHEMA
                        })
                        const retryJsonMatch = retryText.match(/\{[\s\S]*\}/)

                        if (retryJsonMatch) {
                            let retryParsed: any
                            try {
                                retryParsed = JSON.parse(retryJsonMatch[0])
                            } catch {
                                const repaired = repairTruncatedJson(retryJsonMatch[0])
                                if (repaired) retryParsed = JSON.parse(repaired)
                            }

                            if (retryParsed?.finalPortfolio?.length) {
                                const retryValidation = validatePortfolioTotals(retryParsed)

                                logProgress('PHASE A RESULT',
                                    `Retry: ${retryParsed.finalPortfolio.length} titoli, gap ${retryValidation.gap.toFixed(0)}€ | ` +
                                    `Originale: ${holdingsCount} titoli, gap ${phaseAResult.gap.toFixed(0)}€`
                                )

                                const retryBetter = (
                                    retryParsed.finalPortfolio.length > holdingsCount &&
                                    retryValidation.gap < phaseAResult.gap
                                ) || (
                                    retryParsed.finalPortfolio.length >= holdingsCount &&
                                    retryValidation.gap < phaseAResult.gap * 0.5
                                )

                                if (retryBetter) {
                                    logProgress('PHASE A ACCEPTED', 'Retry accettato (migliore copertura)')
                                    parsed.finalPortfolio = retryParsed.finalPortfolio
                                    parsed.securityMovements = retryParsed.securityMovements || parsed.securityMovements
                                    if (retryParsed.summary?.portfolio_total_extracted) {
                                        parsed.summary.portfolio_total_extracted = retryParsed.summary.portfolio_total_extracted
                                    }
                                } else {
                                    logProgress('PHASE A KEPT ORIGINAL', 'Retry non migliora, mantengo originale')
                                }
                            }
                        }
                    } catch (phaseAErr: any) {
                        logProgress('PHASE A ERROR', `Retry fallito: ${phaseAErr.message}. Proseguo con originale.`)
                    }
                } else {
                    logProgress('PHASE A OK', 'Totali portafoglio corrispondono')
                }
            } catch (phaseAOuterErr: any) {
                logProgress('PHASE A SKIP', `Errore: ${phaseAOuterErr.message}`)
            }
        }

        // Check for duplicate period BEFORE saving (unless force flag is set)
        const supabase = await createClient()
        const periodStart = parseDate(parsed.info?.period_start)
        const periodEnd = parseDate(parsed.info?.period_end)
        const accountNumber = parsed.info?.accountNumber

        // Auto-replace duplicate period (soft-delete old, save new) — avoids double Gemini call
        let replacedAnalysisId: string | null = null
        if (!isReanalysis && userId && periodStart && periodEnd && accountNumber) {
            logProgress('CHECK DUPLICATI', 'Verifico periodo già caricato')
            const { data: existingAnalyses } = await supabase
                .from('analyses')
                .select('id, period_start, period_end, benchmark_comparison')
                .eq('user_id', userId)
                .eq('period_start', periodStart)
                .eq('period_end', periodEnd)
                .is('deleted_at', null)

            const normalizedNew = normalizeAccountNumber(accountNumber)
            const existingAnalysis = existingAnalyses?.find(a =>
                normalizeAccountNumber(a.benchmark_comparison || '') === normalizedNew
            )

            if (existingAnalysis) {
                logProgress('⚠️ DUPLICATO → SOSTITUZIONE', `Soft-delete ${existingAnalysis.id}, salvo nuova analisi`)
                replacedAnalysisId = existingAnalysis.id
                await supabase
                    .from('analyses')
                    .update({ deleted_at: new Date().toISOString() })
                    .eq('id', existingAnalysis.id)
            }
        }

        // === PHASE B: Cross-period Portfolio Validation ===
        if (isDossier && userId && periodStart && periodEnd) {
            try {
                logProgress('PHASE B', 'Verifica cross-period con periodo precedente')

                const normalizedAcc = normalizeAccountNumber(accountNumber || '')

                const { data: prevAnalyses } = await supabase
                    .from('analyses')
                    .select('id, period_start, period_end, holdings, costs_breakdown, benchmark_comparison')
                    .eq('user_id', userId)
                    .eq('account_type', 'DOSSIER')
                    .lt('period_end', periodStart)
                    .is('deleted_at', null)
                    .order('period_end', { ascending: false })
                    .limit(5)

                const prevDoc = prevAnalyses?.find(a =>
                    normalizeAccountNumber(a.benchmark_comparison || '') === normalizedAcc
                )

                if (!prevDoc || !prevDoc.holdings?.length) {
                    logProgress('PHASE B SKIP', 'Nessun periodo precedente trovato per questo conto')
                } else {
                    logProgress('PHASE B FOUND',
                        `Periodo precedente: ${prevDoc.period_start} - ${prevDoc.period_end} (${prevDoc.holdings.length} titoli)`
                    )

                    const suspicious = findSuspiciousMissingIsins(
                        parsed.finalPortfolio || [],
                        parsed.securityMovements || [],
                        prevDoc.holdings
                    )

                    if (suspicious.length === 0) {
                        logProgress('PHASE B OK', 'Tutti i titoli del periodo precedente sono presenti')
                    } else if (suspicious.length > 10) {
                        logProgress('PHASE B SKIP', `${suspicious.length} titoli sospetti — troppi, probabilmente struttura portafoglio diversa`)
                    } else {
                        logProgress('PHASE B ALERT',
                            `${suspicious.length} titoli sospetti mancanti: ${suspicious.map(s => s.isin).join(', ')}`
                        )

                        const isinList = suspicious.map(s =>
                            `- ${s.isin} (${s.name}, quantità precedente: ${s.prevQuantity})`
                        ).join('\n')

                        const phaseBPrompt = `Esamina la sezione "CONSISTENZA" / "PORTAFOGLIO" di questo PDF dossier titoli.
Cerca SPECIFICAMENTE i seguenti titoli e per ognuno rispondi se è PRESENTE o NO nel portafoglio:

${isinList}

Per ogni titolo PRESENTE nel PDF, estrai questi dati esattamente come compaiono nel documento:
- isin: codice ISIN
- name: nome del titolo dal PDF
- quantity: quantità/consistenza (converti formato italiano: punto=migliaia, virgola=decimale → numero decimale)
- price: prezzo/quotazione unitario
- marketValue: controvalore in Euro
- currency: divisa (EUR, USD, etc.)
- exchangeRate: cambio (1 se EUR)

IMPORTANTE: NON inventare dati. Se un titolo NON è presente nel PDF, mettilo in "not_found".

Rispondi SOLO con questo JSON:
{
  "found": [{ "isin": "...", "name": "...", "quantity": 0, "price": 0, "marketValue": 0, "currency": "EUR", "exchangeRate": 1 }],
  "not_found": ["ISIN1", "ISIN2"]
}`

                        try {
                            const targetedText = await callGemini(
                                GEMINI_API_KEY!, modelName, phaseBPrompt, base64Data,
                                { thinkingLevel: 'medium' }
                            )
                            const targetedJsonMatch = targetedText.match(/\{[\s\S]*\}/)

                            if (targetedJsonMatch) {
                                let targetedResult: any
                                try {
                                    targetedResult = JSON.parse(targetedJsonMatch[0])
                                } catch {
                                    const repaired = repairTruncatedJson(targetedJsonMatch[0])
                                    if (repaired) targetedResult = JSON.parse(repaired)
                                }

                                if (targetedResult) {
                                    const found = targetedResult.found || []
                                    const notFound = targetedResult.not_found || []

                                    logProgress('PHASE B RESULTS',
                                        `Trovati: ${found.length} | Non trovati: ${notFound.length}`
                                    )

                                    if (found.length > 0) {
                                        const { merged, skipped } = mergeTargetedFindings(parsed, found)
                                        logProgress('PHASE B MERGED',
                                            `${merged} titoli aggiunti al portafoglio, ${skipped} scartati`
                                        )

                                        found.forEach((f: any) => {
                                            if (f.isin && f.marketValue > 0) {
                                                console.log(`  [PHASE B] + ${f.isin} (${f.name}): ${f.quantity} quote, ${f.marketValue}€`)
                                            }
                                        })
                                    }

                                    if (notFound.length > 0) {
                                        console.log(`  [PHASE B] Titoli confermati assenti dal PDF: ${
                                            Array.isArray(notFound) ? notFound.join(', ') : JSON.stringify(notFound)
                                        }`)
                                    }
                                }
                            }
                        } catch (phaseBErr: any) {
                            logProgress('PHASE B AI ERROR',
                                `Verifica mirata fallita: ${phaseBErr.message}. Proseguo senza merge.`
                            )
                        }
                    }
                }
            } catch (phaseBOuterErr: any) {
                logProgress('PHASE B SKIP', `Errore: ${phaseBOuterErr.message}`)
            }
        }

        // Salvataggio su Supabase
        logProgress('SALVATAGGIO DATABASE', 'Inserimento dati in Supabase')

        // Normalize holdings - ensure exchangeRate defaults to 1
        // Fix Italian number format in holdings quantity (e.g., "1.000" → 1.0 instead of 1000)
        // Fix bond prices quoted in centesimi (percentage) → real price / 100
        const normalizedHoldings = (parsed.finalPortfolio || []).map((h: any) => {
            const exchangeRate = h.exchangeRate && h.exchangeRate !== 0 ? h.exchangeRate : 1
            let price = h.price || 0
            const marketValue = h.marketValue || 0
            let quantity = h.quantity || 0

            // Bond price normalization: 98.79 → 0.9879
            if (isBondQuotedInCentesimi(h.name) && price > 1) {
                price = normalizeBondPrice(price)
            }

            // Cross-validate quantity with marketValue via price
            quantity = normalizeItalianQuantity(quantity, price, marketValue, exchangeRate)

            return {
                ...h,
                exchangeRate,
                currency: h.currency || 'EUR',
                quantity,
                price,
                marketValue
            }
        })

        // Fix Italian decimal misinterpretation: if sum of holdings ≈ 1000x the extracted total,
        // Gemini likely read "44.200" (44.20 EUR) as 44200 (treating . as thousands separator)
        const extractedTotalForScale = parsed.summary?.portfolio_total_extracted || 0
        if (extractedTotalForScale > 0 && normalizedHoldings.length > 0) {
            const sumHoldings = normalizedHoldings.reduce((s: number, h: any) => s + (h.marketValue || 0), 0)
            for (const factor of [1000, 1000000]) {
                const ratio = sumHoldings / extractedTotalForScale
                if (ratio > factor * 0.8 && ratio < factor * 1.2) {
                    logProgress('FIX SCALE', `Somma holdings (${sumHoldings.toFixed(0)}) ≈ ${factor}x totale PDF (${extractedTotalForScale.toFixed(0)}). Correggo price/marketValue ÷${factor}`)
                    normalizedHoldings.forEach((h: any) => {
                        h.price = (h.price || 0) / factor
                        h.marketValue = (h.marketValue || 0) / factor
                    })
                    break
                }
            }
        }

        // Build holdings map for cross-validating movement quantities
        const holdingsQtyMap: Record<string, number> = {}
        normalizedHoldings.forEach((h: any) => {
            if (h.isin) holdingsQtyMap[h.isin] = h.quantity || 0
        })

        // Normalize security movements - ensure exchangeRate defaults to 1
        // Calculate fees/taxes from grossAmount - netAmount if not extracted from PDF
        // Fix bond prices quoted in centesimi (percentage) → real price / 100
        const normalizedSecurityMovements = (parsed.securityMovements || []).map((m: any) => {
            const exchangeRate = m.exchangeRate && m.exchangeRate !== 0 ? m.exchangeRate : 1
            let quantity = m.quantity || 0
            let price = m.price || 0

            // Bond price normalization: 98.79 → 0.9879
            if (isBondQuotedInCentesimi(m.name) && price > 1) {
                price = normalizeBondPrice(price)
            }

            // Fix Italian number format misinterpretation: "6.000" parsed as 6 instead of 6000
            // Method 1: Cross-validate with grossAmount
            if (quantity > 0 && price > 0 && m.grossAmount > 0) {
                quantity = normalizeItalianQuantity(quantity, price, m.grossAmount, exchangeRate)
            }
            // Method 2: Cross-validate with holdings for same ISIN
            if (quantity > 0 && quantity <= 100 && m.isin && holdingsQtyMap[m.isin]) {
                const holdingQty = holdingsQtyMap[m.isin]
                const ratio = holdingQty / quantity
                if (ratio >= 900 && ratio <= 1100) {
                    quantity = quantity * 1000
                }
            }
            const netAmount = m.netAmount || 0

            // grossAmount: use extracted value, or calculate from quantity × price × exchangeRate
            const grossAmount = m.grossAmount || (quantity * price * exchangeRate)

            // Save original extracted values for comparison
            const feesExtracted = m.fees || 0
            const taxesExtracted = m.taxes || 0
            const costsExtracted = feesExtracted + taxesExtracted

            // Calculate costs from difference: |netto - lordo|
            const absGross = Math.abs(grossAmount)
            const costsCalculated = absGross > 0 && netAmount !== 0
                ? Math.abs(Math.abs(netAmount) - absGross)
                : 0

            // Use extracted if present, otherwise calculated
            let fees = feesExtracted
            let taxes = taxesExtracted

            if (fees === 0 && taxes === 0 && costsCalculated > 0.01) {
                fees = costsCalculated
            }

            return {
                ...m,
                exchangeRate,
                currency: m.currency || 'EUR',
                quantity,
                price,
                grossAmount,
                netAmount,
                fees,
                taxes,
                // Store both for UI comparison
                costsExtracted,
                costsCalculated: Math.round(costsCalculated * 100) / 100,
                costsSource: costsExtracted > 0.01 ? 'extracted' : 'calculated'
            }
        })

        const analysisFields = {
            bank_name: parsed.info?.bankName || 'Banca N/D',
            period_start: parseDate(parsed.info?.period_start),
            period_end: parseDate(parsed.info?.period_end),
            account_type: parsed.type,
            portfolio_value: isDossier
                ? (normalizedHoldings.reduce((acc: number, item: any) => acc + (item.marketValue || 0), 0) || 0)
                : (typeof parsed.summary?.final_balance === 'object' ? parsed.summary.final_balance.value : (parsed.summary?.final_balance || 0)),
            initial_value: typeof parsed.summary?.initial_balance === 'object'
                ? parsed.summary.initial_balance.value
                : (parsed.summary?.initial_balance || 0),
            holdings: normalizedHoldings,
            transactions: parsed.movements || [],
            dividends: parsed.dividends || [],
            costs_breakdown: {
                ...(parsed.summary || {}),
                scalar_data: parsed.scalar_data || {},
                securityMovements: normalizedSecurityMovements,
                // Map scalar_data fields to dashboard-expected keys
                securities_purchase_count: parsed.scalar_data?.acquisto_titoli_count || 0,
                securities_sale_count: parsed.scalar_data?.vendita_titoli_count || 0,
                securities_movements_count: parsed.scalar_data?.movimenti_titoli_count || 0,
                securities_purchase_amount: parsed.scalar_data?.acquisto_titoli_amount || 0,
                securities_sale_amount: parsed.scalar_data?.vendita_titoli_amount || 0,
                securities_net_amount: (parsed.scalar_data?.acquisto_titoli_amount || 0) + (parsed.scalar_data?.vendita_titoli_amount || 0),
                settlementAccount: parsed.info?.settlementAccount || null,
                holder: parsed.info?.holder || null,
                original_ai_data: { ...(parsed.summary || {}) } // Backup for restore
            },
            benchmark_comparison: parsed.info?.accountNumber || 'N/D',
        }

        let data: any
        let error: any

        if (isReanalysis && reanalyzeId) {
            // RE-ANALYSIS: Update existing record
            logProgress('🔄 UPDATE RECORD', `Aggiornamento analisi ${reanalyzeId}`)
            const result = await supabase
                .from('analyses')
                .update(analysisFields)
                .eq('id', reanalyzeId)
                .select()
                .single()
            data = result.data
            error = result.error
        } else {
            // NEW UPLOAD: Insert new record
            const result = await supabase
                .from('analyses')
                .insert({ ...analysisFields, document_id: crypto.randomUUID(), user_id: userId || null })
                .select()
                .single()
            data = result.data
            error = result.error
        }

        if (error) {
            logProgress('❌ ERRORE DATABASE', error.message)
            return NextResponse.json({ success: false, error: 'Errore salvataggio database' }, { status: 500 })
        }

        // Store PDF in Supabase Storage for future re-analysis
        // Save for new uploads AND re-analyses where the PDF was manually re-uploaded (not already in storage)
        if (userId && data.id) {
            try {
                const pdfStoragePath = `${userId}/${data.id}.pdf`
                const { error: storageError } = await supabase.storage
                    .from('documenti')
                    .upload(pdfStoragePath, pdfBuffer, {
                        contentType: 'application/pdf',
                        upsert: true
                    })
                if (storageError) {
                    console.warn(`[STORAGE] Upload PDF fallito: ${storageError.message}`)
                } else {
                    logProgress('📁 PDF SALVATO', `Storage: pdfs/${pdfStoragePath}`)
                }
            } catch (storageErr: any) {
                console.warn(`[STORAGE] Errore upload PDF: ${storageErr.message}`)
            }
        }

        logProgress('✅ COMPLETATO', `Documento salvato con ID: ${data.id}`)
        console.log(`⏱️ Tempo totale: ${((Date.now() - startTime) / 1000).toFixed(1)}s\n`)

        return NextResponse.json({
            success: true,
            analysisId: data.id,
            documentId: data.id,
            fileName,
            status: 'ready',
            isReanalysis,
            holder: parsed.info?.holder || null,
            // Dati per verifica (usati da batch_verify.js)
            data: {
                movements: parsed.movements || [],
                summary: parsed.summary,
                layout_detected: parsed.layout_detected
            }
        })


    } catch (error: any) {
        console.error('\n!!!!! ERRORE CRITICO PARSE PDF !!!!!')
        console.error('Messaggio:', error.message)
        console.error('Stack:', error.stack)
        return NextResponse.json({ success: false, error: error.message || 'Errore interno del server' }, { status: 500 })
    }
}

// Normalizza numeri conto: gestisce prefissi filiale variabili
// es. "3100/1000811", "19812/3100/1000811", "19812/3100/01000811" → "31001000811"
function normalizeAccountNumber(acc: string): string {
    if (!acc) return '';
    const segments = acc.split(/[\/\-]/).map(s => s.replace(/^0+/, '') || '0').filter(s => s.length > 0);
    if (segments.length === 0) return '';
    return segments.slice(-2).join('').toUpperCase();
}

function parseDate(dateStr: string | undefined): string | null {
    if (!dateStr) return null
    // Formato atteso: GG/MM/AAAA -> YYYY-MM-DD
    const parts = dateStr.split('/')
    if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`
    }
    // Già in formato ISO?
    if (dateStr.includes('-')) return dateStr
    return null
}
