import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as https from 'https'
import crypto from 'crypto'
import { PDFParse } from 'pdf-parse'
import {
    extractPortfolioFromText,
    mergeTextAndGeminiHoldings,
    parseMovimentiFromText,
    type TextPortfolioResult,
} from '@/lib/pdf-text-parser'

// Allow up to 10 minutes for Gemini PDF processing (CC/Liquidità PDFs can be large)
export const maxDuration = 600

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

    const originalProduct = quantity * price * exchangeRate
    const originalError = Math.abs(originalProduct - referenceValue) / referenceValue

    // === PHASE 1: Standard check — qty needs ×1000 with same price ===
    // Triggers when original product is way off (> 50% error)
    for (const multiplier of [1000, 1000000]) {
        const correctedProduct = quantity * multiplier * price * exchangeRate
        const correctedError = Math.abs(correctedProduct - referenceValue) / referenceValue
        if (originalError > 0.5 && correctedError < 0.15) {
            return quantity * multiplier
        }
    }

    // === PHASE 2: Both qty AND price wrong, original far off ===
    // Case: qty=10, price=987, mktVal=98700 (real: qty=10000, price=9.87)
    // Phase 1 fails because 10000×987 is too high. But 10000×(987/100)=98700 works.
    if (originalError > 0.5 && price > 50) {
        for (const qMult of [1000, 1000000]) {
            for (const pDiv of [100, 1000]) {
                const altProduct = quantity * qMult * (price / pDiv) * exchangeRate
                const altError = Math.abs(altProduct - referenceValue) / referenceValue
                if (altError < 0.15) {
                    return quantity * qMult
                }
            }
        }
    }

    return quantity
}

// === BOND PRICE NORMALIZATION ===
// Obbligazioni (BTP, BOT, CCT, CTZ, corporate bonds, structured notes) sono quotate in "centesimi"
// ovvero percentuale del valore nominale (es. 98,79 = 98,79% del nominale).
// Il prezzo reale è price / 100 (es. 0,9879 EUR per EUR nominale).
function isBondQuotedInCentesimi(name: string, isin?: string): boolean {
    // ISIN-based detection — XS = international bonds/structured notes (Euroclear/Clearstream)
    if (isin) {
        const upperIsin = isin.toUpperCase().trim()
        if (upperIsin.startsWith('XS')) return true
    }

    if (!name) return false
    const upper = name.toUpperCase()
    // Titoli di stato italiani — sempre quotati in percentuale
    if (/\b(BTP|BOT|CCT|CTZ)\b/.test(upper)) return true
    // Obbligazioni dirette (non fondi obbligazionari)
    if (/\bOBBLIGAZION[EI]\b/.test(upper) && !/OBBLIGAZIONARI/i.test(upper)) return true
    // Bond con cedola nel nome (es. "ENI 4.75% 2028") — escludendo fondi/ETF
    if (/\d+[,.]?\d*\s*%/.test(name) && !/\b(FUND|FONDO|ETF|SICAV|COMPARTO|CLASSE)\b/i.test(upper)) return true
    // Certificates and structured notes
    if (/\b(CERTIFICATE|CERTIFICAT[OI]|NOTA STRUTTURATA)\b/i.test(upper)) return true
    return false
}

function normalizeBondPrice(price: number): number {
    // Price quoted as percentage (e.g., 98.79) → real price (0.9879)
    return price / 100
}

// Smart bond normalization: when both qty and price can be wrong due to Italian format,
// tries all combinations of qty×{1,1000} and price/{100,1000} to find the best match
// against marketValue (or grossAmount for movements).
function normalizeBondValues(
    quantity: number,
    price: number,
    referenceValue: number,
    exchangeRate: number = 1
): { quantity: number; price: number } {
    if (quantity <= 0 || price <= 0 || referenceValue <= 0) return { quantity, price }

    let bestQty = quantity
    let bestPrice = price
    let bestError = Infinity

    // If price is already normalized (< 1), only try qty corrections
    if (price <= 1) {
        const rateVars = exchangeRate !== 1 ? [exchangeRate, 1 / exchangeRate] : [1]
        for (const qm of [1/1000, 1, 1000, 1000000]) {
            for (const rate of rateVars) {
                const product = quantity * qm * price * rate
                const error = Math.abs(product - referenceValue) / referenceValue
                if (error < bestError) {
                    bestError = error
                    bestQty = quantity * qm
                    bestPrice = price
                }
            }
        }
        return bestError < 0.15 ? { quantity: bestQty, price: bestPrice } : { quantity, price }
    }

    // Price > 1: try all combinations of qty adjustments and price adjustments.
    // Includes qty÷1000 for Italian format errors ("30,000" parsed as 30000 instead of 30)
    // and price÷1 (no change) for structured notes priced per-unit, not in centesimi.
    // Order matters for ties: prefer keeping price as-is (÷1) over dividing,
    // and prefer dividing qty over multiplying, to correctly handle structured notes.
    bestPrice = price / 100  // fallback: standard centesimi

    const qtyMultipliers = [1/1000, 1, 1000]
    const priceDivisors = [1, 100, 1000]
    const rateVariants = exchangeRate !== 1 ? [exchangeRate, 1 / exchangeRate] : [1]

    for (const qm of qtyMultipliers) {
        for (const pd of priceDivisors) {
            for (const rate of rateVariants) {
                const candidateQty = quantity * qm
                const candidatePrice = price / pd
                const product = candidateQty * candidatePrice * rate
                const error = Math.abs(product - referenceValue) / referenceValue
                if (error < bestError) {
                    bestError = error
                    bestQty = candidateQty
                    bestPrice = candidatePrice
                }
            }
        }
    }

    // Only apply correction if reasonably close (< 15%)
    if (bestError < 0.15) {
        return { quantity: bestQty, price: bestPrice }
    }

    // Fallback: standard /100, no qty change
    return { quantity, price: price / 100 }
}

// === PORTFOLIO VALIDATION HELPERS ===

function validatePortfolioTotals(parsed: any, textTotal?: number): {
    needsRetry: boolean
    gap: number
    gapPercent: number
    sumOfMarketValues: number
    extractedTotal: number
} {
    const holdings = parsed.finalPortfolio || []
    // Use Gemini-extracted total, fallback to text-extracted total
    const extractedTotal = parsed.summary?.portfolio_total_extracted || textTotal || 0

    if (holdings.length === 0) {
        return { needsRetry: false, gap: 0, gapPercent: 0, sumOfMarketValues: 0, extractedTotal }
    }

    if (extractedTotal <= 0) {
        // No PDF total to compare against — but if all holdings have marketValue = 0, flag for retry
        const sum = holdings.reduce((acc: number, h: any) => acc + (h.marketValue || 0), 0)
        const needsRetry = holdings.length > 0 && sum === 0
        return { needsRetry, gap: 0, gapPercent: needsRetry ? 100 : 0, sumOfMarketValues: sum, extractedTotal }
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

// === TEXT-BASED HOLDINGS CORRECTION ===
// Moved to lib/pdf-text-parser.ts — deterministic parser for Italian bank PDFs
// Uses extractPortfolioFromText() + mergeTextAndGeminiHoldings()

// Old correctHoldingsFromText removed — replaced by mergeTextAndGeminiHoldings from lib/pdf-text-parser

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
    const combined = `${op} ${text}`

    if (
        /vend|riscatt|disinv|scaric|switch.?out|liquidaz|prelievo.?quote|rimborso|estinzion|cedola.?finale|scadenza/
            .test(combined)
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
- "Sottoscrizione", "Acquisto", "Switch In", "Carico", "ACQ.CONT.SU MERC.", "VERS.TITOLI", "SICAV: SOTT PAC", "SICAV: SOTTOSCR", "FONDI: SOTTOSCR", "GIRO ALTRO DOSSIER" => operationType "Acquisto"
- "Vendita", "Riscatto", "Switch Out", "Disinvestimento", "Scarico", "VEN.CONT.SU MERC.", "SICAV: RIMBORSO", "FONDI: RIMBORSO" => operationType "Vendita"
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
                periodFrequency: { type: 'string', enum: ['monthly', 'quarterly', 'semiannual', 'annual'] },
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
    options?: { thinkingLevel?: string; jsonSchema?: any; cachedContent?: string; supplementaryText?: string; timeoutMs?: number }
): Promise<string> {
    return new Promise((resolve, reject) => {
        const thinkingLevel = options?.thinkingLevel || 'low'
        const jsonSchema = options?.jsonSchema || null

        // Gemini 3.x uses thinkingLevel (string), Gemini 2.5 uses thinkingBudget (number)
        const isGemini3 = model.includes('gemini-3') || model.includes('gemini3')
        const thinkingBudgetMap: Record<string, number> = { low: 1024, medium: 8192, high: 24576 }

        const generationConfig: any = {
            responseMimeType: 'application/json',
            temperature: 0,
            topP: 1,
            topK: 1,
            maxOutputTokens: 200000,
            thinkingConfig: isGemini3
                ? { thinkingLevel }
                : { thinkingBudget: thinkingBudgetMap[thinkingLevel] || 8192 }
        }

        // Add JSON schema enforcement if provided
        if (jsonSchema) {
            generationConfig.responseJsonSchema = jsonSchema
        }

        const pdfPart: any = { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } }
        // mediaResolution is only supported by Gemini 3.x models
        if (isGemini3) {
            pdfPart.mediaResolution = { level: 'media_resolution_high' }
        }

        const contentParts: any[] = [
            { text: 'Analizza questo documento PDF ed estrai i dati in formato JSON.' },
            pdfPart
        ]
        // Add supplementary text (e.g. extracted MOVIMENTI section) as cross-reference for the model
        if (options?.supplementaryText) {
            contentParts.push({ text: options.supplementaryText })
        }

        const body: any = {
            contents: [{ parts: contentParts }],
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
        }

        const req = https.request(reqOptions, (res) => {
            let data = ''
            res.on('data', (chunk: Buffer) => { data += chunk.toString() })
            res.on('end', () => {
                clearTimeout(totalTimeout)
                if (res.statusCode === 200) {
                    try {
                        const json = JSON.parse(data)
                        const text = json.candidates?.[0]?.content?.parts?.[0]?.text || ''
                        resolve(text)
                    } catch (e: any) {
                        reject(new Error(`JSON parse error: ${e.message}`))
                    }
                } else if (res.statusCode === 403 && data.includes('CachedContent') && options?.cachedContent) {
                    // CachedContent expired or was invalidated — invalidate local cache and retry without it
                    console.log(`[CACHE] CachedContent expired, invalidating and retrying without cache`)
                    cachedContentName = null
                    cachedContentExpiry = 0
                    // Rebuild body without cachedContent, using inline system_instruction instead
                    const retryBody = { ...body }
                    delete retryBody.cachedContent
                    retryBody.system_instruction = { parts: [{ text: systemPrompt }] }
                    const retryRequestBody = JSON.stringify(retryBody)
                    const retryReqOptions = { ...reqOptions, headers: { ...reqOptions.headers, 'Content-Length': Buffer.byteLength(retryRequestBody) } }
                    const retryReq = https.request(retryReqOptions, (retryRes) => {
                        let retryData = ''
                        retryRes.on('data', (chunk: Buffer) => { retryData += chunk.toString() })
                        retryRes.on('end', () => {
                            clearTimeout(retryTimeout)
                            if (retryRes.statusCode === 200) {
                                try {
                                    const json = JSON.parse(retryData)
                                    const text = json.candidates?.[0]?.content?.parts?.[0]?.text || ''
                                    resolve(text)
                                } catch (e: any) {
                                    reject(new Error(`JSON parse error on retry: ${e.message}`))
                                }
                            } else {
                                reject(new Error(`HTTP ${retryRes.statusCode}: ${retryData.substring(0, 500)}`))
                            }
                        })
                    })
                    const retryTimeout = setTimeout(() => {
                        retryReq.destroy(new Error(`Gemini retry request timeout after ${callTimeoutMs / 1000}s`))
                    }, callTimeoutMs)
                    retryReq.on('error', (e: Error) => { clearTimeout(retryTimeout); reject(e) })
                    retryReq.write(retryRequestBody)
                    retryReq.end()
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 500)}`))
                }
            })
        })

        // Per-call timeout — prevents infinite hang, leaves time for retries within maxDuration
        const callTimeoutMs = options?.timeoutMs || 120000
        const totalTimeout = setTimeout(() => {
            req.destroy(new Error(`Gemini request timeout after ${callTimeoutMs / 1000}s`))
        }, callTimeoutMs)

        req.on('error', (e: Error) => { clearTimeout(totalTimeout); reject(e) })
        req.write(requestBody)
        req.end()
    })
}

// OCR transcription variant: uses Gemini vision to transcribe scanned PDF text faithfully (plain text output, no JSON)
function callGeminiTranscriber(apiKey: string, model: string, pdfBase64: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const isGemini3 = model.includes('gemini-3') || model.includes('gemini3')
        // Use Flash model for OCR — much faster and cheaper, transcription doesn't need Pro reasoning
        const ocrModel = isGemini3 ? 'gemini-2.0-flash' : model.replace('-pro-', '-flash-')

        const pdfPart: any = { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } }

        const requestBody = JSON.stringify({
            system_instruction: {
                parts: [{
                    text: `Trascrivi il testo del documento. Output SOLO testo puro, NO markdown, NO asterischi, NO formattazione.
Mantieni numeri italiani esattamente come scritti (punti=migliaia, virgola=decimali): 1.234.567,89
Mantieni codici ISIN (es. IT0005239360), quantità, prezzi, controvalori, date.
Per le tabelle usa TAB tra le colonne. Ogni riga su una riga nuova.
NON aggiungere commenti, intestazioni tue, o "Pagina X". Solo il testo del documento.`
                }]
            },
            contents: [{
                parts: [
                    { text: 'Trascrivi il testo visibile.' },
                    pdfPart
                ]
            }],
            generationConfig: {
                responseMimeType: 'text/plain',
                temperature: 0,
                maxOutputTokens: 30000,
            }
        })

        const reqOptions = {
            hostname: 'generativelanguage.googleapis.com',
            port: 443,
            path: `/v1beta/models/${ocrModel}:generateContent?key=${apiKey}`,
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
                clearTimeout(totalTimeout)
                if (res.statusCode === 200) {
                    try {
                        const json = JSON.parse(data)
                        const text = json.candidates?.[0]?.content?.parts?.[0]?.text || ''
                        resolve(text)
                    } catch (e: any) {
                        reject(new Error(`OCR JSON parse error: ${e.message}`))
                    }
                } else {
                    reject(new Error(`OCR HTTP ${res.statusCode}: ${data.substring(0, 500)}`))
                }
            })
        })

        // 60s timeout for OCR (Flash model, should be fast)
        const totalTimeout = setTimeout(() => {
            req.destroy(new Error('OCR request timeout after 60s'))
        }, 60000)

        req.on('error', (e: Error) => { clearTimeout(totalTimeout); reject(e) })
        req.write(requestBody)
        req.end()
    })
}

// Text-only variant for recovery paths
function callGeminiWithText(apiKey: string, model: string, systemPrompt: string, documentText: string, options?: { thinkingLevel?: string }): Promise<string> {
    return new Promise((resolve, reject) => {
        const thinkingLevel = options?.thinkingLevel || 'low'
        const isGemini3 = model.includes('gemini-3') || model.includes('gemini3')
        const thinkingBudgetMap: Record<string, number> = { low: 1024, medium: 8192, high: 24576 }

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
                thinkingConfig: isGemini3
                    ? { thinkingLevel }
                    : { thinkingBudget: thinkingBudgetMap[thinkingLevel] || 8192 }
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
                clearTimeout(totalTimeout)
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

        // 90s timeout for text-only calls (no PDF vision, should be faster)
        const totalTimeout = setTimeout(() => {
            req.destroy(new Error('Gemini text request timeout after 90s'))
        }, 90000)

        req.on('error', (e: Error) => { clearTimeout(totalTimeout); reject(e) })
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
        const dryRun = formData.get('dryRun') === 'true'  // Test mode: skip DB save, return normalized data
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

        // Extract text from PDF for reliable text-based retries (bypasses Gemini vision issues at page boundaries)
        let pdfExtractedText = ''
        let hasMovementsSection = false
        let incompleteMovements = false  // Intesa: movements exist but don't cover all portfolio changes
        try {
            const pdfParser = new PDFParse(new Uint8Array(pdfBuffer))
            const textResult = await pdfParser.getText()
            pdfExtractedText = textResult.text || ''
            // Normalize invisible chars used as thousands separators (Intesa uses \u0019)
            pdfExtractedText = pdfExtractedText.replace(/(\d)[\u0019\u001a\u001b\u001c\u001d\u001e\u001f](\d)/g, '$1$2')
            hasMovementsSection = pdfExtractedText.toUpperCase().includes('MOVIMENTI')
            if (pdfExtractedText.length > 100) {
                logProgress('PDF TEXT', `${pdfExtractedText.length} car, MOVIMENTI: ${hasMovementsSection ? 'sì' : 'no'}`)
            }
        } catch (textErr: any) {
            logProgress('PDF TEXT SKIP', `Estrazione testo fallita: ${textErr.message?.substring(0, 80)}`)
        }

        // Extract MOVIMENTI section from text for targeted retries
        let movimentiSectionText = ''
        if (hasMovementsSection && pdfExtractedText.length > 0) {
            const movStart = pdfExtractedText.toUpperCase().indexOf('MOVIMENTI')
            let movEnd = pdfExtractedText.toUpperCase().indexOf('DIVIDENDI', movStart > 0 ? movStart : 0)
            if (movEnd === -1) movEnd = pdfExtractedText.length
            movimentiSectionText = pdfExtractedText.substring(Math.max(0, movStart - 20), movEnd).trim()
        }

        // === DETERMINISTIC TEXT PARSER ===
        // Run the text-first parser on extracted PDF text — this is the primary source for numbers
        const upperText = pdfExtractedText.toUpperCase()
        const isDossierFromText = upperText.includes('DOSSIER TITOLI') || upperText.includes('ESTRATTO CONTO TITOLI')
            || upperText.includes('RENDICONTO') || upperText.includes('PORTAFOGLIO TITOLI')
        // Save original pdf-parse text before OCR might overwrite pdfExtractedText
        const originalPdfText = pdfExtractedText

        let textParserResult: TextPortfolioResult | null = null
        let textPortfolioTotal = 0
        if (isDossierFromText && pdfExtractedText.length > 0) {
            textParserResult = extractPortfolioFromText(pdfExtractedText)
            textPortfolioTotal = textParserResult.total

            const verifiedCount = textParserResult.holdings.filter(h => h.verified).length
            logProgress('TEXT PARSER', [
                `Banca: ${textParserResult.bankDetected || 'non rilevata'}`,
                `Sezione: ${textParserResult.sectionFound ? 'trovata' : 'NON trovata'}`,
                `Holdings: ${textParserResult.holdings.length} (${verifiedCount} verificati)`,
                `Totale: ${textParserResult.total > 0 ? textParserResult.total.toFixed(2) + '€' : 'non trovato'}`,
                `Somma: ${textParserResult.holdingsSum.toFixed(2)}€`,
                textParserResult.total > 0
                    ? `Gap: ${Math.abs(textParserResult.holdingsSum - textParserResult.total).toFixed(2)}€ (${((Math.abs(textParserResult.holdingsSum - textParserResult.total) / textParserResult.total) * 100).toFixed(1)}%)`
                    : '',
            ].filter(Boolean).join(' | '))
        }

        // === OCR TRANSCRIPTION FOR SCANNED PDFs ===
        // Trigger OCR when:
        // 1. Text too short to determine document type (< 200 chars), OR
        // 2. Text parser identified a dossier but found 0 holdings AND no ISINs in text (scanned financial pages)
        //    If ISINs are present, it's a text-based PDF that simply has no holdings (e.g. all positions sold) — OCR won't help
        const hasIsinsInText = /[A-Z]{2}[A-Z0-9]{9}\d/.test(pdfExtractedText)
        const dossierWithNoHoldings = isDossierFromText && textParserResult && textParserResult.holdings.length === 0 && !hasIsinsInText
        const textTooShort = pdfExtractedText.length < 200
        if (textTooShort || dossierWithNoHoldings) {
            logProgress('OCR TRASCRIZIONE', `Testo estratto troppo corto (${pdfExtractedText.length} car) — tentativo trascrizione OCR con Gemini`)
            try {
                const ocrModelName = process.env.GEMINI_MODEL || 'gemini-3-pro-preview'
                const ocrText = await callGeminiTranscriber(GEMINI_API_KEY, ocrModelName, base64Data)
                if (ocrText && ocrText.length > 200) {
                    logProgress('OCR COMPLETATA', `${ocrText.length} car trascritti`)

                    // Update pdfExtractedText with transcription for downstream use
                    pdfExtractedText = ocrText
                    // Do NOT update hasMovementsSection for scanned PDFs — OCR movements are unreliable for coherence

                    // Re-extract MOVIMENTI section from transcribed text
                    if (hasMovementsSection) {
                        const movStart = pdfExtractedText.toUpperCase().indexOf('MOVIMENTI')
                        let movEnd = pdfExtractedText.toUpperCase().indexOf('DIVIDENDI', movStart > 0 ? movStart : 0)
                        if (movEnd === -1) movEnd = pdfExtractedText.length
                        movimentiSectionText = pdfExtractedText.substring(Math.max(0, movStart - 20), movEnd).trim()
                    }

                    // Re-evaluate isDossier from transcribed text
                    const upperOcr = pdfExtractedText.toUpperCase()
                    const isDossierFromOcr = upperOcr.includes('DOSSIER TITOLI') || upperOcr.includes('ESTRATTO CONTO TITOLI')
                        || upperOcr.includes('RENDICONTO') || upperOcr.includes('PORTAFOGLIO TITOLI')
                        || upperOcr.includes('CONSISTENZA') || upperOcr.includes('SITUAZIONE DEPOSITO')

                    if (isDossierFromOcr) {
                        textParserResult = extractPortfolioFromText(pdfExtractedText)
                        textPortfolioTotal = textParserResult.total

                        const verifiedCount = textParserResult.holdings.filter(h => h.verified).length
                        logProgress('OCR TEXT PARSER', [
                            `Banca: ${textParserResult.bankDetected || 'non rilevata'}`,
                            `Holdings: ${textParserResult.holdings.length} (${verifiedCount} verificati)`,
                            `Totale: ${textParserResult.total > 0 ? textParserResult.total.toFixed(2) + '€' : 'non trovato'}`,
                            `Somma: ${textParserResult.holdingsSum.toFixed(2)}€`,
                            textParserResult.total > 0
                                ? `Gap: ${Math.abs(textParserResult.holdingsSum - textParserResult.total).toFixed(2)}€ (${((Math.abs(textParserResult.holdingsSum - textParserResult.total) / textParserResult.total) * 100).toFixed(1)}%)`
                                : '',
                        ].filter(Boolean).join(' | '))
                    } else {
                        logProgress('OCR TIPO', 'Testo trascritto non sembra un dossier titoli')
                    }
                } else {
                    logProgress('OCR SKIP', `Trascrizione troppo corta (${ocrText?.length || 0} car)`)
                }
            } catch (ocrErr: any) {
                logProgress('OCR ERRORE', `Trascrizione fallita: ${ocrErr.message?.substring(0, 100)}`)
            }
        }

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
- **period_end** (CRITICO): Cerca "SITUAZIONE AL [data]", "CONSISTENZA AL [data]", "PERIODO RENDICONTATO", "DAL ... AL ...". La data finale è il period_end.
- **period_start**: La data di inizio periodo (fine del periodo precedente). Se non sei sicuro, metti la tua migliore stima — verrà validata automaticamente.
- **periodFrequency** (CRITICO): Determina la frequenza del rendiconto:
  - "monthly" = mensile (~30 giorni, es. "Situazione al 30/11/2024" copre solo novembre)
  - "quarterly" = trimestrale (~90 giorni, es. "Situazione al 30/09/2024" copre luglio-settembre)
  - "semiannual" = semestrale (~180 giorni, es. copre gennaio-giugno)
  - "annual" = annuale (~365 giorni, es. copre tutto l'anno)
  Come determinare la frequenza: guarda quanti MESI copre il rendiconto. Se mostra "DAL 30/06/2024 AL 30/11/2024" ma i movimenti titoli sono solo di novembre, è MENSILE (non semestrale). La data 30/06 è solo un riferimento storico.

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
  Se il valore è nella colonna "Carico" → "Acquisto". Se nella colonna "Scarico" → "Vendita".
  Mappatura: "Sottoscrizione","ACQ.CONT.SU MERC.","VERS.TITOLI","SICAV: SOTT PAC","SICAV: SOTTOSCR","FONDI: SOTTOSCR","GIRO ALTRO DOSSIER","Switch In","Carico" → "Acquisto"
  "Vendita","VEN.CONT.SU MERC.","SICAV: RIMBORSO","FONDI: RIMBORSO","Riscatto","Switch Out","Disinvestimento","Scarico" → "Vendita"
  IMPORTANTE: "GIRO ALTRO DOSSIER" (trasferimento titoli da altro dossier) è un movimento reale, NON ignorarlo.
  IMPORTANTE: Leggi TUTTE le pagine della sezione MOVIMENTI fino alla fine. NON fermarti a metà pagina. I movimenti in fondo alla pagina o su pagine successive sono altrettanto importanti.
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

**9.4 AUTO-VERIFICA MOVIMENTI (OBBLIGATORIA):**
Alcune banche (es. Crédit Agricole) nella sezione MOVIMENTI mostrano per ogni strumento:
- "Consistenza iniziale di periodo" (quantità all'inizio)
- Ogni riga di carico/scarico (i singoli movimenti)
- "Consistenza finale di periodo" (quantità alla fine)

Se il PDF contiene queste informazioni, DEVI:
1. Estrarre la "Consistenza iniziale di periodo" nel campo **movementsStartQuantities** (oggetto ISIN→quantità)
2. Verificare: iniziale + somma(carichi) - somma(scarichi) = finale
3. Se NON corrisponde → hai SALTATO un movimento. Rileggi la tabella e trova la riga mancante.

Se il PDF NON mostra le consistenze iniziale/finale per strumento (es. mostra solo la lista operazioni senza totali), lascia **movementsStartQuantities** come oggetto vuoto {}.

ERRORE COMUNE: estrarre solo 2-3 PAC quando ce ne sono 4-5 (PAC mensili = fino a 3-4-5 righe per trimestre).
NON fermarti se la verifica non torna — cerca TUTTE le righe per ogni ISIN.

PATTERN CRITICO: Quando per un ISIN c'è un RIMBORSO totale seguito da un SOTT PAC (o simile acquisto), sono DUE movimenti distinti:
  - Riga 1: SICAV: RIMBORSO → Vendita (scarico di tutte le quote)
  - Riga 2: SICAV: SOTT PAC → Acquisto (carico di nuove quote)
  Il valore del SOTT PAC può coincidere con la consistenza finale, ma è comunque un MOVIMENTO SEPARATO. NON confonderli.

### STRUTTURA JSON RICHIESTA:
{
  "type": "DOSSIER" | "LIQUIDITY",
  "layout_detected": "two_columns_dare_avere" | "single_column_with_sign" | "single_column_no_sign" | "other",
  "info": {
    "bankName": "Nome Banca",
    "accountNumber": "Numero Conto o Dossier Titoli (es. 445/0000004742990)",
    "period_start": "YYYY-MM-DD",
    "period_end": "YYYY-MM-DD",
    "periodFrequency": "monthly | quarterly | semiannual | annual",
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
  "movementsStartQuantities": {},
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

        // First pass: when text parser extracted holdings, use 'low' thinking (text = primary source for numbers,
        // Gemini only needed for metadata/names/dates). Fall back to 'medium' for scanned PDFs or no text results.
        const maxRetries = 2
        let resText = ''
        let parseSuccess = false
        let lastParseError = ''
        const textParserHasGoodResults = textParserResult && textParserResult.holdings.length > 0
        // LIQUIDITY PDFs (Estratto Conto, Liquidità) have no holdings — use 'low' thinking
        const isLikelyLiquidity = !textParserHasGoodResults && (
            upperText.includes('ESTRATTO CONTO') || upperText.includes('LIQUIDIT') ||
            upperText.includes('CONTO CORRENTE') || upperText.includes('E/C ')
        )
        let currentThinkingLevel = isLikelyLiquidity ? 'low' : (isDossierFromText ? (textParserHasGoodResults ? 'low' : 'medium') : 'low')

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            // Skip retry if time budget exhausted (keep 60s for post-processing)
            const retryElapsed = (Date.now() - startTime) / 1000
            if (attempt > 1 && retryElapsed >= 200) {
                logProgress('RETRY SKIP', `Budget tempo esaurito (${retryElapsed.toFixed(0)}s), salto tentativo ${attempt}`)
                break
            }
            try {
                logProgress('CHIAMATA GEMINI AI', `Tentativo ${attempt}/${maxRetries} con ${modelName} (thinking: ${currentThinkingLevel}, dossier: ${isDossierFromText})`)

                // Build supplementary text with all available cross-references
                const supplementaryParts: string[] = []

                // MOVIMENTI section text
                if (movimentiSectionText.length > 50 && movimentiSectionText.length < 15000) {
                    supplementaryParts.push(
                        `IMPORTANTE — TESTO ESTRATTO SEZIONE MOVIMENTI:\nQuesto è il testo raw della sezione MOVIMENTI del PDF. Usalo come FONTE PRIMARIA per estrarre securityMovements e movementsStartQuantities. Include tutti i movimenti anche quelli vicini ai bordi di pagina o che attraversano il page break.\nATTENZIONE: Le righe con solo data+numero senza tipo operazione sono "Consistenza iniziale/finale", NON movimenti. Le righe con data+numero+tipo operazione (es. SICAV: SOTT PAC, FONDI: SOTTOSCR) sono movimenti reali.\n\n${movimentiSectionText}`
                    )
                }

                // CONSISTENZA section summary from text parser (for DOSSIER)
                if (textParserResult && textParserResult.holdings.length > 0) {
                    const holdingsSummary = textParserResult.holdings
                        .map(h => `${h.isin} | ${h.currency} | qty=${h.quantity} | price=${h.price} | mktVal=${h.marketValue.toFixed(2)}€ | ${h.verified ? 'VERIFIED' : 'unverified'}`)
                        .join('\n')
                    supplementaryParts.push(
                        `IMPORTANTE — HOLDINGS ESTRATTI DAL TESTO (fonte primaria per numeri):\nIl parser deterministico ha estratto ${textParserResult.holdings.length} titoli dalla sezione CONSISTENZA.\nI numeri sotto sono CORRETTI (estratti dal testo raw del PDF). Usa gli stessi ISIN e quantità.\nSe trovi titoli aggiuntivi nel PDF, aggiungili. Ma NON modificare i numeri dei titoli sotto.\n\n${holdingsSummary}`
                    )
                }

                // Pre-extracted portfolio total as ground truth
                if (textPortfolioTotal > 0) {
                    supplementaryParts.push(
                        `VERIFICA PORTFOLIO: Il controvalore totale estratto dal testo del PDF è ${textPortfolioTotal.toFixed(2)}€. La somma dei marketValue in finalPortfolio DEVE essere circa uguale a questo valore.`
                    )
                }

                const supplementaryText = supplementaryParts.length > 0
                    ? '\n\n' + supplementaryParts.join('\n\n')
                    : undefined

                // Dynamic timeout: cap per-call at 180s, but respect overall 280s budget
                const elapsedSoFar = (Date.now() - startTime) / 1000
                const remainingBudget = Math.max(30000, (280 - elapsedSoFar) * 1000)
                const callTimeout = Math.min(180000, remainingBudget)

                resText = await callGemini(GEMINI_API_KEY!, modelName, systemPrompt, base64Data, {
                    thinkingLevel: currentThinkingLevel,
                    jsonSchema: PARSE_PDF_JSON_SCHEMA,
                    cachedContent: cachedContent || undefined,
                    supplementaryText,
                    timeoutMs: callTimeout,
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
                    // Daily quota exhausted - no point retrying
                    if (errMsg.includes('per_day') || errMsg.includes('per_model_per_day')) {
                        logProgress('QUOTA GIORNALIERA ESAURITA', 'Nessun retry possibile')
                        break
                    }
                    const waitTime = attempt * 20000 // 20s, 40s, 60s (was: 60s, 120s, 240s)
                    logProgress('RATE LIMIT', `Attendo ${waitTime / 1000}s prima del prossimo tentativo`)
                    await new Promise(resolve => setTimeout(resolve, waitTime))
                } else if (isServerError) {
                    const waitTime = attempt * 10000 // 10s, 20s, 30s
                    logProgress('SERVER ERROR', `${errMsg.substring(0, 80)}, riprovo tra ${waitTime / 1000}s`)
                    await new Promise(resolve => setTimeout(resolve, waitTime))
                } else if (isNetworkError) {
                    // For timeouts, retry immediately (no point waiting — the API was just slow)
                    const isTimeout = errMsg.includes('timeout')
                    const waitTime = isTimeout ? 2000 : attempt * 15000
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

        const dossierHoldingsSum = parsed.type === 'DOSSIER'
            ? (parsed.finalPortfolio || []).reduce((s: number, h: any) => s + (h.marketValue || 0), 0)
            : 0
        const needsValidationRetry = parsed.type === 'DOSSIER'
            ? // DOSSIER: retry se nessun holding estratto O se tutti gli holdings hanno marketValue = 0
              (!parsed.finalPortfolio || parsed.finalPortfolio.length === 0 ||
               (parsed.finalPortfolio.length > 0 && dossierHoldingsSum === 0))
            : // LIQUIDITY: retry se la matematica dei saldi non torna
              (validationInitial !== 0 && validationFinal !== 0 && validationError > 5) ||
              (validationInitial === 0 && validationFinal === 0 && validationMovements.length > 0)

        // Time budget check: skip validation retry if we've already used > 160s
        // (validation retry needs up to 120s, total must stay under 280s)
        const elapsedBeforeValidation = (Date.now() - startTime) / 1000
        if (needsValidationRetry && elapsedBeforeValidation >= 160) {
            logProgress('VALIDATION RETRY SKIP', `Budget tempo esaurito (${elapsedBeforeValidation.toFixed(0)}s), salto validation retry`)
        }

        if (needsValidationRetry && currentThinkingLevel === 'low' && elapsedBeforeValidation < 160) {
            logProgress('VALIDATION RETRY',
                `Errore matematico: ${validationError.toFixed(2)}€ (atteso: ${validationExpected.toFixed(2)}, ottenuto: ${validationSum.toFixed(2)}). ` +
                `Retry con thinking: medium (${elapsedBeforeValidation.toFixed(0)}s trascorsi)`
            )

            try {
                const retryPrompt = systemPrompt + (validationError > 5 ?
                    `\n\nATTENZIONE: L'estrazione precedente aveva un errore matematico di ${validationError.toFixed(2)}€. ` +
                    `La somma dei movimenti (${validationSum.toFixed(2)}) non corrisponde a Saldo Finale (${validationFinal.toFixed(2)}) - Saldo Iniziale (${validationInitial.toFixed(2)}) = ${validationExpected.toFixed(2)}. ` +
                    `Verifica attentamente i segni di ogni movimento e assicurati di estrarre TUTTI i movimenti.` : '')

                // Dynamic timeout: cap at remaining budget (max 280s total)
                const retryTimeoutMs = Math.max(30000, (280 - elapsedBeforeValidation) * 1000)
                const retryText = await callGemini(GEMINI_API_KEY!, modelName, retryPrompt, base64Data, {
                    thinkingLevel: 'medium',
                    jsonSchema: PARSE_PDF_JSON_SCHEMA,
                    timeoutMs: Math.min(120000, retryTimeoutMs),
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

            const elapsedBeforeSV = (Date.now() - startTime) / 1000
            if (significantIssues > 0 && elapsedBeforeSV < 160) {
                logProgress('SELF-VERIFICATION',
                    `${significantIssues} problemi significativi, invio JSON + PDF a Gemini per verifica (${elapsedBeforeSV.toFixed(0)}s trascorsi)`
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
                    const svTimeoutMs = Math.max(30000, (280 - elapsedBeforeSV) * 1000)
                    const verifyText = await callGemini(GEMINI_API_KEY!, modelName, verifyPrompt, base64Data, {
                        thinkingLevel: 'medium',
                        jsonSchema: PARSE_PDF_JSON_SCHEMA,
                        timeoutMs: Math.min(120000, svTimeoutMs),
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
            } else if (significantIssues > 0) {
                logProgress('SELF-VERIFICATION SKIP', `Budget tempo esaurito (${elapsedBeforeSV.toFixed(0)}s), salto verifica`)
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

        // === TEXT-BASED MOVEMENT PARSER (PRIMARY SOURCE) ===
        // Same philosophy as holdings: text is the GUARANTEE, Gemini is supplementary.
        // The deterministic parser extracts movements from structured CA-format text.
        // Text-parsed quantities/movements ALWAYS override Gemini when available.
        if (isDossier && pdfExtractedText.length > 200) {
            const textMovResult = parseMovimentiFromText(pdfExtractedText)
            const textStartCount = Object.keys(textMovResult.startQuantities).length
            const textEndCount = Object.keys(textMovResult.endQuantities).length

            // Intesa format: movements exist but no explicit start/end quantities in MOVIMENTI section.
            // Start/end quantities come from CONSISTENZA holdings (current period) and DB (previous period).
            // Keep hasMovementsSection = true so dashboard shows coherence check.
            // The coherence check will use prevDoc.holdings as startQuantities and current holdings as endQuantities.
            if (textMovResult.movements.length > 0 && textStartCount === 0 && textEndCount === 0) {
                incompleteMovements = true
                logProgress('TEXT MOVIMENTI', `${textMovResult.movements.length} movimenti trovati (formato Intesa: start/end da CONSISTENZA, movimenti parziali)`)
            }

            if (textStartCount > 0 || textMovResult.movements.length > 0) {
                // startQuantities: text ALWAYS wins (deterministic > AI)
                if (textStartCount > 0) {
                    const geminiStartCount = Object.keys(parsed.movementsStartQuantities || {}).length
                    parsed.movementsStartQuantities = textMovResult.startQuantities
                    logProgress('TEXT MOVIMENTI', `startQuantities da testo: ${textStartCount} ISIN (Gemini ne aveva ${geminiStartCount})`)
                }

                // securityMovements: merge text (primary) + Gemini (supplementary for ISINs not in text)
                if (textMovResult.movements.length > 0) {
                    const textMovements = textMovResult.movements.map(m => ({
                        isin: m.isin,
                        date: m.date,
                        name: '',
                        operationType: m.operationType,
                        quantity: m.quantity,
                        price: m.price || 0,
                        grossAmount: m.grossAmount || 0,
                        netAmount: m.netAmount || 0,
                        fees: 0,
                        taxes: 0,
                        currency: m.currency || 'EUR',
                        exchangeRate: 1,
                        _source: 'text' as const,
                    }))

                    const geminiMovements = parsed.securityMovements || []
                    const textIsins = new Set(textMovResult.movements.map(m => m.isin))

                    // Keep Gemini movements only for ISINs NOT covered by text parser
                    // (text parser might miss ISINs with unusual format, Gemini can fill gaps)
                    const geminiSupplementary = geminiMovements.filter((m: any) => !textIsins.has(m.isin))

                    // For ISINs covered by BOTH: enrich text movements with Gemini data
                    // Text values (deterministic) ALWAYS win over Gemini for price/amount
                    // Gemini only fills gaps (when text didn't extract a value)
                    for (const tm of textMovements) {
                        const geminiMatch = geminiMovements.find((gm: any) =>
                            gm.isin === tm.isin && gm.date === tm.date
                        )
                        if (geminiMatch) {
                            if (!tm.price && geminiMatch.price > 0) tm.price = geminiMatch.price
                            if (!tm.grossAmount && geminiMatch.grossAmount > 0) tm.grossAmount = geminiMatch.grossAmount
                            if (!tm.netAmount && geminiMatch.netAmount > 0) tm.netAmount = geminiMatch.netAmount
                            if (geminiMatch.fees > 0) tm.fees = geminiMatch.fees
                            if (geminiMatch.taxes > 0) tm.taxes = geminiMatch.taxes
                            if (geminiMatch.name) tm.name = geminiMatch.name
                        }
                    }

                    parsed.securityMovements = [...textMovements, ...geminiSupplementary]
                    logProgress('TEXT MOVIMENTI',
                        `${textMovements.length} movimenti da testo (primari) + ${geminiSupplementary.length} da Gemini (supplementari) = ${parsed.securityMovements.length} totali`)
                }
            }
        }

        // === PHASE A-MOV: Self-contained Movement Validation ===
        // Compare extracted scalar_data counts/amounts against actual securityMovements array.
        // If the PDF says "3 acquisti" but we only have 1 in the array → movements are missing.
        // This works WITHOUT any previous period — purely self-contained.
        if (isDossier && parsed.securityMovements) {
            const scalarBuyCount = parsed.scalar_data?.acquisto_titoli_count || 0
            const scalarSellCount = parsed.scalar_data?.vendita_titoli_count || 0
            const scalarTotalCount = parsed.scalar_data?.movimenti_titoli_count || (scalarBuyCount + scalarSellCount)
            const scalarBuyAmount = Math.abs(parsed.scalar_data?.acquisto_titoli_amount || 0)
            const scalarSellAmount = Math.abs(parsed.scalar_data?.vendita_titoli_amount || 0)

            const actualBuys = parsed.securityMovements.filter((m: any) => m.operationType === 'Acquisto')
            const actualSells = parsed.securityMovements.filter((m: any) => m.operationType === 'Vendita')
            const actualBuyCount = actualBuys.length
            const actualSellCount = actualSells.length
            const actualBuyAmount = actualBuys.reduce((s: number, m: any) => s + Math.abs(m.grossAmount || m.netAmount || 0), 0)
            const actualSellAmount = actualSells.reduce((s: number, m: any) => s + Math.abs(m.grossAmount || m.netAmount || 0), 0)

            const countMismatch = scalarTotalCount > 0 && Math.abs((actualBuyCount + actualSellCount) - scalarTotalCount) > 0
            const amountGapBuy = scalarBuyAmount > 0 ? Math.abs(actualBuyAmount - scalarBuyAmount) / scalarBuyAmount : 0
            const amountGapSell = scalarSellAmount > 0 ? Math.abs(actualSellAmount - scalarSellAmount) / scalarSellAmount : 0
            const hasAmountGap = amountGapBuy > 0.1 || amountGapSell > 0.1 // >10% gap

            if (countMismatch || hasAmountGap) {
                logProgress('⚠️ PHASE A-MOV: MISMATCH MOVIMENTI',
                    `PDF dice: ${scalarBuyCount} acquisti (€${scalarBuyAmount.toFixed(0)}) + ${scalarSellCount} vendite (€${scalarSellAmount.toFixed(0)}) = ${scalarTotalCount} tot | ` +
                    `Estratti: ${actualBuyCount} acquisti (€${actualBuyAmount.toFixed(0)}) + ${actualSellCount} vendite (€${actualSellAmount.toFixed(0)}) = ${actualBuyCount + actualSellCount} tot`
                )

                // Retry: ask Gemini to re-extract ALL movements with reinforced prompt
                // Skip if we've already used > 180s to avoid timeout
                const elapsedBeforeMov = (Date.now() - startTime) / 1000
                if (elapsedBeforeMov >= 180) {
                    logProgress('PHASE A-MOV SKIP', `Budget tempo esaurito (${elapsedBeforeMov.toFixed(0)}s), salto retry movimenti`)
                } else
                try {
                    const missingInfo = []
                    if (scalarBuyCount > actualBuyCount) missingInfo.push(`${scalarBuyCount - actualBuyCount} acquisti mancanti`)
                    if (scalarSellCount > actualSellCount) missingInfo.push(`${scalarSellCount - actualSellCount} vendite mancanti`)

                    const retryMovPrompt = `ATTENZIONE: L'estrazione iniziale dei movimenti titoli è INCOMPLETA.
Il PDF riporta ${scalarTotalCount} operazioni titoli (${scalarBuyCount} acquisti per €${scalarBuyAmount.toFixed(0)}, ${scalarSellCount} vendite per €${scalarSellAmount.toFixed(0)}).
Ma sono stati estratti solo ${actualBuyCount + actualSellCount} movimenti (${actualBuyCount} acquisti, ${actualSellCount} vendite).
${missingInfo.length > 0 ? `Mancano: ${missingInfo.join(', ')}.` : ''}

Riesamina TUTTE le pagine del PDF e estrai TUTTI i movimenti titoli (acquisti e vendite).
Cerca in: "Movimenti Titoli", "Operazioni", "Compravendite", "Negoziazioni", tabelle con colonne come Data/ISIN/Quantità/Importo.

Rispondi con JSON: { "securityMovements": [{ "isin": "...", "date": "DD/MM/YYYY", "name": "...", "operationType": "Acquisto|Vendita", "quantity": 0, "price": 0, "grossAmount": 0, "netAmount": 0, "fees": 0, "taxes": 0, "currency": "EUR", "exchangeRate": 1 }] }`

                    const retryMovText = await callGemini(
                        GEMINI_API_KEY!, modelName, retryMovPrompt, base64Data,
                        { thinkingLevel: 'medium' }
                    )
                    const retryMovJson = retryMovText.match(/\{[\s\S]*\}/)
                    if (retryMovJson) {
                        let retryMovParsed: any
                        try {
                            retryMovParsed = JSON.parse(retryMovJson[0])
                        } catch {
                            const repaired = repairTruncatedJson(retryMovJson[0])
                            if (repaired) retryMovParsed = JSON.parse(repaired)
                        }

                        if (retryMovParsed?.securityMovements?.length) {
                            const retryNormalized = normalizeSecurityMovementsArray(retryMovParsed.securityMovements)
                            const retryBuys = retryNormalized.filter((m: any) => m.operationType === 'Acquisto').length
                            const retrySells = retryNormalized.filter((m: any) => m.operationType === 'Vendita').length
                            const retryTotal = retryBuys + retrySells

                            // Use retry result if it's closer to scalar counts
                            const origDiff = Math.abs((actualBuyCount + actualSellCount) - scalarTotalCount)
                            const retryDiff = Math.abs(retryTotal - scalarTotalCount)

                            if (retryDiff < origDiff || retryNormalized.length > parsed.securityMovements.length) {
                                logProgress('✅ PHASE A-MOV RETRY OK',
                                    `Retry: ${retryBuys} acquisti + ${retrySells} vendite = ${retryTotal} tot (era ${actualBuyCount + actualSellCount}). Uso retry.`
                                )
                                parsed.securityMovements = retryNormalized
                            } else {
                                logProgress('PHASE A-MOV RETRY SKIP',
                                    `Retry non migliore: ${retryTotal} vs originale ${actualBuyCount + actualSellCount}. Mantengo originale.`
                                )
                            }
                        }
                    }
                } catch (retryMovErr: any) {
                    logProgress('PHASE A-MOV RETRY ERROR', retryMovErr.message)
                }
            } else if (scalarTotalCount > 0) {
                logProgress('✅ PHASE A-MOV OK',
                    `Movimenti verificati: ${actualBuyCount} acquisti + ${actualSellCount} vendite = ${actualBuyCount + actualSellCount} tot (PDF: ${scalarTotalCount})`
                )
            }
        }

        // === PHASE SELF-CHECK: Self-contained coherence (works WITHOUT previous period) ===
        // Validates that movements are internally consistent with holdings.
        // Check 1: calcInit = currentQty - buys + sells must be >= 0 (can't have negative initial qty)
        // Check 2: if calcInit < 0, try swapping Acquisto↔Vendita for that ISIN
        // Check 3: verify each movement qty * price ≈ grossAmount (catches Italian format errors)
        if (isDossier && parsed.securityMovements?.length > 0 && parsed.finalPortfolio?.length > 0) {
            const selfMovMap: Record<string, { b: number; s: number }> = {}
            ;(parsed.securityMovements || []).forEach((m: any) => {
                const isin = m.isin || ''
                if (!isin) return
                if (!selfMovMap[isin]) selfMovMap[isin] = { b: 0, s: 0 }
                if (m.operationType === 'Acquisto') selfMovMap[isin].b += (m.quantity || 0)
                else if (m.operationType === 'Vendita') selfMovMap[isin].s += (m.quantity || 0)
            })

            const selfHoldings: Record<string, number> = {}
            ;(parsed.finalPortfolio || []).forEach((h: any) => { if (h.isin) selfHoldings[h.isin] = h.quantity || 0 })

            // Check 1 & 2: Negative calcInit detection + operation type swap fix
            let swapCount = 0
            Object.keys(selfMovMap).forEach(isin => {
                const curr = selfHoldings[isin] || 0
                const mov = selfMovMap[isin]
                const calcInit = curr - mov.b + mov.s

                if (calcInit < -0.0001) {
                    // calcInit negativo → impossibile. Proviamo a invertire Acquisto↔Vendita per questo ISIN
                    const swappedCalcInit = curr - mov.s + mov.b
                    if (swappedCalcInit >= -0.0001) {
                        // Lo swap risolve! Invertiamo i tipi operazione per questo ISIN
                        parsed.securityMovements.forEach((m: any) => {
                            if (m.isin === isin) {
                                if (m.operationType === 'Acquisto') m.operationType = 'Vendita'
                                else if (m.operationType === 'Vendita') m.operationType = 'Acquisto'
                            }
                        })
                        swapCount++
                        logProgress('SELF-CHECK FIX',
                            `${isin}: calcInit era ${calcInit.toFixed(2)} (negativo!) → invertito Acquisto↔Vendita → calcInit=${swappedCalcInit.toFixed(2)}`
                        )
                    } else {
                        logProgress('SELF-CHECK WARN',
                            `${isin}: calcInit=${calcInit.toFixed(2)} (negativo!) — movimenti probabilmente sbagliati`
                        )
                    }
                }
            })
            if (swapCount > 0) {
                logProgress('✅ SELF-CHECK', `${swapCount} ISIN con tipo operazione invertito (Acquisto↔Vendita)`)
            }

            // Check 3: Movement qty * price ≈ grossAmount (catches Italian format errors in qty)
            let qtyFixCount = 0
            parsed.securityMovements.forEach((m: any) => {
                if (!m.quantity || !m.price || !m.grossAmount) return
                if (m.quantity <= 0 || m.price <= 0 || m.grossAmount <= 0) return
                const exchangeRate = m.exchangeRate && m.exchangeRate !== 0 ? m.exchangeRate : 1
                const expected = m.quantity * m.price * exchangeRate
                const ratio = Math.abs(expected - m.grossAmount) / m.grossAmount

                if (ratio > 0.5) {
                    // Il prodotto qty*price è lontano dal grossAmount → prova a correggere qty
                    for (const mult of [1000, 1000000]) {
                        const corrected = m.quantity * mult * m.price * exchangeRate
                        const corrRatio = Math.abs(corrected - m.grossAmount) / m.grossAmount
                        if (corrRatio < 0.15) {
                            logProgress('SELF-CHECK QTY FIX',
                                `${m.isin} ${m.operationType}: qty ${m.quantity} → ${m.quantity * mult} (×${mult}, grossAmount=${m.grossAmount.toFixed(0)})`
                            )
                            m.quantity = m.quantity * mult
                            qtyFixCount++
                            break
                        }
                    }
                    // Prova anche divisione (qty troppo grande)
                    if (ratio > 0.5) {
                        for (const div of [1000, 1000000]) {
                            const corrected = (m.quantity / div) * m.price * exchangeRate
                            const corrRatio = Math.abs(corrected - m.grossAmount) / m.grossAmount
                            if (corrRatio < 0.15) {
                                logProgress('SELF-CHECK QTY FIX',
                                    `${m.isin} ${m.operationType}: qty ${m.quantity} → ${m.quantity / div} (÷${div}, grossAmount=${m.grossAmount.toFixed(0)})`
                                )
                                m.quantity = m.quantity / div
                                qtyFixCount++
                                break
                            }
                        }
                    }
                }
            })
            if (qtyFixCount > 0) {
                logProgress('✅ SELF-CHECK', `${qtyFixCount} quantità movimenti corrette via cross-check con grossAmount`)
            }

            // Final self-check summary
            const finalSelfMovMap: Record<string, { b: number; s: number }> = {}
            ;(parsed.securityMovements || []).forEach((m: any) => {
                const isin = m.isin || ''
                if (!isin) return
                if (!finalSelfMovMap[isin]) finalSelfMovMap[isin] = { b: 0, s: 0 }
                if (m.operationType === 'Acquisto') finalSelfMovMap[isin].b += (m.quantity || 0)
                else if (m.operationType === 'Vendita') finalSelfMovMap[isin].s += (m.quantity || 0)
            })
            let negativeCount = 0
            Object.keys(finalSelfMovMap).forEach(isin => {
                const curr = selfHoldings[isin] || 0
                const mov = finalSelfMovMap[isin]
                const calcInit = curr - mov.b + mov.s
                if (calcInit < -0.0001) negativeCount++
            })
            if (negativeCount === 0 && (swapCount > 0 || qtyFixCount > 0)) {
                logProgress('✅ SELF-CHECK OK', `Coerenza auto-verificata: nessun calcInit negativo`)
            } else if (negativeCount > 0) {
                logProgress('⚠️ SELF-CHECK', `${negativeCount} ISIN con calcInit ancora negativo — movimenti potrebbero essere incompleti`)
            }
        }

        logProgress('✅ ANALISI COMPLETATA', fileName)
        console.log(`📋 Tipo: ${parsed.type} | 🏦 Banca: ${parsed.info?.bankName} | 💳 Conto: ${parsed.info?.accountNumber}`)

        // === LAYER 1: DOSSIER period_start computed from detected frequency + period_end ===
        // For DOSSIER: Gemini's period_start is unreliable. We determine frequency from multiple
        // signals (movement dates, Gemini frequency, period_start hint) and compute period_start ourselves.
        if (isDossier && parsed.info?.period_end) {
            const detectedFreq = determineDossierFrequency(parsed)
            if (detectedFreq) {
                const freqMonths: Record<string, number> = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 }
                const months = freqMonths[detectedFreq]
                if (months) {
                    const computedStart = computeStandardPeriodStart(parsed.info.period_end, months)
                    const geminiStart = parsed.info.period_start || '?'
                    const signal = (parsed.securityMovements?.length > 0) ? 'movimenti' :
                        (parsed.info.periodFrequency ? 'gemini+hint' : 'hint')
                    if (computedStart !== parsed.info.period_start) {
                        logProgress('📅 LAYER 1: PERIOD_START CALCOLATO',
                            `freq=${detectedFreq} (via ${signal}) → period_start: ${geminiStart} → ${computedStart}`
                        )
                    }
                    parsed.info.period_start = computedStart
                    parsed.info.periodFrequency = detectedFreq // store for reference
                }
            }
        }

        // === LAYER 3: Fallback for non-standard periods (LIQUIDITY or missing frequency) ===
        // If after Layer 1 the period is still non-standard, normalize to closest standard
        if (parsed.info?.period_start && parsed.info?.period_end) {
            const pEnd = new Date(parsed.info.period_end)
            const diffDays = Math.round((pEnd.getTime() - new Date(parsed.info.period_start).getTime()) / (1000 * 60 * 60 * 24))

            const isStandard = (
                (diffDays >= 25 && diffDays <= 36) ||   // monthly
                (diffDays >= 56 && diffDays <= 66) ||   // bimonthly
                (diffDays >= 85 && diffDays <= 100) ||  // quarterly
                (diffDays >= 175 && diffDays <= 195) || // semiannual
                (diffDays >= 355 && diffDays <= 375)    // annual
            )

            if (!isStandard && diffDays > 0 && isDossier) {
                const standards = [30, 91, 182, 365]
                const closest = standards.reduce((best, d) =>
                    Math.abs(d - diffDays) < Math.abs(best - diffDays) ? d : best
                )
                const monthsMap: Record<number, number> = { 30: 1, 91: 3, 182: 6, 365: 12 }
                const correctedStart = computeStandardPeriodStart(parsed.info.period_end, monthsMap[closest])

                logProgress('📅 LAYER 3: PERIODO NON STANDARD CORRETTO',
                    `${diffDays}d (${parsed.info.period_start} → ${parsed.info.period_end}) → ${correctedStart} (closest: ${closest}d)`
                )
                parsed.info.period_start = correctedStart
            }
        }

        // === TEXT MERGE: Override Gemini numbers with deterministic text parser ===
        const textCorrectedIsins = new Set<string>()
        if (isDossier && textParserResult && textParserResult.holdings.length > 0) {
            try {
                const { merged, corrections } = mergeTextAndGeminiHoldings(
                    textParserResult.holdings,
                    parsed.finalPortfolio || [],
                    logProgress
                )
                if (corrections > 0) {
                    logProgress('TEXT MERGE', `${corrections} correzioni applicate dal parser deterministico`)
                }
                parsed.finalPortfolio = merged
                // Track which ISINs were corrected by text to skip normalizeItalianQuantity later
                for (const th of textParserResult.holdings) {
                    if (th.verified) textCorrectedIsins.add(th.isin)
                }
            } catch (mergeErr: any) {
                logProgress('TEXT MERGE ERROR', mergeErr.message)
            }
        }

        // === PHASE A: Self-contained Portfolio Total Validation ===
        if (isDossier) {
            try {
                const phaseAResult = validatePortfolioTotals(parsed, textPortfolioTotal)

                logProgress('PHASE A',
                    `Somma titoli: ${phaseAResult.sumOfMarketValues.toFixed(2)}€ | ` +
                    `Totale PDF: ${phaseAResult.extractedTotal.toFixed(2)}€ | ` +
                    `Gap: ${phaseAResult.gap.toFixed(2)}€ (${phaseAResult.gapPercent.toFixed(1)}%)`
                )

                const elapsedBeforePhaseA = (Date.now() - startTime) / 1000
                if (phaseAResult.needsRetry && elapsedBeforePhaseA < 100) {
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
                                const retryValidation = validatePortfolioTotals(retryParsed, textPortfolioTotal)

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
                } else if (phaseAResult.needsRetry) {
                    logProgress('PHASE A SKIP TEMPO', `Budget tempo esaurito (${elapsedBeforePhaseA.toFixed(0)}s), salto retry portafoglio`)
                } else {
                    logProgress('PHASE A OK', 'Totali portafoglio corrispondono')
                }
            } catch (phaseAOuterErr: any) {
                logProgress('PHASE A SKIP', `Errore: ${phaseAOuterErr.message}`)
            }

            // === POST-PHASE-A TEXT MERGE ===
            // If Phase A retry replaced finalPortfolio, re-apply text merge to fix new Gemini errors
            if (textParserResult && textParserResult.holdings.length > 0) {
                try {
                    const { merged, corrections } = mergeTextAndGeminiHoldings(
                        textParserResult.holdings,
                        parsed.finalPortfolio || [],
                        logProgress
                    )
                    if (corrections > 0) {
                        logProgress('POST-PHASE-A TEXT MERGE', `${corrections} correzioni dopo Phase A retry`)
                        parsed.finalPortfolio = merged
                    }
                } catch (postMergeErr: any) {
                    logProgress('POST-PHASE-A MERGE ERROR', postMergeErr.message)
                }
            }

            // === FINAL PORTFOLIO TOTAL CHECK ===
            // Compare sum of holdings against text-extracted total — last chance to catch errors
            if (textPortfolioTotal > 0) {
                const finalSum = (parsed.finalPortfolio || []).reduce((s: number, h: any) => s + (h.marketValue || 0), 0)
                const finalGap = Math.abs(finalSum - textPortfolioTotal)
                const finalGapPct = textPortfolioTotal > 0 ? (finalGap / textPortfolioTotal) * 100 : 0
                if (finalGapPct > 5 && finalGap > 100) {
                    logProgress('⚠️ PORTFOLIO GAP', `Somma holdings (${finalSum.toFixed(0)}€) vs PDF totale (${textPortfolioTotal.toFixed(0)}€) = gap ${finalGapPct.toFixed(1)}%`)
                } else {
                    logProgress('✅ PORTFOLIO CHECK', `Somma ${finalSum.toFixed(0)}€ ≈ PDF ${textPortfolioTotal.toFixed(0)}€ (gap ${finalGapPct.toFixed(1)}%)`)
                }
            }
        }

        // Check for duplicate period BEFORE saving (unless force flag is set)
        const supabase = await createClient()
        let periodStart = parseDate(parsed.info?.period_start)
        const periodEnd = parseDate(parsed.info?.period_end)
        const accountNumber = parsed.info?.accountNumber

        // Auto-replace duplicate/overlapping period (soft-delete old, save new)
        let replacedAnalysisId: string | null = null
        if (!isReanalysis && userId && periodStart && periodEnd && accountNumber) {
            logProgress('CHECK DUPLICATI/OVERLAP', 'Verifico periodo già caricato o sovrapposto')

            // Fetch all docs for this account to check for ANY overlap (not just exact match)
            const { data: existingAnalyses } = await supabase
                .from('analyses')
                .select('id, period_start, period_end, benchmark_comparison')
                .eq('user_id', userId)
                .is('deleted_at', null)

            const normalizedNew = normalizeAccountNumber(accountNumber)
            const sameAccountDocs = (existingAnalyses || []).filter(a =>
                normalizeAccountNumber(a.benchmark_comparison || '') === normalizedNew
            )

            // === PRE-SAVE: Account-context period_start validation ===
            // If this account already has docs, use their frequency to validate/correct period_start.
            // This fixes Gemini errors where period_start is read from the wrong place in the PDF.
            // period_end is always reliable; period_start is recomputed if it doesn't match account frequency.
            if (sameAccountDocs.length >= 2) {
                const durations = sameAccountDocs.map(a =>
                    a.period_start && a.period_end
                        ? Math.round((new Date(a.period_end).getTime() - new Date(a.period_start).getTime()) / 86400000)
                        : 0
                ).filter(d => d > 0)

                const buckets: Record<string, number> = { monthly: 0, quarterly: 0, semiannual: 0, annual: 0 }
                for (const d of durations) {
                    if (d >= 25 && d <= 36) buckets.monthly++
                    else if (d >= 85 && d <= 100) buckets.quarterly++
                    else if (d >= 175 && d <= 195) buckets.semiannual++
                    else if (d >= 355 && d <= 375) buckets.annual++
                }

                const sortedBuckets = Object.entries(buckets).sort((a, b) => b[1] - a[1])
                const [majorityFreq, majorityCount] = sortedBuckets[0]

                if (majorityCount >= 2) {
                    const currentDays = Math.round(
                        (new Date(periodEnd).getTime() - new Date(periodStart).getTime()) / 86400000
                    )
                    if (!doesMatchFrequency(currentDays, majorityFreq)) {
                        const monthsMap: Record<string, number> = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 }
                        const correctedStart = computeStandardPeriodStart(periodEnd, monthsMap[majorityFreq])
                        logProgress('🔧 PRE-SAVE FIX',
                            `period_start corretto da ${periodStart} a ${correctedStart} (freq conto: ${majorityFreq}, era ${currentDays}d)`
                        )
                        parsed.info.period_start = correctedStart
                        periodStart = correctedStart
                    }
                }
            }

            // Check exact duplicate (uses potentially corrected periodStart)
            const exactDuplicate = sameAccountDocs.find(a =>
                a.period_start === periodStart && a.period_end === periodEnd
            )

            if (exactDuplicate) {
                logProgress('⚠️ DUPLICATO → SOSTITUZIONE', `Soft-delete ${exactDuplicate.id}, salvo nuova analisi`)
                replacedAnalysisId = exactDuplicate.id
                await supabase
                    .from('analyses')
                    .update({ deleted_at: new Date().toISOString() })
                    .eq('id', exactDuplicate.id)
            }
        }

        // === PHASE B: Cross-period Portfolio Validation ===
        const elapsedBeforeB = (Date.now() - startTime) / 1000
        if (isDossier && userId && periodStart && periodEnd && elapsedBeforeB < 120) {
            try {
                logProgress('PHASE B', 'Verifica cross-period con periodo precedente')

                const normalizedAcc = normalizeAccountNumber(accountNumber || '')

                const { data: prevAnalyses } = await supabase
                    .from('analyses')
                    .select('id, period_start, period_end, holdings, costs_breakdown, benchmark_comparison')
                    .eq('user_id', userId)
                    .eq('account_type', 'DOSSIER')
                    .lte('period_end', periodStart)
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

        // === SELF-VALIDATION: Verify movements using MOVIMENTI initial/final quantities ===
        // This catches missing movements WITHOUT needing the previous period
        const elapsedBeforeSV = (Date.now() - startTime) / 1000
        if (isDossier && parsed.movementsStartQuantities && Object.keys(parsed.movementsStartQuantities).length > 0 && parsed.securityMovements?.length > 0 && elapsedBeforeSV < 90) {
            try {
                const startQties = parsed.movementsStartQuantities as Record<string, number>
                const svCurrentH: Record<string, number> = {}
                ;(parsed.finalPortfolio || []).forEach((h: any) => { if (h.isin) svCurrentH[h.isin] = h.quantity || 0 })

                const svMovMap: Record<string, { b: number; s: number }> = {}
                ;(parsed.securityMovements || []).forEach((m: any) => {
                    const isin = m.isin || ''
                    if (!isin) return
                    if (!svMovMap[isin]) svMovMap[isin] = { b: 0, s: 0 }
                    if (m.operationType === 'Acquisto') svMovMap[isin].b += (m.quantity || 0)
                    else if (m.operationType === 'Vendita') svMovMap[isin].s += (m.quantity || 0)
                })

                const svMismatches: { isin: string; startQty: number; gap: number; actualFinal: number }[] = []
                for (const [isin, startQty] of Object.entries(startQties)) {
                    if (typeof startQty !== 'number' || startQty <= 0) continue
                    const mov = svMovMap[isin] || { b: 0, s: 0 }
                    const expectedFinal = startQty + mov.b - mov.s
                    const actualFinal = svCurrentH[isin] || 0
                    if (actualFinal <= 0) continue
                    const gap = Math.abs(expectedFinal - actualFinal)
                    if (gap > 0.001 && gap / actualFinal > 0.001) {
                        svMismatches.push({ isin, startQty, gap, actualFinal })
                        logProgress('MOV CHECK', `${isin}: iniziale=${startQty} + buys=${mov.b.toFixed(3)} - sells=${mov.s.toFixed(3)} = ${expectedFinal.toFixed(3)} ≠ finale=${actualFinal.toFixed(3)} (gap=${gap.toFixed(3)})`)
                    }
                }

                if (svMismatches.length > 0 && svMismatches.length <= 10) {
                    const searchList = svMismatches.map(m => {
                        const mov = svMovMap[m.isin] || { b: 0, s: 0 }
                        const name = (parsed.securityMovements || []).find((mv: any) => mv.isin === m.isin)?.name ||
                                     (parsed.finalPortfolio || []).find((h: any) => h.isin === m.isin)?.name || m.isin
                        const expectedFinal = m.startQty + mov.b - mov.s
                        const missingQty = m.actualFinal - expectedFinal
                        const missingType = missingQty > 0 ? 'Acquisto (carico)' : 'Vendita (scarico)'
                        const missingAbs = Math.abs(missingQty).toFixed(3)
                        return `- ${m.isin} (${name}): consistenza iniziale=${m.startQty}, consistenza finale=${m.actualFinal}. MANCA: ${missingType} di ~${missingAbs} quote. Cerca SOTT PAC, SOTTOSCR, ACQ.CONT.SU MERC., GIRO ALTRO DOSSIER, RIMBORSO o altro nella riga con questo valore nella colonna Carico/Scarico.`
                    }).join('\n')

                    logProgress('MOV RETRY', `Auto-validazione: ${svMismatches.length} strumenti con movimenti mancanti`)

                    const svPrompt = `Nella sezione MOVIMENTI del PDF, per alcuni strumenti mancano dei movimenti.

${searchList}

Estrai TUTTI i movimenti (carico E scarico) per questi ISIN dalla sezione MOVIMENTI. Per ogni ISIN, leggi TUTTE le righe tra la "Consistenza iniziale di periodo" e la "Consistenza finale di periodo".

REGOLE CRITICHE:
- Ogni riga con una data e un valore nella colonna "Carico" è un Acquisto
- Ogni riga con una data e un valore nella colonna "Scarico" è una Vendita
- Se il valore di un carico (es. 287,572) coincide con la consistenza finale, sono comunque DUE righe distinte: il carico è un movimento reale
- SICAV: SOTT PAC, SICAV: SOTTOSCR → Acquisto
- SICAV: RIMBORSO, FONDI: RIMBORSO → Vendita
- GIRO ALTRO DOSSIER → Acquisto
- I PAC mensili possono avere 3, 4, 5 righe per trimestre

Rispondi con JSON contenente TUTTI i movimenti trovati (filtreremo noi i duplicati):
{ "securityMovements": [{ "isin": "...", "date": "DD/MM/YYYY", "name": "...", "operationType": "Acquisto"|"Vendita", "quantity": 0, "price": 0, "grossAmount": 0, "netAmount": 0, "fees": 0, "taxes": 0, "currency": "EUR", "exchangeRate": 1 }] }`

                    // Use text-based retry when MOVIMENTI text is available (bypasses Gemini vision issues at page boundaries)
                    let svText: string
                    if (movimentiSectionText.length > 50) {
                        logProgress('MOV RETRY', 'Usando testo estratto (non PDF image)')
                        svText = await callGeminiWithText(GEMINI_API_KEY!, modelName, svPrompt,
                            `Ecco il testo estratto dalla sezione MOVIMENTI del documento:\n\n${movimentiSectionText}`,
                            { thinkingLevel: 'medium' })
                    } else {
                        svText = await callGemini(GEMINI_API_KEY!, modelName, svPrompt, base64Data, { thinkingLevel: 'medium' })
                    }
                    const svJson = svText.match(/\{[\s\S]*\}/)
                    if (svJson) {
                        let svParsed: any
                        try { svParsed = JSON.parse(svJson[0]) }
                        catch { const r = repairTruncatedJson(svJson[0]); if (r) svParsed = JSON.parse(r) }

                        if (svParsed?.securityMovements?.length) {
                            const svFoundMovs = normalizeSecurityMovementsArray(svParsed.securityMovements)
                            const svTargetIsins = new Set(svMismatches.map(m => m.isin))
                            let svAdded = 0

                            // Group found movements by ISIN (filter duplicates)
                            const svGrouped: Record<string, any[]> = {}
                            for (const mov of svFoundMovs) {
                                if (!mov.isin || !svTargetIsins.has(mov.isin)) continue
                                const isDup = parsed.securityMovements.some((ex: any) =>
                                    ex.isin === mov.isin && ex.operationType === mov.operationType &&
                                    Math.abs((ex.quantity || 0) - (mov.quantity || 0)) < 0.01
                                )
                                if (isDup) continue
                                if (!svGrouped[mov.isin]) svGrouped[mov.isin] = []
                                svGrouped[mov.isin].push(mov)
                            }

                            // Validate as a GROUP per ISIN (not individually)
                            // This handles cases like DB X TRACKERS where buy+sell together resolve the gap
                            for (const [isin, movs] of Object.entries(svGrouped)) {
                                const mm = svMismatches.find(m => m.isin === isin)!
                                const eMov = svMovMap[isin] || { b: 0, s: 0 }
                                let groupB = eMov.b, groupS = eMov.s
                                for (const mov of movs) {
                                    if (mov.operationType === 'Acquisto') groupB += (mov.quantity || 0)
                                    else if (mov.operationType === 'Vendita') groupS += (mov.quantity || 0)
                                }
                                const newGap = Math.abs((mm.startQty + groupB - groupS) - mm.actualFinal)
                                if (newGap >= mm.gap) {
                                    logProgress('MOV RETRY SKIP', `${isin}: gruppo di ${movs.length} movimenti non migliora (gap ${mm.gap.toFixed(3)}→${newGap.toFixed(3)})`)
                                    continue
                                }
                                for (const mov of movs) {
                                    parsed.securityMovements.push(mov)
                                    if (!svMovMap[mov.isin]) svMovMap[mov.isin] = { b: 0, s: 0 }
                                    if (mov.operationType === 'Acquisto') svMovMap[mov.isin].b += (mov.quantity || 0)
                                    else svMovMap[mov.isin].s += (mov.quantity || 0)
                                    svAdded++
                                    logProgress('MOV FOUND', `+ ${mov.operationType} ${mov.isin}: ${(mov.quantity || 0).toFixed(3)} quote`)
                                }
                            }
                            if (svAdded > 0) logProgress('✅ MOV FIXED', `${svAdded} movimenti mancanti trovati e aggiunti`)
                        }
                    }

                    // SECOND RETRY: ultra-targeted prompt for remaining mismatches
                    const svRemaining: typeof svMismatches = []
                    for (const mm of svMismatches) {
                        const mov = svMovMap[mm.isin] || { b: 0, s: 0 }
                        const ef = mm.startQty + mov.b - mov.s
                        if (Math.abs(ef - mm.actualFinal) > 0.001) svRemaining.push(mm)
                    }
                    if (svRemaining.length > 0 && (Date.now() - startTime) / 1000 < 160) {
                        logProgress('MOV RETRY2', `Secondo tentativo mirato per ${svRemaining.length} ISIN`)
                        const retry2List = svRemaining.map(m => {
                            const mov = svMovMap[m.isin] || { b: 0, s: 0 }
                            const ef = m.startQty + mov.b - mov.s
                            const missing = m.actualFinal - ef
                            const name = (parsed.finalPortfolio || []).find((h: any) => h.isin === m.isin)?.name || m.isin
                            return `${m.isin} (${name}): consistenza iniziale=${m.startQty.toFixed(3)}, consistenza finale=${m.actualFinal.toFixed(3)}. Manca un ${missing > 0 ? 'CARICO (Acquisto)' : 'SCARICO (Vendita)'} di ESATTAMENTE ${Math.abs(missing).toFixed(3)} quote. Cerca la riga con questo valore tra il primo e l'ultimo rigo di questo ISIN.`
                        }).join('\n')

                        const retry2Prompt = `COMPITO PRECISO: nella sezione MOVIMENTI del PDF, per ogni ISIN sotto c'è un movimento che non è stato letto. Trova la riga ESATTA.

${retry2List}

COME LEGGERE LA TABELLA MOVIMENTI:
- La prima riga per ogni ISIN (con data e valore nella colonna "Consistenza iniziale") è il saldo iniziale, NON un movimento
- L'ultima riga per ogni ISIN (con data e valore nella colonna "Consistenza finale") è il saldo finale, NON un movimento
- Tutte le righe INTERMEDIE con data e valore nella colonna "Carico" sono Acquisti
- Tutte le righe INTERMEDIE con data e valore nella colonna "Scarico" sono Vendite
- ATTENZIONE: un valore Carico può coincidere con la Consistenza finale (stessa quantità, righe diverse!)

Rispondi con JSON: { "securityMovements": [{ "isin": "...", "date": "DD/MM/YYYY", "name": "...", "operationType": "Acquisto"|"Vendita", "quantity": 0, "price": 0, "grossAmount": 0, "netAmount": 0, "fees": 0, "taxes": 0, "currency": "EUR", "exchangeRate": 1 }] }`

                        try {
                            // Use text-based retry when available
                            let sv2Text: string
                            if (movimentiSectionText.length > 50) {
                                sv2Text = await callGeminiWithText(GEMINI_API_KEY!, modelName, retry2Prompt,
                                    `Testo estratto dalla sezione MOVIMENTI:\n\n${movimentiSectionText}`,
                                    { thinkingLevel: 'medium' })
                            } else {
                                sv2Text = await callGemini(GEMINI_API_KEY!, modelName, retry2Prompt, base64Data, { thinkingLevel: 'medium' })
                            }
                            const sv2Json = sv2Text.match(/\{[\s\S]*\}/)
                            if (sv2Json) {
                                let sv2Parsed: any
                                try { sv2Parsed = JSON.parse(sv2Json[0]) }
                                catch { const r = repairTruncatedJson(sv2Json[0]); if (r) sv2Parsed = JSON.parse(r) }
                                if (sv2Parsed?.securityMovements?.length) {
                                    const sv2Movs = normalizeSecurityMovementsArray(sv2Parsed.securityMovements)
                                    const sv2Targets = new Set(svRemaining.map(m => m.isin))
                                    const sv2Grouped: Record<string, any[]> = {}
                                    for (const mov of sv2Movs) {
                                        if (!mov.isin || !sv2Targets.has(mov.isin)) continue
                                        const isDup = parsed.securityMovements.some((ex: any) =>
                                            ex.isin === mov.isin && ex.operationType === mov.operationType &&
                                            Math.abs((ex.quantity || 0) - (mov.quantity || 0)) < 0.01
                                        )
                                        if (isDup) continue
                                        if (!sv2Grouped[mov.isin]) sv2Grouped[mov.isin] = []
                                        sv2Grouped[mov.isin].push(mov)
                                    }
                                    for (const [isin, movs] of Object.entries(sv2Grouped)) {
                                        const mm = svRemaining.find(m => m.isin === isin)!
                                        const eMov = svMovMap[isin] || { b: 0, s: 0 }
                                        let gB = eMov.b, gS = eMov.s
                                        for (const mov of movs) {
                                            if (mov.operationType === 'Acquisto') gB += (mov.quantity || 0)
                                            else if (mov.operationType === 'Vendita') gS += (mov.quantity || 0)
                                        }
                                        const newGap = Math.abs((mm.startQty + gB - gS) - mm.actualFinal)
                                        if (newGap >= mm.gap) continue
                                        for (const mov of movs) {
                                            parsed.securityMovements.push(mov)
                                            if (!svMovMap[mov.isin]) svMovMap[mov.isin] = { b: 0, s: 0 }
                                            if (mov.operationType === 'Acquisto') svMovMap[mov.isin].b += (mov.quantity || 0)
                                            else svMovMap[mov.isin].s += (mov.quantity || 0)
                                            logProgress('MOV FOUND2', `+ ${mov.operationType} ${mov.isin}: ${(mov.quantity || 0).toFixed(3)} quote (2° tentativo)`)
                                        }
                                    }
                                }
                            }
                        } catch (sv2Err: any) {
                            logProgress('MOV RETRY2 ERROR', sv2Err.message)
                        }
                    }
                } else if (svMismatches.length === 0 && Object.keys(startQties).length > 0) {
                    logProgress('✅ MOV CHECK OK', `Movimenti auto-validati per ${Object.keys(startQties).length} strumenti`)
                }
            } catch (svErr: any) {
                logProgress('MOV CHECK ERROR', svErr.message)
            }
        }

        // === PORTFOLIO CROSS-CHECK: find ISINs in portfolio but completely missing from MOVIMENTI ===
        // This catches ISINs the model missed entirely (e.g. bottom of page) WITHOUT needing previous period
        const elapsedBeforeXC = (Date.now() - startTime) / 1000
        if (isDossier && parsed.movementsStartQuantities && Object.keys(parsed.movementsStartQuantities).length > 0
            && parsed.finalPortfolio?.length > 0 && elapsedBeforeXC < 100) {
            try {
                const startQties = parsed.movementsStartQuantities as Record<string, number>
                const movIsins = new Set([
                    ...Object.keys(startQties),
                    ...(parsed.securityMovements || []).map((m: any) => m.isin).filter(Boolean)
                ])
                const portfolioIsins = (parsed.finalPortfolio || []).map((h: any) => h.isin).filter(Boolean)
                const missingFromMov = portfolioIsins.filter((isin: string) => !movIsins.has(isin))

                if (missingFromMov.length > 0 && missingFromMov.length <= 10) {
                    const missingNames = missingFromMov.map((isin: string) => {
                        const h = parsed.finalPortfolio.find((x: any) => x.isin === isin)
                        return `- ${isin} (${h?.name || isin}): quantità nel portafoglio = ${(h?.quantity || 0).toFixed(3)}`
                    }).join('\n')

                    logProgress('XC CHECK', `${missingFromMov.length} ISIN nel portafoglio ma non nei MOVIMENTI estratti — verifico`)

                    const xcPrompt = `Nella sezione MOVIMENTI del PDF (tabella con colonne: Codice, Descrizione, Data, Consistenza iniziale, Carico, Scarico, Consistenza finale), verifica se questi ISIN appaiono:

${missingNames}

Per ogni ISIN che TROVI nella sezione MOVIMENTI, estrai TUTTI i movimenti (ogni riga con data e valore in Carico o Scarico) E la "Consistenza iniziale di periodo".

Se un ISIN NON appare nella sezione MOVIMENTI, non includerlo.

Rispondi con JSON: { "found": { "ISIN": { "startQty": 0, "movements": [{ "isin": "...", "date": "DD/MM/YYYY", "name": "...", "operationType": "Acquisto"|"Vendita", "quantity": 0, "price": 0, "grossAmount": 0, "netAmount": 0, "fees": 0, "taxes": 0, "currency": "EUR", "exchangeRate": 1 }] } } }`

                    // Use text-based retry when available
                    let xcText: string
                    if (movimentiSectionText.length > 50) {
                        xcText = await callGeminiWithText(GEMINI_API_KEY!, modelName, xcPrompt,
                            `Testo estratto dalla sezione MOVIMENTI:\n\n${movimentiSectionText}`,
                            { thinkingLevel: 'medium' })
                    } else {
                        xcText = await callGemini(GEMINI_API_KEY!, modelName, xcPrompt, base64Data, { thinkingLevel: 'medium' })
                    }
                    const xcJson = xcText.match(/\{[\s\S]*\}/)
                    if (xcJson) {
                        let xcParsed: any
                        try { xcParsed = JSON.parse(xcJson[0]) }
                        catch { const r = repairTruncatedJson(xcJson[0]); if (r) xcParsed = JSON.parse(r) }
                        if (xcParsed?.found) {
                            let xcAdded = 0
                            for (const [isin, data] of Object.entries(xcParsed.found) as [string, any][]) {
                                if (!data) continue
                                // Add to movementsStartQuantities
                                if (typeof data.startQty === 'number' && data.startQty > 0) {
                                    (parsed.movementsStartQuantities as any)[isin] = data.startQty
                                    logProgress('XC FOUND', `${isin}: consistenza iniziale = ${data.startQty}`)
                                }
                                // Add movements
                                if (data.movements?.length) {
                                    const xcMovs = normalizeSecurityMovementsArray(data.movements)
                                    for (const mov of xcMovs) {
                                        if (!mov.isin) mov.isin = isin
                                        const isDup = parsed.securityMovements.some((ex: any) =>
                                            ex.isin === mov.isin && ex.operationType === mov.operationType &&
                                            Math.abs((ex.quantity || 0) - (mov.quantity || 0)) < 0.01
                                        )
                                        if (isDup) continue
                                        parsed.securityMovements.push(mov)
                                        xcAdded++
                                        logProgress('XC MOV', `+ ${mov.operationType} ${mov.isin}: ${(mov.quantity || 0).toFixed(3)} quote`)
                                    }
                                }
                            }
                            if (xcAdded > 0) logProgress('✅ XC FIXED', `${xcAdded} movimenti recuperati da ISIN mancanti`)
                        }
                    }
                }
            } catch (xcErr: any) {
                logProgress('XC ERROR', xcErr.message)
            }
        }

        // Track ISINs whose quantity was corrected by Phase C — skip normalizeItalianQuantity for these
        const phaseCFixedIsins = new Set<string>()

        // === PHASE C: Movement Coherence Validation + Targeted Retry ===
        // For each ISIN: calcInit = currentQty - buys + sells. Compare against prevDoc's holdings.
        // If mismatch → ask Gemini to search for the specific missing movements in the PDF.
        // SKIP if we've already used > 240s to avoid 5min timeout
        const elapsedBeforeC = (Date.now() - startTime) / 1000
        if (isDossier && userId && periodStart && periodEnd && elapsedBeforeC < 160) {
            try {
                const normalizedAccC = normalizeAccountNumber(accountNumber || '')
                const { data: prevAnalysesC } = await supabase
                    .from('analyses')
                    .select('id, period_start, period_end, holdings, costs_breakdown, benchmark_comparison')
                    .eq('user_id', userId)
                    .eq('account_type', 'DOSSIER')
                    .lte('period_end', periodStart)
                    .is('deleted_at', null)
                    .order('period_end', { ascending: false })
                    .limit(20)

                const prevDocC = prevAnalysesC?.find(a =>
                    normalizeAccountNumber(a.benchmark_comparison || '') === normalizedAccC
                )
                if (!prevDocC) {
                    logProgress('PHASE C SKIP', 'Nessun periodo precedente per validare coerenza movimenti')
                }

                if (prevDocC?.holdings?.length) {
                    // Check if previous document is immediately adjacent (within ~1.5 quarters)
                    const prevEndDate = new Date(prevDocC.period_end)
                    const currStartDate = new Date(periodStart)
                    const daysBetweenPeriods = Math.round((currStartDate.getTime() - prevEndDate.getTime()) / 86400000)
                    const isPrevAdjacent = daysBetweenPeriods >= 0 && daysBetweenPeriods <= 45
                    if (!isPrevAdjacent) {
                        logProgress('PHASE C INFO', `Periodo precedente ${prevDocC.period_end} non adiacente (${daysBetweenPeriods}gg gap) — skip targeted retry`)
                    }

                    // Build previous holdings map
                    const prevH: Record<string, number> = {}
                    prevDocC.holdings.forEach((h: any) => { if (h.isin) prevH[h.isin] = h.quantity || 0 })

                    // Build movements map from current doc
                    const movMap: Record<string, { b: number; s: number }> = {}
                    ;(parsed.securityMovements || []).forEach((m: any) => {
                        const isin = m.isin || ''
                        if (!isin) return
                        if (!movMap[isin]) movMap[isin] = { b: 0, s: 0 }
                        const qty = m.quantity || 0
                        if (m.operationType === 'Acquisto') movMap[isin].b += qty
                        else if (m.operationType === 'Vendita') movMap[isin].s += qty
                    })

                    // Compute calcInit for each ISIN and find mismatches
                    const mismatches: { isin: string; prevQty: number; currQty: number; calcInit: number; buys: number; sells: number }[] = []
                    const currentH: Record<string, number> = {}
                    ;(parsed.finalPortfolio || []).forEach((h: any) => { if (h.isin) currentH[h.isin] = h.quantity || 0 })

                    const allIsins = new Set([...Object.keys(prevH), ...Object.keys(currentH)])
                    allIsins.forEach(isin => {
                        const curr = currentH[isin] || 0
                        const prev = prevH[isin] || 0
                        const mov = movMap[isin] || { b: 0, s: 0 }
                        const calcInit = curr - mov.b + mov.s

                        // Sanity check: if movements make coherence WORSE, discard them (likely hallucinated)
                        if ((mov.b > 0 || mov.s > 0) && Math.abs(calcInit - prev) > Math.abs(curr - prev) + 0.01) {
                            logProgress('PHASE C DISCARD', `${isin}: movimenti peggiorano coerenza (with=${calcInit.toFixed(0)} vs without=${curr.toFixed(0)} vs prev=${prev.toFixed(0)}), scartati`)
                            // Remove hallucinated movements from parsed data
                            parsed.securityMovements = (parsed.securityMovements || []).filter((m: any) => m.isin !== isin)
                            movMap[isin] = { b: 0, s: 0 }
                            if (Math.abs(curr - prev) >= 0.0001) {
                                mismatches.push({ isin, prevQty: prev, currQty: curr, calcInit: curr, buys: 0, sells: 0 })
                            }
                            return
                        }

                        if (Math.abs(calcInit - prev) >= 0.0001) {
                            mismatches.push({ isin, prevQty: prev, currQty: curr, calcInit, buys: mov.b, sells: mov.s })
                        }
                    })

                    // Filter out corporate actions (RAGGRUPPAMENTO, SPLIT, etc.) — same logic as dashboard
                    const CA_KW = ['RAGGR', 'DIRITTO', 'DIRITTI', 'FRAZION', 'CONCAMBIO', 'CONVERSIONE', 'SPLIT AZ']
                    const nameMapC: Record<string, string> = {}
                    prevDocC.holdings.forEach((h: any) => { if (h.isin) nameMapC[h.isin] = h.name || h.description || h.isin })
                    ;(parsed.finalPortfolio || []).forEach((h: any) => { if (h.isin) nameMapC[h.isin] = h.name || h.description || h.isin })
                    ;(parsed.securityMovements || []).forEach((m: any) => { if (m.isin && m.name) nameMapC[m.isin] = m.name })

                    // Only flag ISINs whose name directly contains a CA keyword (no "shared words" expansion)
                    const caFlagged = new Set<string>()
                    mismatches.forEach(m => {
                        const u = (nameMapC[m.isin] || '').toUpperCase()
                        if (CA_KW.some(kw => u.includes(kw)) || /^DIR\s+[A-Z]/i.test(nameMapC[m.isin] || '')) caFlagged.add(m.isin)
                    })
                    const realMismatches = mismatches.filter(m => !caFlagged.has(m.isin))
                    if (caFlagged.size > 0) {
                        logProgress('PHASE C CA', `${caFlagged.size} mismatch spiegati da corporate actions: ${Array.from(caFlagged).join(', ')}`)
                    }

                    // === STEP 1: Fix Italian number format errors in holdings quantities ===
                    // If corrected calcInit (with qty×factor) ≈ prevQty, it's a "35.000" → 35 error
                    // Works both with and without movements for the ISIN
                    // Helper: check if qty matches marketValue better (try multiple price interpretations)
                    const qtyMatchesMV = (qty: number, price: number, mv: number, exRate: number) => {
                        if (mv <= 0 || price <= 0) return Infinity
                        const rates = exRate !== 1 ? [exRate, 1 / exRate, 1] : [1]
                        let best = Infinity
                        for (const pd of [1, 100, 1000]) {
                            for (const r of rates) {
                                const err = Math.abs(qty * (price / pd) * r - mv) / mv
                                if (err < best) best = err
                            }
                        }
                        return best
                    }

                    const qtyFixedIsins: string[] = []
                    for (const m of realMismatches) {
                        if (m.prevQty <= 0 || m.currQty <= 0) continue
                        const holding = (parsed.finalPortfolio || []).find((h: any) => h.isin === m.isin)
                        if (!holding) continue
                        const mv = holding.marketValue || 0
                        const pr = holding.price || 0
                        const exR = (holding.exchangeRate && holding.exchangeRate !== 0) ? holding.exchangeRate : 1

                        for (const factor of [10, 100, 1000, 1000000]) {
                            // currQty too small? (35 should be 35000)
                            const fixedQty = m.currQty * factor
                            const fixedCalcInit = fixedQty - m.buys + m.sells
                            if (Math.abs(fixedCalcInit - m.prevQty) / m.prevQty < 0.02) {
                                // Cross-check: fixedQty should match marketValue better than original
                                if (mv > 0 && pr > 0) {
                                    const origErr = qtyMatchesMV(m.currQty, pr, mv, exR)
                                    const fixedErr = qtyMatchesMV(fixedQty, pr, mv, exR)
                                    if (origErr < fixedErr && origErr < 0.15) {
                                        logProgress('PHASE C SKIP MV', `${m.isin}: skip ×${factor}, currQty(${m.currQty}) matches MV(${mv.toFixed(0)}) better (err=${(origErr*100).toFixed(1)}% vs ${(fixedErr*100).toFixed(1)}%)`)
                                        break
                                    }
                                }
                                logProgress('PHASE C QTY FIX',
                                    `${m.isin}: qty ${m.currQty} → ${fixedQty} (×${factor}, calcInit=${fixedCalcInit.toFixed(0)}≈prevQty=${m.prevQty.toFixed(0)})`
                                )
                                holding.quantity = fixedQty
                                currentH[m.isin] = fixedQty
                                qtyFixedIsins.push(m.isin)
                                break
                            }
                            // currQty too large? (35000 should be 35) — raro ma possibile
                            const fixedQtyDown = m.currQty / factor
                            const fixedCalcInitDown = fixedQtyDown - m.buys + m.sells
                            if (Math.abs(fixedCalcInitDown - m.prevQty) / m.prevQty < 0.02) {
                                // Cross-check: fixedQtyDown should match marketValue better than original
                                if (mv > 0 && pr > 0) {
                                    const origErr = qtyMatchesMV(m.currQty, pr, mv, exR)
                                    const fixedErr = qtyMatchesMV(fixedQtyDown, pr, mv, exR)
                                    if (origErr < fixedErr && origErr < 0.15) {
                                        logProgress('PHASE C SKIP MV', `${m.isin}: skip ÷${factor}, currQty(${m.currQty}) matches MV(${mv.toFixed(0)}) better (err=${(origErr*100).toFixed(1)}% vs ${(fixedErr*100).toFixed(1)}%)`)
                                        break
                                    }
                                }
                                logProgress('PHASE C QTY FIX',
                                    `${m.isin}: qty ${m.currQty} → ${fixedQtyDown} (÷${factor}, calcInit=${fixedCalcInitDown.toFixed(0)}≈prevQty=${m.prevQty.toFixed(0)})`
                                )
                                holding.quantity = fixedQtyDown
                                currentH[m.isin] = fixedQtyDown
                                qtyFixedIsins.push(m.isin)
                                break
                            }
                        }
                    }
                    if (qtyFixedIsins.length > 0) {
                        qtyFixedIsins.forEach(isin => phaseCFixedIsins.add(isin))
                        logProgress('✅ PHASE C QTY', `${qtyFixedIsins.length} quantità holdings corrette: ${qtyFixedIsins.join(', ')}`)
                    }

                    // Remove fixed ISINs from mismatches
                    let remainingMismatches = realMismatches.filter(m => !qtyFixedIsins.includes(m.isin))

                    // === STEP 1.5: Fix Italian number format errors in movement quantities ===
                    // e.g., "35.000" parsed as both 35000 and 35 → two Vendita movements, sells=35035 instead of 35000
                    const movFixedIsins: string[] = []
                    for (const m of remainingMismatches) {
                        if (m.prevQty <= 0) continue
                        const movements = (parsed.securityMovements || []).filter((mv: any) => mv.isin === m.isin)
                        if (movements.length === 0) continue

                        let fixed = false
                        for (let i = 0; i < movements.length && !fixed; i++) {
                            const mv = movements[i]
                            const origQty = mv.quantity || 0
                            if (origQty <= 0) continue

                            for (const factor of [10, 100, 1000, 1000000]) {
                                // Try dividing (movement qty too large, e.g. 35000 should be 35)
                                for (const dir of ['down', 'up'] as const) {
                                    const newQty = dir === 'down' ? origQty / factor : origQty * factor
                                    if (newQty < 0.0001) continue
                                    let newBuys = 0, newSells = 0
                                    for (let j = 0; j < movements.length; j++) {
                                        const q = j === i ? newQty : (movements[j].quantity || 0)
                                        if (movements[j].operationType === 'Acquisto') newBuys += q
                                        else if (movements[j].operationType === 'Vendita') newSells += q
                                    }
                                    const newCalcInit = m.currQty - newBuys + newSells
                                    if (Math.abs(newCalcInit - m.prevQty) / m.prevQty < 0.005) {
                                        const op = dir === 'up' ? '×' : '÷'
                                        logProgress('PHASE C MOV FIX',
                                            `${m.isin}: mov ${mv.operationType} qty ${origQty} → ${newQty} (${op}${factor})`
                                        )
                                        mv.quantity = newQty
                                        movFixedIsins.push(m.isin)
                                        fixed = true
                                        break
                                    }
                                }
                                if (fixed) break
                            }
                        }
                    }
                    if (movFixedIsins.length > 0) {
                        logProgress('✅ PHASE C MOV', `${movFixedIsins.length} quantità movimenti corrette: ${movFixedIsins.join(', ')}`)
                        // Recalculate mismatches after movement fixes
                        const movMap2: Record<string, { b: number; s: number }> = {}
                        ;(parsed.securityMovements || []).forEach((mv: any) => {
                            const isin = mv.isin || ''
                            if (!isin) return
                            if (!movMap2[isin]) movMap2[isin] = { b: 0, s: 0 }
                            const qty = mv.quantity || 0
                            if (mv.operationType === 'Acquisto') movMap2[isin].b += qty
                            else if (mv.operationType === 'Vendita') movMap2[isin].s += qty
                        })
                        remainingMismatches = remainingMismatches.filter(m => {
                            if (!movFixedIsins.includes(m.isin)) return true
                            const mov = movMap2[m.isin] || { b: 0, s: 0 }
                            const newCalcInit = (currentH[m.isin] || 0) - mov.b + mov.s
                            return Math.abs(newCalcInit - m.prevQty) >= 0.0001
                        })
                    }

                    if (remainingMismatches.length === 0) {
                        logProgress('PHASE C OK', `Coerenza portafoglio verificata dopo fix quantità${caFlagged.size > 0 ? ` (${caFlagged.size} corporate actions)` : ''}`)
                    } else if (remainingMismatches.length > 25) {
                        logProgress('PHASE C SKIP', `${remainingMismatches.length} mismatch — troppi, probabile portafoglio diverso o primo caricamento`)
                    } else {
                        // === STEP 2: TARGETED RETRY for remaining mismatches ===
                        const elapsedBeforeCRetry = (Date.now() - startTime) / 1000
                        if (!isPrevAdjacent) {
                            // Previous period not adjacent (e.g. Q2 found instead of Q3 due to parallel upload)
                            // Don't retry — the gap is expected when intermediate period hasn't been processed yet
                            for (const m of remainingMismatches) {
                                const diff = m.calcInit - m.prevQty
                                logProgress('PHASE C MISMATCH',
                                    `${m.isin}: calcInit=${m.calcInit.toFixed(2)} ≠ prevQty=${m.prevQty.toFixed(2)} gap=${Math.abs(diff).toFixed(2)} (periodo non adiacente, ${daysBetweenPeriods}gg — skip retry)`
                                )
                            }
                        } else if (elapsedBeforeCRetry >= 280) {
                            for (const m of remainingMismatches) {
                                const diff = m.calcInit - m.prevQty
                                const opType = diff > 0 ? 'Acquisto' : 'Vendita'
                                logProgress('PHASE C MISMATCH',
                                    `${m.isin}: calcInit=${m.calcInit.toFixed(2)} ≠ prevQty=${m.prevQty.toFixed(2)} → manca ${opType} ${Math.abs(diff).toFixed(2)} (no time for retry)`
                                )
                            }
                        } else {
                            // Build a targeted prompt listing exactly what movements we expect
                            const searchList = remainingMismatches.map(m => {
                                const diff = m.calcInit - m.prevQty
                                const opType = diff > 0 ? 'Acquisto' : 'Vendita'
                                const missingQty = Math.abs(diff)
                                const name = nameMapC[m.isin] || m.isin
                                return `- ${m.isin} (${name}): cerco ${opType} di circa ${missingQty.toFixed(0)} quote (portafoglio precedente: ${m.prevQty.toFixed(0)}, attuale: ${m.currQty.toFixed(0)}, acquisti estratti: ${m.buys.toFixed(0)}, vendite estratte: ${m.sells.toFixed(0)})`
                            }).join('\n')

                            logProgress('PHASE C RETRY', `Cerco ${remainingMismatches.length} movimenti mancanti nel PDF...`)

                            try {
                                const phaseCPrompt = `Verifica se nel PDF ci sono movimenti titoli (acquisti/vendite) per i seguenti ISIN che potrebbero essere stati saltati nella prima estrazione.

Per ciascun ISIN, ti dico cosa mi aspetto di trovare basandomi sul confronto tra portafoglio precedente e attuale:
${searchList}

Cerca nelle sezioni "Movimenti Titoli", "Operazioni", "Compravendite", "Negoziazioni" o tabelle simili.
Se trovi un movimento per uno di questi ISIN, includilo. Se NON lo trovi nel PDF, NON inventarlo — rispondi con array vuoto.

IMPORTANTE: Restituisci SOLO i movimenti che TROVI EFFETTIVAMENTE nel PDF. Non inventare dati.

Rispondi con JSON: { "securityMovements": [{ "isin": "...", "date": "DD/MM/YYYY", "name": "...", "operationType": "Acquisto|Vendita", "quantity": 0, "price": 0, "grossAmount": 0, "netAmount": 0, "fees": 0, "taxes": 0, "currency": "EUR", "exchangeRate": 1 }] }`

                                // Use text-based retry when MOVIMENTI text is available
                                let phaseCText: string
                                if (movimentiSectionText.length > 50) {
                                    phaseCText = await callGeminiWithText(GEMINI_API_KEY!, modelName, phaseCPrompt,
                                        `Testo estratto dalla sezione MOVIMENTI:\n\n${movimentiSectionText}`,
                                        { thinkingLevel: 'medium' })
                                } else {
                                    phaseCText = await callGemini(
                                        GEMINI_API_KEY!, modelName, phaseCPrompt, base64Data,
                                        { thinkingLevel: 'medium' })
                                }
                                const phaseCJson = phaseCText.match(/\{[\s\S]*\}/)
                                if (phaseCJson) {
                                    let phaseCParsed: any
                                    try {
                                        phaseCParsed = JSON.parse(phaseCJson[0])
                                    } catch {
                                        const repaired = repairTruncatedJson(phaseCJson[0])
                                        if (repaired) phaseCParsed = JSON.parse(repaired)
                                    }

                                    if (phaseCParsed?.securityMovements?.length) {
                                        const foundMovs = normalizeSecurityMovementsArray(phaseCParsed.securityMovements)
                                        // Only accept movements for the ISINs we asked about
                                        const targetIsins = new Set(remainingMismatches.map(m => m.isin))
                                        const validMovs = foundMovs.filter((m: any) => m.isin && targetIsins.has(m.isin))

                                        if (validMovs.length > 0) {
                                            // Group by ISIN, filter duplicates
                                            const pcGrouped: Record<string, any[]> = {}
                                            for (const mov of validMovs) {
                                                const isDup = parsed.securityMovements.some((existing: any) =>
                                                    existing.isin === mov.isin &&
                                                    existing.operationType === mov.operationType &&
                                                    Math.abs((existing.quantity || 0) - (mov.quantity || 0)) < 0.01
                                                )
                                                if (isDup) continue
                                                if (!pcGrouped[mov.isin]) pcGrouped[mov.isin] = []
                                                pcGrouped[mov.isin].push(mov)
                                            }

                                            // Validate as GROUP per ISIN (buy+sell together may resolve gap)
                                            let added = 0
                                            for (const [isin, movs] of Object.entries(pcGrouped)) {
                                                const curr = currentH[isin] || 0
                                                const prev = prevH[isin] || 0
                                                if (prev > 0) {
                                                    let eBuys = 0, eSells = 0
                                                    parsed.securityMovements.filter((m: any) => m.isin === isin).forEach((m: any) => {
                                                        if (m.operationType === 'Acquisto') eBuys += (m.quantity || 0)
                                                        else if (m.operationType === 'Vendita') eSells += (m.quantity || 0)
                                                    })
                                                    const curDist = Math.abs((curr - eBuys + eSells) - prev)
                                                    let nB = eBuys, nS = eSells
                                                    for (const mov of movs) {
                                                        if (mov.operationType === 'Acquisto') nB += (mov.quantity || 0)
                                                        else if (mov.operationType === 'Vendita') nS += (mov.quantity || 0)
                                                    }
                                                    const newDist = Math.abs((curr - nB + nS) - prev)
                                                    if (newDist >= curDist) {
                                                        logProgress('PHASE C RETRY SKIP', `${isin}: gruppo di ${movs.length} movimenti non migliora coerenza (${curDist.toFixed(2)}→${newDist.toFixed(2)})`)
                                                        continue
                                                    }
                                                }
                                                for (const mov of movs) {
                                                    parsed.securityMovements.push(mov)
                                                    added++
                                                    logProgress('PHASE C FOUND',
                                                        `+ ${mov.operationType} ${mov.isin}: ${(mov.quantity || 0).toFixed(2)} quote @ ${(mov.price || 0).toFixed(4)}`
                                                    )
                                                }
                                            }
                                            if (added > 0) {
                                                logProgress('✅ PHASE C FIXED', `${added} movimenti trovati nel PDF e aggiunti`)
                                            }
                                        } else {
                                            logProgress('PHASE C RETRY EMPTY', `Gemini non ha trovato movimenti aggiuntivi nel PDF`)
                                        }
                                    } else {
                                        logProgress('PHASE C RETRY EMPTY', `Nessun movimento aggiuntivo trovato nel PDF`)
                                    }
                                }

                                // Log remaining mismatches after retry
                                const movMapAfter: Record<string, { b: number; s: number }> = {}
                                ;(parsed.securityMovements || []).forEach((m: any) => {
                                    const isin = m.isin || ''
                                    if (!isin) return
                                    if (!movMapAfter[isin]) movMapAfter[isin] = { b: 0, s: 0 }
                                    if (m.operationType === 'Acquisto') movMapAfter[isin].b += (m.quantity || 0)
                                    else if (m.operationType === 'Vendita') movMapAfter[isin].s += (m.quantity || 0)
                                })
                                let stillMismatch = 0
                                for (const m of remainingMismatches) {
                                    const curr = currentH[m.isin] || 0
                                    const mov = movMapAfter[m.isin] || { b: 0, s: 0 }
                                    const newCalcInit = curr - mov.b + mov.s
                                    if (Math.abs(newCalcInit - m.prevQty) >= 0.0001) {
                                        stillMismatch++
                                        const diff = newCalcInit - m.prevQty
                                        const opType = diff > 0 ? 'Acquisto' : 'Vendita'
                                        logProgress('PHASE C STILL MISMATCH',
                                            `${m.isin}: calcInit=${newCalcInit.toFixed(2)} ≠ prevQty=${m.prevQty.toFixed(2)} → manca ${opType} ${Math.abs(diff).toFixed(2)}`
                                        )
                                    }
                                }
                                if (stillMismatch === 0) {
                                    logProgress('✅ PHASE C ALL OK', `Tutti i mismatch risolti dopo retry`)
                                }
                            } catch (phaseCRetryErr: any) {
                                logProgress('PHASE C RETRY ERROR', phaseCRetryErr.message)
                                // Log mismatches even if retry failed
                                for (const m of remainingMismatches) {
                                    const diff = m.calcInit - m.prevQty
                                    const opType = diff > 0 ? 'Acquisto' : 'Vendita'
                                    logProgress('PHASE C MISMATCH',
                                        `${m.isin}: calcInit=${m.calcInit.toFixed(2)} ≠ prevQty=${m.prevQty.toFixed(2)} → manca ${opType} ${Math.abs(diff).toFixed(2)}`
                                    )
                                }
                            }
                        }

                    }
                } else {
                    logProgress('PHASE C SKIP', 'Nessun periodo precedente per validare coerenza movimenti')
                }
            } catch (phaseCOuterErr: any) {
                logProgress('PHASE C SKIP', `Errore: ${phaseCOuterErr.message}`)
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

            if (textCorrectedIsins.has(h.isin)) {
                // Text parser already verified qty × price × rate ≈ marketValue (< 3% error).
                // Do NOT touch price or quantity — the text parser found the correct values,
                // including the correct interpretation of bond prices and exchange rates.
                // Applying normalizeBondPrice here would break the math for bonds priced
                // per-unit (e.g., structured notes like XS ISINs at 854.93 USD/unit ≠ centesimi).
            } else if (phaseCFixedIsins.has(h.isin)) {
                // Phase C corrected this quantity — skip normalizeItalianQuantity but normalize bond price
                if (isBondQuotedInCentesimi(h.name, h.isin) && price > 1) {
                    price = normalizeBondPrice(price)
                }
            } else if (isBondQuotedInCentesimi(h.name, h.isin)) {
                const result = normalizeBondValues(quantity, price, marketValue, exchangeRate)
                quantity = result.quantity
                price = result.price
            } else {
                // Non-bond: only fix Italian number format in quantity (skip Phase C-corrected ISINs)
                quantity = normalizeItalianQuantity(quantity, price, marketValue, exchangeRate)
            }

            // Final safety net: if qty × price × fx doesn't match marketValue (>15% error),
            // recalculate quantity from marketValue / (price × fx).
            // This catches Gemini OCR errors on scanned PDFs (e.g. Intesa) where columns get mixed up.
            // SKIP for text-verified holdings — the text parser already validated the math.
            if (!textCorrectedIsins.has(h.isin) && quantity > 0 && price > 0 && marketValue > 0) {
                const fx = exchangeRate || 1
                const computed = quantity * price * fx
                const relError = Math.abs(computed - marketValue) / marketValue
                if (relError > 0.15) {
                    const correctedQty = marketValue / (price * fx)
                    logProgress('FIX QTY', `${h.isin}: qty×price=${computed.toFixed(2)} vs mv=${marketValue.toFixed(2)} (${(relError * 100).toFixed(0)}% off) → qty=${correctedQty.toFixed(4)}`)
                    quantity = correctedQty
                }
            }

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

            if (isBondQuotedInCentesimi(m.name, m.isin) && price > 1) {
                // Smart bond normalization: handles both Italian qty format AND centesimi price
                const grossRef = m.grossAmount || 0
                if (grossRef > 0) {
                    const result = normalizeBondValues(quantity, price, grossRef, exchangeRate)
                    quantity = result.quantity
                    price = result.price
                } else {
                    // No grossAmount reference — standard centesimi normalization
                    price = normalizeBondPrice(price)
                }
            } else {
                // Non-bond: fix Italian number format misinterpretation
                // Method 1: Cross-validate with grossAmount
                if (quantity > 0 && price > 0 && m.grossAmount > 0) {
                    quantity = normalizeItalianQuantity(quantity, price, m.grossAmount, exchangeRate)
                }
            }
            // Method 2: Cross-validate with holdings for same ISIN (works for all types)
            if (quantity > 0 && m.isin && holdingsQtyMap[m.isin]) {
                const holdingQty = holdingsQtyMap[m.isin]
                if (holdingQty > 0) {
                    const ratio = quantity / holdingQty
                    // Case A: movement qty is ~1000x too small (e.g. 141.918 vs holding 141918)
                    if (ratio > 0 && ratio <= 0.1 && holdingQty / quantity >= 900 && holdingQty / quantity <= 1100) {
                        quantity = quantity * 1000
                    }
                    // Case B: movement qty is ~1000x too large (Italian comma "141,918" → 141918 instead of 141.918)
                    if (ratio >= 900 && ratio <= 1100) {
                        quantity = quantity / 1000
                    }
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

        // Post-processing: validate operation types by cross-checking movements against holdings
        // If flipping Vendita↔Acquisto makes the coherence (calcInit) closer to startQty, flip it
        if (isDossier && normalizedSecurityMovements.length > 0) {
            const startQties = (parsed.movementsStartQuantities || {}) as Record<string, number>
            // Group movements by ISIN
            const movByIsin: Record<string, any[]> = {}
            for (const m of normalizedSecurityMovements) {
                if (!m.isin) continue
                if (!movByIsin[m.isin]) movByIsin[m.isin] = []
                movByIsin[m.isin].push(m)
            }
            for (const [isin, movs] of Object.entries(movByIsin)) {
                const hQty = holdingsQtyMap[isin] || 0
                if (hQty <= 0) continue
                // Skip ISINs without reference data — flipping toward 0 is harmful
                if (!(isin in startQties)) continue
                const expectedStart = startQties[isin] ?? 0
                // Compute current calcInit
                let buys = 0, sells = 0
                for (const m of movs) {
                    if (m.operationType === 'Acquisto') buys += m.quantity || 0
                    else if (m.operationType === 'Vendita') sells += m.quantity || 0
                }
                let calcInit = hQty - buys + sells
                let currentGap = Math.abs(calcInit - expectedStart)
                if (currentGap < 0.01) continue // Already coherent
                // Multi-pass: repeat until no more improvements (greedy single-pass can miss optimal)
                let flipImproved = true
                while (flipImproved) {
                    flipImproved = false
                    for (const m of movs) {
                        const q = m.quantity || 0
                        const flipped = m.operationType === 'Acquisto' ? 'Vendita' : 'Acquisto'
                        // Compute new buys/sells if we flip this movement
                        let newBuys = buys, newSells = sells
                        if (m.operationType === 'Acquisto') { newBuys -= q; newSells += q }
                        else { newSells -= q; newBuys += q }
                        const newCalcInit = hQty - newBuys + newSells
                        const newGap = Math.abs(newCalcInit - expectedStart)
                        if (newGap < currentGap - 0.001) {
                            logProgress('OP FIX', `${isin}: ${m.operationType}→${flipped} (qty=${q.toFixed(3)}, gap ${currentGap.toFixed(3)}→${newGap.toFixed(3)})`)
                            m.operationType = flipped
                            buys = newBuys
                            sells = newSells
                            currentGap = newGap
                            flipImproved = true
                        }
                    }
                }
            }
        }

        // Final override: operationType based on movement description keywords (takes priority over op-flip)
        // These are deterministic: RIMBORSO is always a sell, SOTT PAC/SOTTOSCR always a buy
        for (const m of normalizedSecurityMovements) {
            const nameUpper = ((m.name || '') + ' ' + (m.description || '')).toUpperCase()
            const oldOp = m.operationType
            if (nameUpper.includes('RIMBORSO')) {
                m.operationType = 'Vendita'
            } else if (nameUpper.includes('SOTT PAC') || nameUpper.includes('SOTTOSCR') || nameUpper.includes('ACQ.CONT')) {
                m.operationType = 'Acquisto'
            }
            if (m.operationType !== oldOp) {
                logProgress('OP NAME FIX', `${m.isin}: ${oldOp}→${m.operationType} (keyword in "${m.name}")`)
            }
        }

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
                hasMovementsSection,
                incompleteMovements,
                original_ai_data: { ...(parsed.summary || {}) } // Backup for restore
            },
            benchmark_comparison: parsed.info?.accountNumber || 'N/D',
        }

        // === DRY RUN: Return normalized data without saving to DB ===
        if (dryRun) {
            logProgress('🧪 DRY RUN', 'Restituzione dati normalizzati (nessun salvataggio DB)')
            // Build coherence check for holdings
            const coherenceErrors: any[] = []
            for (const h of normalizedHoldings) {
                if (!h.isin) continue
                const buys = normalizedSecurityMovements
                    .filter((m: any) => m.isin === h.isin && m.operationType === 'Acquisto')
                    .reduce((s: number, m: any) => s + (m.quantity || 0), 0)
                const sells = normalizedSecurityMovements
                    .filter((m: any) => m.isin === h.isin && m.operationType === 'Vendita')
                    .reduce((s: number, m: any) => s + (m.quantity || 0), 0)
                const calcInit = (h.quantity || 0) - buys + sells
                if (calcInit < -0.01) {
                    coherenceErrors.push({
                        isin: h.isin,
                        name: h.name,
                        qty: h.quantity,
                        buys, sells, calcInit,
                        issue: 'calcInit negativo (impossibile)'
                    })
                }
            }
            return NextResponse.json({
                success: true,
                dryRun: true,
                type: parsed.type,
                bank: parsed.info?.bankName,
                period: `${parsed.info?.period_start} → ${parsed.info?.period_end}`,
                account: parsed.info?.accountNumber,
                holdingsCount: normalizedHoldings.length,
                movementsCount: normalizedSecurityMovements.length,
                portfolioTotal: normalizedHoldings.reduce((s: number, h: any) => s + (h.marketValue || 0), 0),
                coherenceErrors,
                holdings: normalizedHoldings.map((h: any) => ({
                    isin: h.isin, name: h.name, qty: h.quantity, price: h.price,
                    mktVal: h.marketValue, qtyXprice: (h.quantity || 0) * (h.price || 0) * (h.exchangeRate || 1)
                })),
                movements: normalizedSecurityMovements.map((m: any) => ({
                    isin: m.isin, name: m.name, op: m.operationType, qty: m.quantity,
                    price: m.price, gross: m.grossAmount, date: m.date
                }))
            })
        }

        // === FINAL GUARD: reject DOSSIER with clearly wrong data ===
        // Allow genuinely empty dossiers (e.g. "consistenza finale uguale a zero", "dossier estinto")
        // Check both original pdf-parse text and current pdfExtractedText (which may be OCR-updated)
        const guardText = (originalPdfText + ' ' + pdfExtractedText).toUpperCase()
        const hasMovementsButNoHoldings = guardText.includes('MOVIMENTI DI PERIODO') && guardText.includes('SALDO FINALE')
        const isConfirmedEmptyDossier = guardText.includes('UGUALE A ZERO')
            || guardText.includes('CONSISTENZA ZERO')
            || guardText.includes('NESSUN TITOLO')
            || guardText.includes('DOSSIER ESTINTO')
            || (textPortfolioTotal === 0 && textParserResult?.sectionFound && textParserResult.holdings.length === 0)
            || hasMovementsButNoHoldings
        if (isDossier && analysisFields.portfolio_value === 0 && normalizedHoldings.length === 0 && !isConfirmedEmptyDossier) {
            logProgress('❌ ESTRAZIONE FALLITA', 'DOSSIER senza holdings estratti — rifiutato')
            return NextResponse.json({
                success: false,
                error: 'Estrazione portafoglio fallita: nessun titolo estratto dal PDF. Riprova o verifica il documento.'
            }, { status: 500 })
        }
        if (isDossier && analysisFields.portfolio_value === 0 && normalizedHoldings.length === 0 && isConfirmedEmptyDossier) {
            logProgress('✅ DOSSIER VUOTO', 'Consistenza confermata a zero dal documento — accettato')
        }
        if (isDossier && analysisFields.portfolio_value === 0 && normalizedHoldings.length > 0 && !isConfirmedEmptyDossier) {
            // For scanned PDFs (very short original text), Gemini OCR sometimes finds holdings
            // but can't read their market values. In this case, accept as empty dossier rather
            // than hard-failing, since the alternative is complete data loss for this period.
            if (originalPdfText.length < 2000) {
                logProgress('⚠️ OCR PARZIALE', `DOSSIER con ${normalizedHoldings.length} holdings ma tutti a 0€ — testo originale troppo corto (${originalPdfText.length} car), accettato come dossier con dati parziali`)
                // Keep the holdings (they have ISINs) but mark portfolio_value as sum of what we have
                const holdingsSum = normalizedHoldings.reduce((s: number, h: any) => s + (h.marketValue || 0), 0)
                analysisFields.portfolio_value = holdingsSum
            } else {
                logProgress('❌ ESTRAZIONE FALLITA', `DOSSIER con ${normalizedHoldings.length} holdings ma controvalore totale = 0 — rifiutato`)
                return NextResponse.json({
                    success: false,
                    error: `Estrazione portafoglio incompleta: ${normalizedHoldings.length} titoli trovati ma tutti con controvalore 0€. Riprova.`
                }, { status: 500 })
            }
        }
        if (isDossier && analysisFields.portfolio_value === 0 && normalizedHoldings.length > 0 && isConfirmedEmptyDossier) {
            logProgress('✅ DOSSIER VUOTO', `Rimossi ${normalizedHoldings.length} holdings residui (da movimenti) — consistenza zero confermata`)
            normalizedHoldings.splice(0)
        }
        // Guard: if we have a text-extracted total AND the portfolio value is way off, reject
        if (isDossier && textPortfolioTotal > 100 && analysisFields.portfolio_value > 0) {
            const guardRatio = analysisFields.portfolio_value / textPortfolioTotal
            if (guardRatio < 0.3 || guardRatio > 3.0) {
                logProgress('❌ PORTFOLIO MISMATCH', `Portfolio ${analysisFields.portfolio_value.toFixed(0)}€ vs PDF totale ${textPortfolioTotal.toFixed(0)}€ (ratio ${guardRatio.toFixed(2)})`)
                return NextResponse.json({
                    success: false,
                    error: `Estrazione incoerente: controvalore estratto (${Math.round(analysisFields.portfolio_value)}€) troppo diverso dal totale PDF (${Math.round(textPortfolioTotal)}€). Riprova.`
                }, { status: 500 })
            }
        }

        // === QUALITY SCORE ===
        // Compute extraction quality (0-100) for transparency
        let qualityScore = 100
        const qualityIssues: string[] = []
        if (isDossier) {
            // Check portfolio total gap
            const refTotal = textPortfolioTotal || (parsed.summary?.portfolio_total_extracted || 0)
            if (refTotal > 0) {
                const gap = Math.abs(analysisFields.portfolio_value - refTotal) / refTotal
                if (gap > 0.05) { qualityScore -= 15; qualityIssues.push(`Totale portafoglio gap ${(gap * 100).toFixed(1)}%`) }
                else if (gap > 0.01) { qualityScore -= 5; qualityIssues.push(`Totale portafoglio gap ${(gap * 100).toFixed(1)}%`) }
            }
            // Check for holdings with zero qty or price
            const zeroQtyCount = normalizedHoldings.filter((h: any) => !h.quantity || h.quantity === 0).length
            if (zeroQtyCount > 0) { qualityScore -= zeroQtyCount * 3; qualityIssues.push(`${zeroQtyCount} titoli senza quantità`) }
            // Check math consistency per holding
            let mathErrors = 0
            for (const h of normalizedHoldings) {
                if (h.quantity > 0 && h.price > 0 && h.marketValue > 0) {
                    const expected = h.quantity * h.price * (h.exchangeRate || 1)
                    const err = Math.abs(expected - h.marketValue) / h.marketValue
                    if (err > 0.15) mathErrors++
                }
            }
            if (mathErrors > 0) { qualityScore -= mathErrors * 5; qualityIssues.push(`${mathErrors} titoli con qty×price≠controvalore`) }
            // Check text ISINs vs extracted ISINs
            if (textParserResult && textParserResult.holdings.length > 0) {
                const holdingIsins = new Set(normalizedHoldings.map((h: any) => h.isin).filter(Boolean))
                const missingFromExtraction = textParserResult.holdings
                    .filter(th => th.verified && !holdingIsins.has(th.isin))
                if (missingFromExtraction.length > 0) {
                    qualityScore -= missingFromExtraction.length * 10
                    qualityIssues.push(`${missingFromExtraction.length} ISIN nel testo ma non estratti`)
                }
            }
        }
        qualityScore = Math.max(0, Math.min(100, qualityScore))
        if (qualityIssues.length > 0) {
            logProgress('QUALITY', `Score: ${qualityScore}/100 | Issues: ${qualityIssues.join('; ')}`)
        } else {
            logProgress('QUALITY', `Score: ${qualityScore}/100`)
        }
        // Store quality score in costs_breakdown for dashboard access
        analysisFields.costs_breakdown = {
            ...analysisFields.costs_breakdown,
            qualityScore,
            qualityIssues: qualityIssues.length > 0 ? qualityIssues : undefined,
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

        // Retry once on transient fetch errors (e.g. timeout after long processing)
        if (error && (error.message?.includes('fetch failed') || error.message?.includes('ETIMEDOUT'))) {
            logProgress('⚠️ DB fetch failed, retrying...', error.message)
            await new Promise(r => setTimeout(r, 2000))
            if (isReanalysis && reanalyzeId) {
                const retry = await supabase.from('analyses').update(analysisFields).eq('id', reanalyzeId).select().single()
                data = retry.data; error = retry.error
            } else {
                const retry = await supabase.from('analyses').insert({ ...analysisFields, document_id: crypto.randomUUID(), user_id: userId || null }).select().single()
                data = retry.data; error = retry.error
            }
        }

        if (error) {
            logProgress('❌ ERRORE DATABASE', `${error.message} (code: ${error.code}, details: ${error.details})`)
            return NextResponse.json({ success: false, error: `Errore salvataggio database: ${error.message}` }, { status: 500 })
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
// Determine DOSSIER frequency from multiple signals (most reliable first)
function determineDossierFrequency(parsed: any): string | null {
    // Use parsed.securityMovements (parse-time array), NOT parsed.costs_breakdown.securityMovements (DB format)
    const movements = parsed.securityMovements || parsed.costs_breakdown?.securityMovements || []
    const periodEnd = parsed.info?.period_end
    const periodStartHint = parsed.info?.period_start
    const geminiFreq = parsed.info?.periodFrequency

    // --- Signal 1: Movement date range (MOST RELIABLE) ---
    // Security movements have dates that tell us the actual reporting period
    if (movements.length >= 1 && periodEnd) {
        const endDate = new Date(periodEnd)
        const movDates: number[] = []
        for (const m of movements) {
            if (!m.date) continue
            // Parse DD/MM/YYYY or YYYY-MM-DD
            let d: Date | null = null
            const parts = String(m.date).split('/')
            if (parts.length === 3 && parts[2].length === 4) {
                d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`)
            } else if (String(m.date).includes('-')) {
                d = new Date(m.date)
            }
            if (d && !isNaN(d.getTime())) {
                // Only consider movements within a reasonable range (< 400 days before period_end)
                const daysBefore = (endDate.getTime() - d.getTime()) / 86400000
                if (daysBefore >= 0 && daysBefore < 400) movDates.push(d.getTime())
            }
        }

        if (movDates.length > 0) {
            const earliestMov = Math.min(...movDates)
            const movRangeDays = Math.round((endDate.getTime() - earliestMov) / 86400000)

            if (movRangeDays <= 36) return 'monthly'
            if (movRangeDays <= 100) return 'quarterly'
            if (movRangeDays <= 195) return 'semiannual'
            if (movRangeDays <= 375) return 'annual'
        }
    }

    // --- Signal 2: Gemini's periodFrequency label (simple classification — more reliable than exact dates) ---
    // period_start extraction is unreliable (reads wrong dates from PDF). But frequency CLASSIFICATION
    // is a simpler question — Gemini answers "quarterly" much more reliably than it computes exact dates.
    if (geminiFreq && ['monthly', 'quarterly', 'semiannual', 'annual'].includes(geminiFreq)) {
        return geminiFreq
    }

    // --- Signal 3: period_start hint alone ---
    if (periodStartHint && periodEnd) {
        const hintDays = Math.round(
            (new Date(periodEnd).getTime() - new Date(periodStartHint).getTime()) / 86400000
        )
        if (doesMatchFrequency(hintDays, 'monthly')) return 'monthly'
        if (doesMatchFrequency(hintDays, 'quarterly')) return 'quarterly'
        if (doesMatchFrequency(hintDays, 'semiannual')) return 'semiannual'
        if (doesMatchFrequency(hintDays, 'annual')) return 'annual'
    }

    return null
}

// Compute correct period_start from period_end by going back N months (end-of-month)
// IMPORTANT: Uses UTC to avoid timezone bugs (local time → toISOString shifts date back 1 day in CET/CEST)
function computeStandardPeriodStart(periodEnd: string, monthsBack: number): string {
    const [y, m] = periodEnd.split('-').map(Number)
    let targetMonth = m - 1 - monthsBack // 0-indexed
    let targetYear = y
    while (targetMonth < 0) { targetMonth += 12; targetYear-- }
    // Last day of target month (UTC)
    const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0))
    const yy = lastDay.getUTCFullYear()
    const mm = String(lastDay.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(lastDay.getUTCDate()).padStart(2, '0')
    return `${yy}-${mm}-${dd}`
}

// Check if a duration in days matches a frequency bucket
function doesMatchFrequency(days: number, freq: string): boolean {
    switch (freq) {
        case 'monthly': return days >= 25 && days <= 36
        case 'quarterly': return days >= 85 && days <= 100
        case 'semiannual': return days >= 175 && days <= 195
        case 'annual': return days >= 355 && days <= 375
        default: return false
    }
}

function normalizeAccountNumber(acc: string): string {
    if (!acc) return '';
    const segments = acc.split(/[\/\-]/).map(s => s.replace(/^0+/, '') || '0').filter(s => s.length > 0);
    if (segments.length === 0) return '';
    // Use only last segment — the account identifier is unique per bank
    // (filiale code prefix causes mismatches when some PDFs omit it)
    return segments.slice(-1).join('').toUpperCase();
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
