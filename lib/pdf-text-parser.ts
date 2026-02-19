/**
 * Deterministic PDF text parser for Italian bank statements.
 *
 * This is the PRIMARY source for numbers (quantity, price, marketValue).
 * Gemini is used only for metadata (name, assetType, period, bank).
 *
 * Why text-first:
 * - pdf-parse extracts text deterministically — same PDF = same output every time
 * - Gemini vision misreads Italian numbers (dot=thousands, comma=decimal)
 * - Text parsing is verifiable: qty × price × rate = marketValue
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface TextHolding {
    isin: string
    currency: string
    quantity: number
    price: number
    marketValue: number       // EUR controvalore
    exchangeRate: number
    verified: boolean         // qty × price × rate ≈ marketValue
    source: 'text_verified' | 'text_unverified'
}

export interface TextPortfolioResult {
    holdings: TextHolding[]
    total: number             // extracted "CONTROVALORE TOTALE" from text (0 if not found)
    totalSource: 'keyword' | 'none'
    holdingsSum: number       // sum of holdings marketValues
    bankDetected: string | null
    sectionFound: boolean
}

export interface TextMovement {
    isin: string
    date: string              // DD/MM/YYYY
    quantity: number
    operationType: 'Acquisto' | 'Vendita'
    description: string       // raw operation description (e.g. "FONDI: SOTT PAC")
    price?: number            // unit price (from text, when available)
    grossAmount?: number      // gross amount (from text, when available)
    netAmount?: number        // net amount (from text, when available)
    currency?: string         // currency (from text, when available)
}

export interface TextMovimentiResult {
    startQuantities: Record<string, number>   // ISIN → starting quantity
    endQuantities: Record<string, number>     // ISIN → ending quantity
    movements: TextMovement[]
}

// ── Bank Detection ───────────────────────────────────────────────────────────

const BANK_PATTERNS: { name: string; patterns: RegExp[] }[] = [
    { name: 'Crédit Agricole', patterns: [/CR[ÉE]DIT\s*AGRICOLE/i, /CARIPARMA/i, /FRIULADRIA/i, /\bCA\s+ITALIA/i] },
    { name: 'Intesa Sanpaolo', patterns: [/INTESA\s*SANPAOLO/i, /SANPAOLO\s*INVEST/i] },
    { name: 'UniCredit', patterns: [/UNICREDIT/i] },
    { name: 'Banco BPM', patterns: [/BANCO\s*BPM/i, /BANCA\s*POPOLARE\s*DI\s*MILANO/i] },
    { name: 'BPER Banca', patterns: [/BPER\s*BANCA/i, /BANCA\s*CARIGE/i] },
    { name: 'Monte dei Paschi', patterns: [/MONTE\s*DEI\s*PASCHI/i, /MPS/i] },
    { name: 'FinecoBank', patterns: [/FINECO/i] },
    { name: 'Banca Mediolanum', patterns: [/MEDIOLANUM/i] },
    { name: 'Banca Generali', patterns: [/BANCA\s*GENERALI/i] },
    { name: 'Fideuram', patterns: [/FIDEURAM/i] },
    { name: 'BNL', patterns: [/\bBNL\b/i, /BNP\s*PARIBAS/i] },
    { name: 'Deutsche Bank', patterns: [/DEUTSCHE\s*BANK/i] },
    { name: 'Banca Sella', patterns: [/BANCA\s*SELLA/i] },
    { name: 'Credem', patterns: [/CREDEM/i] },
    { name: 'Azimut', patterns: [/AZIMUT/i] },
    { name: 'IW Bank', patterns: [/IW\s*BANK/i] },
    { name: 'Banca Aletti', patterns: [/ALETTI/i] },
]

export function detectBank(text: string): string | null {
    const upper = text.toUpperCase()
    for (const bank of BANK_PATTERNS) {
        for (const pat of bank.patterns) {
            if (pat.test(upper)) return bank.name
        }
    }
    return null
}

// ── ISIN Validation ──────────────────────────────────────────────────────────

// Italian words that happen to match the ISIN pattern [A-Z]{2}[A-Z0-9]{10}
// These would be false positives
const ITALIAN_WORDS_12 = new Set([
    'CONTROVALORE', 'COMPLESSIVO', 'DISPONIBILE', 'RENDICONTO',
    'SOTTOSCRIZI', 'INFORMATIVA', 'CONSISTENZA', 'OBBLIGAZIONI',
    'COMPOSIZION', 'LIQUIDAZION', 'CAPITALIZZA', 'ACCREDITAME',
])

// ── Text Normalization ──────────────────────────────────────────────────────

/** Strip invisible characters used as thousands separators in some PDFs.
 *  Intesa Sanpaolo uses \u0019 (End of Medium) between digit groups: "261\u0019166,62" → "261166,62"
 *  Also strips other control characters that might appear between digits.
 */
function normalizeInvisibleChars(text: string): string {
    // Replace \u0019 and other invisible chars between digits with nothing
    return text.replace(/(\d)[\u0019\u001a\u001b\u001c\u001d\u001e\u001f](\d)/g, '$1$2')
}

// ── Number Parsing ───────────────────────────────────────────────────────────

/** Parse Italian-format number: "1.234,56" → 1234.56, "283,836" → 283.836 */
export function parseItalianNumber(s: string): number {
    return parseFloat(s.replace(/\./g, '').replace(',', '.'))
}

/** Extract all Italian-format numbers from a string.
 *  Handles both formats:
 *  - With thousand separators: "1.234,56" → 1234.56 (Crédit Agricole)
 *  - Without thousand separators: "2589,294" → 2589.294 (Intesa Sanpaolo)
 *  - With +/- prefix: "+21333,19" → 21333.19 (Intesa)
 */
function extractItalianNumbers(text: string): number[] {
    // Two patterns:
    // 1. With thousands separators: 1-3 digits, then groups of .XXX, then ,decimals
    // 2. Without thousands separators: 4+ digits directly followed by ,decimals
    // Combined with alternation, using a negative lookbehind to avoid partial matches
    const pattern = /(?<!\d)(\d{1,3}(?:\.\d{3})+,\d{2,})|(?<!\d[.,])(\d+,\d{2,})/g
    const numbers: number[] = []
    let m
    while ((m = pattern.exec(text)) !== null) {
        const matched = m[1] || m[2]
        const val = parseItalianNumber(matched)
        if (!isNaN(val) && val >= 0) numbers.push(val)
    }
    return numbers
}

// ── CONSISTENZA Section Extraction ───────────────────────────────────────────

const SECTION_START_KEYWORDS = [
    'CONSISTENZA FINALE', 'CONSISTENZA DI FINE', 'CONSISTENZA AL',
    'RIEPILOGO DEI TITOLI', 'SITUAZIONE FINANZIARIA',
    'CONSISTENZA', 'PORTAFOGLIO TITOLI', 'SITUAZIONE TITOLI',
    'COMPOSIZIONE PORTAFOGLIO', 'COMPOSIZIONE DEL PORTAFOGLIO',
    'ELENCO TITOLI', 'DETTAGLIO TITOLI', 'SITUAZIONE AL',
    'STRUMENTI FINANZIARI',
    'DETTAGLIO DEPOSITO AMMINISTRATO', 'FONDI COMUNI', // Intesa Sanpaolo
]

const SECTION_END_KEYWORDS = [
    'MOVIMENTI', 'OPERAZIONI SU TITOLI', 'RIEPILOGO OPERAZIONI',
    'DIVIDENDI', 'DETTAGLIO CEDOLE', 'RIEPILOGO COMMISSIONI',
    'RIEPILOGO DATI FISCALI', 'DETTAGLIO OPERAZIONI',
]

export function extractConsistenzaSection(fullText: string): string {
    const upper = fullText.toUpperCase()

    let start = -1
    for (const kw of SECTION_START_KEYWORDS) {
        const idx = upper.indexOf(kw)
        if (idx !== -1 && (start === -1 || idx < start)) start = idx
    }
    if (start === -1) return ''

    let end = -1
    for (const ek of SECTION_END_KEYWORDS) {
        const idx = upper.indexOf(ek, start + 50)
        if (idx !== -1 && (end === -1 || idx < end)) end = idx
    }
    if (end === -1) end = Math.min(start + 30000, fullText.length)

    let section = fullText.substring(Math.max(0, start - 20), end).trim()

    // Strip page headers/footers and bank boilerplate
    section = section
        .replace(/Pagina\s+\d+\s+di\s+\d+/gi, '')
        .replace(/Pag\.?\s*\d+\s*(di|\/)\s*\d+/gi, '')
        .replace(/\f/g, ' ')
        .replace(/Capitale\s+Sociale\s+euro\s+[\d.,]+\s*i\.v\./gi, '')
        .replace(/Sede\s+Legale[^.\n]*\./gi, '')

    return section
}

// ── Portfolio Total Extraction ───────────────────────────────────────────────

const TOTAL_PATTERNS = [
    /CONTROVALORE\s+TOTALE[\s\S]{0,80}?([\d.]+,\d{2})/i,
    /TOTALE\s+(?:APPARENTE|PORTAFOGLIO|GENERALE)[\s\S]{0,80}?([\d.]+,\d{2})/i,
    /CONTROV\.\s*TOTALE[\s\S]{0,60}?([\d.]+,\d{2})/i,
    /TOTALE\s+DOSSIER[\s\S]{0,80}?([\d.]+,\d{2})/i,
    /TOTALE\s+CONTROVALORE[\s\S]{0,80}?([\d.]+,\d{2})/i,
    /VALORE\s+COMPLESSIVO[\s\S]{0,80}?([\d.]+,\d{2})/i,
    /CONTROV\.\s*COMPLESSIVO[\s\S]{0,60}?([\d.]+,\d{2})/i,
    /TOTALE\s+GENERALE[\s\S]{0,80}?([\d.]+,\d{2})/i,
    /TOTALE\s+IN\s+EURO\s*([\d.]+,\d{2})/i,
    // Intesa Sanpaolo: "Controvalore titoli e fondi al DDMMYYYY +261166,62 €"
    /CONTROVALORE\s+TITOLI\s+E\s+FONDI\s+AL\s+\d+[\s\S]{0,30}?\+?([\d.]+,\d{2})/i,
    // Intesa alternative: "Controvalore titoli e fondi \t+261166,62 €"
    /CONTROVALORE\s+TITOLI\s+E\s+FONDI[\s\t]+\+?([\d.]+,\d{2})/i,
]

export function extractPortfolioTotal(fullText: string): { total: number; source: 'keyword' | 'none' } {
    for (const pat of TOTAL_PATTERNS) {
        const m = fullText.match(pat)
        if (m) {
            const val = parseItalianNumber(m[1])
            if (val > 0) return { total: val, source: 'keyword' }
        }
    }
    return { total: 0, source: 'none' }
}

// ── Main CONSISTENZA Table Parser ────────────────────────────────────────────

/**
 * Parse the CONSISTENZA/PORTAFOGLIO section line-by-line.
 * Returns verified holdings with deterministic number extraction.
 *
 * Table structure (typical Italian bank):
 *   ISIN          Nome Titolo              Divisa  Quantità    Prezzo    Controv.EUR
 *   IT0005239360  UNICREDIT ORD            EUR     1.000,000   35,840    35.840,00
 *   LU0119620416  MORGAN STANLEY FUND      USD     283,836     44,200    11.616,25
 */
export function parseConsistenzaHoldings(consistenzaText: string): TextHolding[] {
    if (!consistenzaText || consistenzaText.length < 50) return []

    const lines = consistenzaText.split(/\n/)
    const holdings: TextHolding[] = []
    const seenIsins = new Set<string>()

    // Accumulate data per ISIN
    let currentIsin = ''
    let currentCurrency = 'EUR'
    let currentNumbers: number[] = []
    let currentRawLines: string[] = []

    // Pending buffer for Intesa format: numbers appear BEFORE the ISIN (on previous line)
    let pendingNumbers: number[] = []
    let pendingCurrency = 'EUR'
    let pendingRawLine = ''

    const flushCurrent = () => {
        if (currentIsin && currentNumbers.length >= 2 && !seenIsins.has(currentIsin)) {
            const h = buildHoldingFromNumbers(currentIsin, currentCurrency, currentNumbers)
            if (h) {
                holdings.push(h)
                seenIsins.add(currentIsin)
            }
        }
        currentIsin = ''
        currentCurrency = 'EUR'
        currentNumbers = []
        currentRawLines = []
    }

    const isSectionBreak = (trimmed: string): boolean =>
        /^(CONTROVALORE|DIVISA|CODICE|ISIN\s|OBBLIGAZ|WARRANT|RELATIVI|---)/i.test(trimmed)
        || /^TOTALE\b/i.test(trimmed)
        || /Dossier\s+Titoli/i.test(trimmed)
        || /Pag\.?\s*\d+\s*(di|\/)\s*\d+/i.test(trimmed)
        || /Sede\s+Legale/i.test(trimmed)
        || /Capitale\s+Sociale/i.test(trimmed)
        || /Pagina\s+\d+/i.test(trimmed)
        || /Estratto\s+Conto/i.test(trimmed)
        || /^\d{2}\/\d{2}\/\d{4}$/.test(trimmed) // standalone date

    for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        // Check for new ISIN (12-char code: 2 letters + 10 alphanumeric)
        // Must contain at least 1 digit (filters out words like "CONTROVALORE")
        // Also handle ISINs with spaces (OCR artifact): "LU 1531398904", "IE00B1FZS 467"
        let isinMatch = trimmed.match(/\b([A-Z]{2}[A-Z0-9]{10})\b/)
        if (!isinMatch) {
            const spaceIsinMatch = trimmed.match(/\b([A-Z]{2}[A-Z0-9]*)\s+([A-Z0-9]+)\b/)
            if (spaceIsinMatch) {
                const combined = spaceIsinMatch[1] + spaceIsinMatch[2]
                if (combined.length === 12 && /^[A-Z]{2}[A-Z0-9]{10}$/.test(combined) && /\d/.test(combined)) {
                    isinMatch = [combined, combined] as unknown as RegExpMatchArray
                }
            }
        }
        const isRealIsin = isinMatch && /\d/.test(isinMatch[1]) &&
            !ITALIAN_WORDS_12.has(isinMatch[1])

        if (isRealIsin && isinMatch) {
            // Flush previous ISIN before starting new one
            flushCurrent()

            // Skip duplicate ISINs (e.g. ISIN appears in both CONSISTENZA and MOVIMENTI)
            if (seenIsins.has(isinMatch[1])) continue

            currentIsin = isinMatch[1]
            currentRawLines.push(trimmed)

            // Detect currency on same line
            const currMatch = trimmed.match(/\b(USD|GBP|CHF|JPY|SEK|NOK|DKK|AUD|CAD|HKD|SGD|NZD|ZAR|TRY|PLN|CZK|HUF)\b/)
            if (currMatch) currentCurrency = currMatch[1]

            // Extract numbers from the ISIN line itself
            const nums = extractItalianNumbers(trimmed)
            currentNumbers.push(...nums)

            // Intesa format: if this ISIN line has few/no numbers but pending numbers exist
            // from the previous line, adopt them (numbers-then-ISIN pattern)
            if (currentNumbers.length < 2 && pendingNumbers.length >= 2) {
                currentNumbers = [...pendingNumbers, ...currentNumbers]
                currentCurrency = pendingCurrency
                currentRawLines.unshift(pendingRawLine)
            }
            pendingNumbers = []
            pendingCurrency = 'EUR'
            pendingRawLine = ''
        } else if (currentIsin) {
            // Continuation line for current ISIN (description, more numbers)
            // Stop accumulating if we hit a section break, total line, header, or page footer
            if (isSectionBreak(trimmed)) {
                flushCurrent()
                continue
            }

            // Extract numbers from this line
            const nums = extractItalianNumbers(trimmed)

            // Intesa format: if current holding already has 2+ numbers and this new line
            // also has 2+ numbers, it's likely a NEW holding's data line (not a continuation)
            // (Continuation lines like "CAMBIO: 1,105000" only have 1 number, so this is safe)
            if (currentNumbers.length >= 2 && nums.length >= 2) {
                flushCurrent()
                // Buffer these numbers as pending for the next ISIN
                pendingNumbers = nums
                const currMatch = trimmed.match(/\b(USD|GBP|CHF|JPY|SEK|NOK|DKK|AUD|CAD|HKD|SGD|NZD|ZAR|TRY|PLN|CZK|HUF)\b/)
                pendingCurrency = currMatch ? currMatch[1] : 'EUR'
                pendingRawLine = trimmed
                continue
            }

            currentRawLines.push(trimmed)

            // Detect currency
            if (currentCurrency === 'EUR') {
                const currMatch = trimmed.match(/\b(USD|GBP|CHF|JPY|SEK|NOK|DKK|AUD|CAD|HKD|SGD|NZD|ZAR|TRY|PLN|CZK|HUF)\b/)
                if (currMatch) currentCurrency = currMatch[1]
            }

            currentNumbers.push(...nums)

            // If we've accumulated many numbers, this is probably enough for one ISIN
            // (prevents bleeding into next section)
            if (currentNumbers.length >= 8) {
                flushCurrent()
            }
        } else {
            // No current ISIN — buffer numbers for potential "numbers-then-ISIN" pattern (Intesa)
            if (!isSectionBreak(trimmed)) {
                const nums = extractItalianNumbers(trimmed)
                if (nums.length >= 2) {
                    pendingNumbers = nums
                    const currMatch = trimmed.match(/\b(USD|GBP|CHF|JPY|SEK|NOK|DKK|AUD|CAD|HKD|SGD|NZD|ZAR|TRY|PLN|CZK|HUF)\b/)
                    pendingCurrency = currMatch ? currMatch[1] : 'EUR'
                    pendingRawLine = trimmed
                } else {
                    // Non-numeric line without ISIN: clear pending (prevents cross-contamination)
                    if (nums.length === 0 && trimmed.length > 5) {
                        pendingNumbers = []
                        pendingCurrency = 'EUR'
                        pendingRawLine = ''
                    }
                }
            } else {
                pendingNumbers = []
                pendingCurrency = 'EUR'
                pendingRawLine = ''
            }
        }
    }

    // Don't forget the last ISIN
    flushCurrent()

    return holdings
}

/**
 * Given an ISIN, its currency, and the numbers found near it,
 * determine quantity, price, marketValue using math verification.
 *
 * Italian bank tables typically have these columns (left to right):
 *   quantity | price | [controv_divisa] | [exchange_rate] | controv_EUR
 *
 * The LAST number is always the EUR controvalore (market value).
 * We verify by finding qty × price [× rate] ≈ last number.
 */
function buildHoldingFromNumbers(
    isin: string,
    currency: string,
    numbers: number[]
): TextHolding | null {
    if (numbers.length < 2) return null

    // Try each candidate as the potential market value (last number first, then others)
    // This handles both formats:
    // - CA format: ISIN qty price marketValue (market value IS last)
    // - Intesa format: qty price marketValue ISIN exchangeRate (market value is NOT last when exchange rate follows)
    const mvCandidateIndices: number[] = [numbers.length - 1]
    // If last number looks like an exchange rate (0.3-3.0), also try the second-to-last and the largest number
    const lastNum = numbers[numbers.length - 1]
    if (lastNum >= 0.3 && lastNum <= 3.0 && numbers.length >= 3) {
        mvCandidateIndices.push(numbers.length - 2)
        // Also try the largest number in the array
        let maxIdx = 0
        for (let i = 1; i < numbers.length; i++) {
            if (numbers[i] > numbers[maxIdx]) maxIdx = i
        }
        if (!mvCandidateIndices.includes(maxIdx)) mvCandidateIndices.push(maxIdx)
    }

    let bestQty = 0
    let bestPrice = 0
    let bestRate = 1
    let bestMv = 0
    let verified = false
    let bestError = Infinity

    for (const mvIdx of mvCandidateIndices) {
        if (verified) break
        const marketValue = numbers[mvIdx]
        if (marketValue <= 0) continue

        // Try all pairs (qi, pi) where qi < pi
        for (let qi = 0; qi < numbers.length && !verified; qi++) {
            if (qi === mvIdx) continue
            for (let pi = qi + 1; pi < numbers.length; pi++) {
                if (pi === mvIdx) continue
                const qtyCandidate = numbers[qi]
                const priceCandidate = numbers[pi]

                // Direct: qty × price = marketValue (EUR holdings)
                const product = qtyCandidate * priceCandidate
                if (marketValue > 0) {
                    const error = Math.abs(product - marketValue) / marketValue
                    if (error < 0.03 && error < bestError) {
                        bestQty = qtyCandidate
                        bestPrice = priceCandidate
                        bestRate = 1
                        bestMv = marketValue
                        bestError = error
                        if (error < 0.01) { verified = true; break }
                    }
                }

                // With exchange rate: qty × price / rate = marketValue (foreign currency)
                if (currency !== 'EUR' || !verified) {
                    for (let ei = 0; ei < numbers.length; ei++) {
                        if (ei === qi || ei === pi || ei === mvIdx) continue
                        const rateCandidate = numbers[ei]
                        // Exchange rates are typically 0.5 to 2.5
                        if (rateCandidate < 0.3 || rateCandidate > 3.0) continue

                        const productWithRate = qtyCandidate * priceCandidate * rateCandidate
                        if (marketValue > 0) {
                            const error = Math.abs(productWithRate - marketValue) / marketValue
                            if (error < 0.03 && error < bestError) {
                                bestQty = qtyCandidate
                                bestPrice = priceCandidate
                                bestRate = rateCandidate
                                bestMv = marketValue
                                bestError = error
                                if (error < 0.01) { verified = true; break }
                            }
                        }

                        // Also try: qty × price / rate = marketValue (inverse rate)
                        if (rateCandidate > 0) {
                            const productInvRate = qtyCandidate * priceCandidate / rateCandidate
                            if (marketValue > 0) {
                                const error = Math.abs(productInvRate - marketValue) / marketValue
                                if (error < 0.03 && error < bestError) {
                                    bestQty = qtyCandidate
                                    bestPrice = priceCandidate
                                    bestRate = 1 / rateCandidate
                                    bestMv = marketValue
                                    bestError = error
                                    if (error < 0.01) { verified = true; break }
                                }
                            }
                        }
                    }
                }

                // For bonds: price might be in centesimi (e.g., 98.79 = 98.79% of nominal)
                // qty × (price / 100) = marketValue
                if (!verified && priceCandidate > 50 && priceCandidate < 200) {
                    const bondProduct = qtyCandidate * (priceCandidate / 100)
                    if (marketValue > 0) {
                        const error = Math.abs(bondProduct - marketValue) / marketValue
                        if (error < 0.03 && error < bestError) {
                            bestQty = qtyCandidate
                            bestPrice = priceCandidate / 100
                            bestRate = 1
                            bestMv = marketValue
                            bestError = error
                            if (error < 0.01) { verified = true; break }
                        }
                    }
                }
            }
        }
    }

    // When unverified, use the largest number as market value (not just the last)
    // This handles Intesa format where exchange rate may come after market value
    const finalMv = bestError < 0.03 ? bestMv : Math.max(...numbers)

    return {
        isin,
        currency,
        quantity: bestQty,
        price: bestPrice,
        marketValue: finalMv,
        exchangeRate: bestRate,
        verified: bestError < 0.03,
        source: bestError < 0.03 ? 'text_verified' : 'text_unverified',
    }
}

// ── Merge: Text Holdings + Gemini Holdings ───────────────────────────────────

/**
 * Merge text-parsed holdings (accurate numbers) with Gemini holdings (metadata).
 *
 * Strategy:
 * - For ISINs in BOTH: use text numbers + Gemini metadata (name, assetType)
 * - For ISINs only in text (verified): add them (Gemini missed them)
 * - For ISINs only in Gemini: keep as-is (text section might not cover them)
 *
 * Returns the merged holdings array + count of corrections applied.
 */
export function mergeTextAndGeminiHoldings(
    textHoldings: TextHolding[],
    geminiHoldings: any[],
    logFn?: (tag: string, msg: string) => void
): { merged: any[]; corrections: number } {
    if (textHoldings.length === 0) return { merged: geminiHoldings, corrections: 0 }

    const log = logFn || (() => {})
    const textMap = new Map<string, TextHolding>()
    for (const th of textHoldings) {
        textMap.set(th.isin, th)
    }

    let corrections = 0
    const usedTextIsins = new Set<string>()
    const merged: any[] = []

    // Process Gemini holdings: override numbers with text data where available
    for (const gh of geminiHoldings) {
        if (!gh.isin) { merged.push(gh); continue }

        const th = textMap.get(gh.isin)
        if (!th) {
            // Only in Gemini — keep as-is
            merged.push(gh)
            continue
        }

        usedTextIsins.add(gh.isin)

        // Compare numbers
        const mktDiff = gh.marketValue > 0
            ? Math.abs(gh.marketValue - th.marketValue) / Math.max(gh.marketValue, th.marketValue)
            : 1

        if (th.verified) {
            // Text is verified (qty × price = mktVal) — always prefer text numbers
            if (mktDiff > 0.01 || gh.quantity === 0 || gh.marketValue === 0) {
                log('MERGE', `${gh.isin}: numeri dal testo (verificato) | mktVal: ${gh.marketValue?.toFixed(2) || 0} → ${th.marketValue.toFixed(2)}€`)
                corrections++
            }
            merged.push({
                ...gh,
                quantity: th.quantity,
                price: th.price,
                marketValue: th.marketValue,
                exchangeRate: th.exchangeRate,
                _source: 'text_verified',
            })
        } else if (gh.marketValue === 0 || (mktDiff > 0.5 && th.marketValue > 0)) {
            // Gemini has zero or is way off — use text even if unverified (ISIN confirmed by Gemini)
            if (th.marketValue > 0) {
                log('MERGE', `${gh.isin}: marketValue da testo (ISIN confermato) | ${gh.marketValue?.toFixed(2) || 0} → ${th.marketValue.toFixed(2)}€`)
                corrections++
                merged.push({
                    ...gh,
                    quantity: th.quantity || gh.quantity,
                    price: th.price || gh.price,
                    marketValue: th.marketValue,
                    exchangeRate: th.exchangeRate !== 1 ? th.exchangeRate : gh.exchangeRate,
                    _source: 'text_unverified',
                })
            } else {
                merged.push(gh)
            }
        } else {
            // Both have values, text unverified, Gemini seems reasonable
            // Check for 1000x Italian format error specifically
            const ratio = gh.marketValue / th.marketValue
            if (ratio > 900 && ratio < 1100) {
                log('MERGE', `${gh.isin}: 1000x Italian fix | ${gh.marketValue.toFixed(2)} → ${th.marketValue.toFixed(2)}€`)
                merged.push({
                    ...gh,
                    marketValue: th.marketValue,
                    _source: 'text_1000x_fix',
                })
                corrections++
            } else {
                // Keep Gemini's value — not confident enough to override
                merged.push(gh)
            }
        }
    }

    // Add text-only ISINs (Gemini missed them) — only if verified
    for (const th of textHoldings) {
        if (usedTextIsins.has(th.isin)) continue
        if (!th.verified) continue // Don't add unverified holdings that Gemini didn't see

        log('MERGE ADD', `${th.isin}: aggiunto da testo (verificato) | qty=${th.quantity} × price=${th.price.toFixed(4)} = ${th.marketValue.toFixed(2)}€`)
        merged.push({
            isin: th.isin,
            name: th.isin, // Will be enriched by Phase B if needed
            currency: th.currency,
            exchangeRate: th.exchangeRate,
            quantity: th.quantity,
            price: th.price,
            marketValue: th.marketValue,
            _source: 'text_verified',
        })
        corrections++
    }

    return { merged, corrections }
}

// ── Full Pipeline Entry Point ────────────────────────────────────────────────

/**
 * Complete text-based portfolio extraction.
 * Call this ONCE with the full PDF text, then use the result to merge with Gemini.
 */
export function extractPortfolioFromText(fullText: string): TextPortfolioResult {
    // Normalize: strip invisible separators (Intesa uses \u0019 as thousands separator)
    fullText = normalizeInvisibleChars(fullText)

    const bankDetected = detectBank(fullText)
    const consistenzaSection = extractConsistenzaSection(fullText)
    const { total, source: totalSource } = extractPortfolioTotal(fullText)
    const holdings = parseConsistenzaHoldings(consistenzaSection)

    const holdingsSum = holdings.reduce((s, h) => s + h.marketValue, 0)
    const verifiedCount = holdings.filter(h => h.verified).length

    return {
        holdings,
        total,
        totalSource,
        holdingsSum,
        bankDetected,
        sectionFound: consistenzaSection.length > 50,
    }
}

// ── Deterministic Movement Parser (Crédit Agricole format) ──────────────────

// Operation types mapping: description → Acquisto/Vendita
const BUY_PATTERNS = [
    /SOTT\s*PAC/i, /SOTTOSCR/i, /ACQUIST/i, /ACQ\.?\s*CONT/i, /CARICO/i, /VERS\.?\s*TITOL/i,
]
const SELL_PATTERNS = [
    /RIMBORSO/i, /VEN\.?\s*CONT/i, /VENDITA/i, /SCARICO/i,
    /PRELEV/i, /GIRO\s*ALTRO/i, /SWITCH/i, /TRAS\.?\s*TITOL/i,
]

function classifyOperation(desc: string): 'Acquisto' | 'Vendita' | null {
    for (const pat of BUY_PATTERNS) {
        if (pat.test(desc)) return 'Acquisto'
    }
    for (const pat of SELL_PATTERNS) {
        if (pat.test(desc)) return 'Vendita'
    }
    return null
}

/**
 * Clean CA page headers/footers from text to get continuous movement data.
 * Removes blocks like: "Dossier Titoli: ... Pag X di Y ... Codice Descrizione ..."
 */
function cleanPageBreaks(text: string): string {
    // Remove page footer + next page header blocks
    // Pattern: "Dossier Titoli:" ... "-- N of M --" ... "Codice Descrizione Data Consistenza"
    let cleaned = text
    // Remove lines that are page footers (Dossier Titoli:, Crédit Agricole, Pag, page numbers)
    const lines = cleaned.split('\n')
    const filtered: string[] = []
    let skipBlock = false
    for (const line of lines) {
        const trimmed = line.trim()
        // Skip CA page footer lines
        if (/^Dossier Titoli:/i.test(trimmed)) { skipBlock = true; continue }
        if (/^Cr[ée]dit Agricole/i.test(trimmed)) continue
        if (/^\d+\.\d+\.\d+/i.test(trimmed) && trimmed.length < 20) continue // "50.3321.85" style codes
        if (/^Pag\s+\d+\s+di\s+\d+/i.test(trimmed)) continue
        if (/^Codice_filiale:/i.test(trimmed)) continue
        if (/^--\s*\d+\s*of\s*\d+\s*--$/i.test(trimmed)) { skipBlock = false; continue }
        if (/^Capitale Sociale/i.test(trimmed)) continue
        // Skip repeated column headers after page break
        if (skipBlock && /^Codice\s+Descrizione/i.test(trimmed)) { skipBlock = false; continue }
        if (skipBlock && (/^di periodo/i.test(trimmed) || /^Carico/i.test(trimmed) || /^finale di/i.test(trimmed))) continue
        if (skipBlock) continue
        filtered.push(line)
    }
    return filtered.join('\n')
}

/**
 * Extract MOVIMENTI section from full PDF text.
 * Handles multiple bank formats:
 * - Crédit Agricole: "MOVIMENTI EFFETTUATI"
 * - Intesa Sanpaolo: "Movimenti." (standalone section header)
 * - Banca Generali: "MOVIMENTI DI PERIODO"
 */
export function extractMovimentiSection(fullText: string): string {
    const upper = fullText.toUpperCase()

    // Try each marker in priority order
    const markers = [
        'MOVIMENTI EFFETTUATI',    // Crédit Agricole
        'MOVIMENTI DI PERIODO',    // Banca Generali
    ]

    let movIdx = -1
    for (const marker of markers) {
        const idx = upper.indexOf(marker)
        if (idx !== -1) { movIdx = idx; break }
    }

    // Intesa: "Movimenti." as standalone line (not part of "Movimenti di periodo" etc.)
    if (movIdx === -1) {
        const intesaMatch = fullText.match(/^Movimenti\.\s*$/m)
        if (intesaMatch && intesaMatch.index !== undefined) {
            movIdx = intesaMatch.index
        }
    }

    if (movIdx === -1) return ''

    // End at the first section boundary AFTER MOVIMENTI
    let endIdx = fullText.length
    const endMarkers = [
        'DIVIDENDI INCASSATI', 'CEDOLE INCASSATE', 'AVVERTENZE',
        'RIEPILOGO DATI FISCALI', // Banca Generali
        'DIVIDENDI INCASSATI',    // Intesa
    ]
    for (const marker of endMarkers) {
        const idx = upper.indexOf(marker, movIdx + 20)
        if (idx !== -1 && idx < endIdx) endIdx = idx
    }
    return fullText.substring(movIdx, endIdx)
}

/**
 * Parse movements from PDF text. Auto-detects bank format:
 * - Crédit Agricole: ISIN on its own line, DD/MM/YYYY dates, tab-separated operations
 * - Intesa Sanpaolo: CODE NAME OPERATION DD.MM.YYYY QTY on one line, ISIN on next line
 * - Banca Generali: ISIN - NAME on header, "Saldo Iniziale/Finale", DD.MM.YYYY dates
 */
export function parseMovimentiFromText(fullText: string): TextMovimentiResult {
    // Normalize: strip invisible separators (Intesa uses \u0019 as thousands separator)
    fullText = normalizeInvisibleChars(fullText)
    const movSection = extractMovimentiSection(fullText)
    if (!movSection) return { startQuantities: {}, endQuantities: {}, movements: [] }

    // Auto-detect format
    if (/Saldo\s+Iniziale/i.test(movSection)) {
        return parseGeneraliMovimenti(movSection)
    }
    if (/Sottoscrizione|Rimborso/i.test(movSection) && /^\d+\s+\S+.*\d{2}\.\d{2}\.\d{4}/m.test(movSection)) {
        return parseIntesaMovimenti(movSection)
    }
    // Default: CA format
    return parseCAMovimenti(movSection)
}

// ── Crédit Agricole Movement Parser ─────────────────────────────────────────

function parseCAMovimenti(movSection: string): TextMovimentiResult {
    const cleaned = cleanPageBreaks(movSection)
    const lines = cleaned.split('\n')

    const startQuantities: Record<string, number> = {}
    const endQuantities: Record<string, number> = {}
    const movements: TextMovement[] = []

    const ISIN_RE = /^([A-Z]{2}[A-Z0-9]{9}\d)\s/
    const DATE_QTY_RE = /^(\d{2}\/\d{2}\/\d{4})\s+([\d.,]+)/
    const DATE_QTY_OP_RE = /^(\d{2}\/\d{2}\/\d{4})\s+([\d.,]+)\t(.+)/

    let currentIsin = ''
    let isinLines: string[] = []

    const ALL_OP_PATTERNS = [...BUY_PATTERNS, ...SELL_PATTERNS]

    function processIsinBlock(isin: string, blockLines: string[]) {
        const entries: { date: string; qty: number; op: string | null; lineIdx: number }[] = []

        for (let i = 0; i < blockLines.length; i++) {
            const line = blockLines[i].trim()
            if (!line || /^Div:/i.test(line)) continue

            const opMatch = line.match(DATE_QTY_OP_RE)
            if (opMatch) {
                const op = opMatch[3].trim()
                if (/^\d/.test(op)) continue
                entries.push({ date: opMatch[1], qty: parseItalianNumber(opMatch[2]), op, lineIdx: i })
                continue
            }

            const qtyMatch = line.match(DATE_QTY_RE)
            if (qtyMatch && !line.includes('\t')) {
                let foundOp: string | null = null
                for (let j = i + 1; j < blockLines.length && j <= i + 2; j++) {
                    const nextLine = blockLines[j].trim()
                    if (!nextLine || /^Div:/i.test(nextLine)) continue
                    if (DATE_QTY_RE.test(nextLine) || ISIN_RE.test(nextLine)) break
                    if (ALL_OP_PATTERNS.some(p => p.test(nextLine))) {
                        foundOp = nextLine
                        blockLines[j] = ''
                        break
                    }
                    break
                }
                entries.push({ date: qtyMatch[1], qty: parseItalianNumber(qtyMatch[2]), op: foundOp, lineIdx: i })
            }
        }

        if (entries.length === 0) return

        const noOpEntries = entries.filter(e => e.op === null)
        const opEntries = entries.filter(e => e.op !== null)

        const parseDate = (d: string) => {
            const [dd, mm, yyyy] = d.split('/')
            return parseInt(yyyy + mm + dd)
        }
        noOpEntries.sort((a, b) => parseDate(a.date) - parseDate(b.date))

        if (noOpEntries.length >= 2) {
            startQuantities[isin] = noOpEntries[0].qty
            endQuantities[isin] = noOpEntries[noOpEntries.length - 1].qty
        } else if (noOpEntries.length === 1) {
            if (opEntries.length === 0) {
                startQuantities[isin] = noOpEntries[0].qty
                endQuantities[isin] = noOpEntries[0].qty
            } else {
                const noOpDate = parseDate(noOpEntries[0].date)
                const lastOpDate = Math.max(...opEntries.map(e => parseDate(e.date)))
                if (noOpDate > lastOpDate) {
                    endQuantities[isin] = noOpEntries[0].qty
                } else {
                    startQuantities[isin] = noOpEntries[0].qty
                }
            }
        }

        const isinMovements: TextMovement[] = []
        for (const entry of opEntries) {
            const opType = classifyOperation(entry.op!)
            if (opType) {
                isinMovements.push({ isin, date: entry.date, quantity: entry.qty, operationType: opType, description: entry.op! })
            }
        }

        const AMBIGUOUS_OPS = [/GIRO/i, /SWITCH/i, /TRAS/i]
        const startQty = startQuantities[isin] ?? 0
        const endQty = endQuantities[isin] ?? 0
        if (isinMovements.length > 0) {
            const buys = isinMovements.filter(m => m.operationType === 'Acquisto').reduce((s, m) => s + m.quantity, 0)
            const sells = isinMovements.filter(m => m.operationType === 'Vendita').reduce((s, m) => s + m.quantity, 0)
            const calc = startQty + buys - sells
            const hasAmbiguous = isinMovements.some(m => AMBIGUOUS_OPS.some(p => p.test(m.description)))
            if (hasAmbiguous && Math.abs(calc - endQty) > 0.01) {
                for (const mov of isinMovements) {
                    if (AMBIGUOUS_OPS.some(p => p.test(mov.description))) {
                        const flipped = mov.operationType === 'Acquisto' ? 'Vendita' : 'Acquisto'
                        const adjBuys = buys + (flipped === 'Acquisto' ? mov.quantity : 0) - (mov.operationType === 'Acquisto' ? mov.quantity : 0)
                        const adjSells = sells + (flipped === 'Vendita' ? mov.quantity : 0) - (mov.operationType === 'Vendita' ? mov.quantity : 0)
                        if (Math.abs(startQty + adjBuys - adjSells - endQty) < 0.01) { mov.operationType = flipped; break }
                    }
                }
            }
        }

        movements.push(...isinMovements)
    }

    for (const line of lines) {
        const isinMatch = line.match(ISIN_RE)
        if (isinMatch) {
            if (currentIsin && isinLines.length > 0) processIsinBlock(currentIsin, isinLines)
            currentIsin = isinMatch[1]
            isinLines = []
            continue
        }
        if (currentIsin) isinLines.push(line)
    }
    if (currentIsin && isinLines.length > 0) processIsinBlock(currentIsin, isinLines)

    return { startQuantities, endQuantities, movements }
}

// ── Intesa Sanpaolo Movement Parser ─────────────────────────────────────────
// Format: CODE NAME OPERATION DD.MM.YYYY [+/-]QTY PRICE CURRENCY AMOUNT CURRENCY
//         ISIN (on next line)

const INTESA_BUY_OPS = [/Sottoscrizione/i, /Acquisto/i, /Carico/i]
const INTESA_SELL_OPS = [/Rimborso/i, /Vendita/i, /Scarico/i, /Disinvestimento/i]

function classifyIntesaOperation(desc: string): 'Acquisto' | 'Vendita' | null {
    for (const p of INTESA_BUY_OPS) { if (p.test(desc)) return 'Acquisto' }
    for (const p of INTESA_SELL_OPS) { if (p.test(desc)) return 'Vendita' }
    return null
}

function parseIntesaMovimenti(movSection: string): TextMovimentiResult {
    const lines = movSection.split('\n')
    const startQuantities: Record<string, number> = {}
    const endQuantities: Record<string, number> = {}
    const movements: TextMovement[] = []

    // Intesa movement lines are tab-separated:
    //   CODE \t NAME \t OPERATION \t DD.MM.YYYY \t [+/-]QTY \t PRICE CURRENCY \t AMOUNT CURRENCY
    //   ISIN (on next line)
    // Some operations merge date into operation field (e.g. "Conferimento a GPM 29.06.2022")
    // \u0019 is used as thousands separator instead of dot
    const INTESA_MOV_RE = /\s*\t\s*(Sottoscrizione|Rimborso|Acquisto|Vendita|Disinvestimento|Conferimento[^\t]*|Versamento[^\t]*|Raggruppamento)\s*(?:\t\s*)?(\d{2}\.\d{2}\.\d{4})\s*\t\s*([+-]?[\d.,\u0019]+)/i
    const ISIN_LINE_RE = /^([A-Z]{2}[A-Z0-9]{9}\d)\s*$/

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].replace(/\u0019/g, '') // normalize invisible thousands separator

        const movMatch = line.match(INTESA_MOV_RE)
        if (movMatch) {
            const operation = movMatch[1].trim()
            const dateRaw = movMatch[2] // DD.MM.YYYY
            const date = dateRaw.replace(/\./g, '/') // convert to DD/MM/YYYY
            const qtyRaw = movMatch[3].replace(/^[+-]/, '').replace(/\s*EUR\s*$/i, '')
            const qty = parseItalianNumber(qtyRaw)

            // Extract price and amount from tab-separated fields.
            // Intesa format is fixed: CODE[0] \t NAME[1] \t OP[2] \t DATE[3] \t QTY[4] \t PRICE CCY[5] \t AMOUNT CCY[6]
            // Sometimes OP+DATE merge: CODE[0] \t NAME[1] \t OP+DATE[2] \t QTY[3] \t PRICE CCY[4] \t AMOUNT CCY[5]
            let price = 0
            let netAmount = 0
            let currency = 'EUR'
            const fields = line.split('\t').map(f => f.trim().replace(/\u0019/g, ''))
            // Find the date field to anchor our position (DD.MM.YYYY pattern)
            let dateFieldIdx = -1
            for (let fi = 2; fi < fields.length; fi++) {
                if (/^\d{2}\.\d{2}\.\d{4}$/.test(fields[fi])) {
                    dateFieldIdx = fi
                    break
                }
            }
            // qty is the field after date, price after qty, amount after price
            const priceFieldIdx = dateFieldIdx >= 0 ? dateFieldIdx + 2 : -1
            const amountFieldIdx = dateFieldIdx >= 0 ? dateFieldIdx + 3 : -1
            if (priceFieldIdx >= 0 && priceFieldIdx < fields.length) {
                const priceField = fields[priceFieldIdx]
                const priceMatch = priceField.match(/([\d.,]+)\s*(EUR|USD|GBP|CHF)?/i)
                if (priceMatch) {
                    price = parseItalianNumber(priceMatch[1])
                    if (priceMatch[2]) currency = priceMatch[2]
                }
            }
            if (amountFieldIdx >= 0 && amountFieldIdx < fields.length) {
                const amountField = fields[amountFieldIdx]
                const amountMatch = amountField.match(/([+-]?[\d.,]+)\s*(EUR|USD|GBP|CHF)?/i)
                if (amountMatch) {
                    netAmount = parseItalianNumber(amountMatch[1].replace(/^[+-]/, ''))
                    // Amount currency is the settlement currency (always the last field)
                    if (amountMatch[2]) currency = amountMatch[2]
                }
            }

            // Look for ISIN on next line
            let isin = ''
            for (let j = i + 1; j < lines.length && j <= i + 3; j++) {
                const nextTrimmed = lines[j].trim()
                if (!nextTrimmed) continue
                const isinMatch = nextTrimmed.match(ISIN_LINE_RE)
                if (isinMatch) {
                    isin = isinMatch[1]
                    break
                }
                // Skip CAMBIO lines
                if (/^CAMBIO:/i.test(nextTrimmed)) continue
                // Also check for ISIN at start of line (not necessarily alone)
                const isinStart = nextTrimmed.match(/^([A-Z]{2}[A-Z0-9]{9}\d)\b/)
                if (isinStart) {
                    isin = isinStart[1]
                    break
                }
                break
            }

            if (isin && qty > 0) {
                const opType = classifyIntesaOperation(operation)
                if (opType) {
                    // grossAmount = qty × price (the "valore lordo" of the transaction)
                    // netAmount = "Importo netto in valuta di regolamento" (from PDF)
                    // spese/imposte = |netAmount - grossAmount| (calculated by dashboard)
                    const grossAmount = (price > 0 && qty > 0) ? qty * price : 0
                    movements.push({
                        isin,
                        date,
                        quantity: qty,
                        operationType: opType,
                        description: operation,
                        price: price > 0 ? price : undefined,
                        netAmount: netAmount > 0 ? netAmount : undefined,
                        grossAmount: grossAmount > 0 ? grossAmount : undefined,
                        currency,
                    })
                }
            }
        }
    }

    // Intesa doesn't have explicit start/end quantities in movements section.
    // They come from the CONSISTENZA section (previous and current period holdings).
    return { startQuantities, endQuantities, movements }
}

// ── Banca Generali Movement Parser ──────────────────────────────────────────
// Format: ISIN - NAME - Depositario: ...
//         DD.MM.YYYY Saldo Iniziale QTY
//         DD.MM.YYYY Acquisto/Vendita titoli - Op. N° ... QTY PRICE RATE FEES CURRENCY AMOUNT
//         DD.MM.YYYY Saldo Finale QTY

function parseGeneraliMovimenti(movSection: string): TextMovimentiResult {
    const lines = movSection.split('\n')
    const startQuantities: Record<string, number> = {}
    const endQuantities: Record<string, number> = {}
    const movements: TextMovement[] = []

    const ISIN_HEADER_RE = /^([A-Z]{2}[A-Z0-9]{9}\d)\s*-\s*/
    const SALDO_INIZIALE_RE = /^(\d{2}\.\d{2}\.\d{4})\s+Saldo\s+Iniziale\s+(\d+)/i
    const SALDO_FINALE_RE = /^(\d{2}\.\d{2}\.\d{4})\s+Saldo\s+Finale\s+(\d+)/i
    const GENERALI_MOV_RE = /^(\d{2}\.\d{2}\.\d{4})\s+(Acquisto|Vendita)\s+titoli/i

    let currentIsin = ''

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim()

        const isinMatch = trimmed.match(ISIN_HEADER_RE)
        if (isinMatch) {
            currentIsin = isinMatch[1]
            continue
        }

        if (!currentIsin) continue

        const siMatch = trimmed.match(SALDO_INIZIALE_RE)
        if (siMatch) {
            startQuantities[currentIsin] = parseInt(siMatch[2])
            continue
        }

        const sfMatch = trimmed.match(SALDO_FINALE_RE)
        if (sfMatch) {
            endQuantities[currentIsin] = parseInt(sfMatch[2])
            continue
        }

        // Movement line: "DD.MM.YYYY Acquisto/Vendita titoli - Op. N° ... del"
        // Data on continuation lines: "DD.MM.YYYY" (ref date), then "QTY PRICE RATE FEES CURRENCY AMOUNT"
        const movMatch = trimmed.match(GENERALI_MOV_RE)
        if (movMatch) {
            const dateRaw = movMatch[1]
            const date = dateRaw.replace(/\./g, '/')
            const opType = movMatch[2].toLowerCase() === 'acquisto' ? 'Acquisto' as const : 'Vendita' as const

            // Look ahead for the data line with quantity (up to 3 lines after the operation line)
            // The data line starts with a number (quantity) followed by price and other numbers
            let qty = 0
            for (let j = i + 1; j < lines.length && j <= i + 3; j++) {
                const dataLine = lines[j].trim()
                if (!dataLine) continue
                // Skip reference date line (just a date)
                if (/^\d{2}\.\d{2}\.\d{4}\s*$/.test(dataLine)) continue
                // Skip "del DD.MM.YYYY" continuation
                if (/^del\s+\d{2}\.\d{2}\.\d{4}/i.test(dataLine)) continue
                // Data line starts with quantity: "100 44,30000 1,00000 ..."
                // or "-60 120,00000 ..." (negative for sells)
                const qtyMatch = dataLine.match(/^-?(\d+(?:,\d+)?)\s/)
                if (qtyMatch) {
                    qty = parseItalianNumber(qtyMatch[1])
                    break
                }
                break
            }

            if (qty > 0) {
                movements.push({
                    isin: currentIsin,
                    date,
                    quantity: qty,
                    operationType: opType,
                    description: movMatch[2] + ' titoli',
                })
            }
        }
    }

    return { startQuantities, endQuantities, movements }
}
