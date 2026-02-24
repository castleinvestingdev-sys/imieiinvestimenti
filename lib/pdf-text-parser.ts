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
    name?: string             // holding name extracted from text (line before ISIN)
    currency: string
    quantity: number
    price: number
    marketValue: number       // EUR controvalore
    exchangeRate: number
    verified: boolean         // qty × price × rate ≈ marketValue
    source: 'text_verified' | 'text_unverified'
}

export interface TextMetadata {
    bankName?: string
    periodStart?: string      // DD/MM/YYYY
    periodEnd?: string        // DD/MM/YYYY
    accountNumber?: string
    holder?: string
    accountType?: string      // 'DOSSIER' | 'CC' | 'LIQUIDITA'
    settlementAccount?: string // IBAN
}

export interface TextPortfolioResult {
    holdings: TextHolding[]
    total: number             // extracted "CONTROVALORE TOTALE" from text (0 if not found)
    totalSource: 'keyword' | 'none'
    holdingsSum: number       // sum of holdings marketValues
    bankDetected: string | null
    sectionFound: boolean
    metadata?: TextMetadata
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
    // First: check only the header (first 1500 chars) to avoid false positives
    // from other bank names mentioned in transaction descriptions (CC/conto corrente PDFs)
    const header = upper.substring(0, 1500)
    for (const bank of BANK_PATTERNS) {
        for (const pat of bank.patterns) {
            if (pat.test(header)) return bank.name
        }
    }
    // Fallback: check full text
    for (const bank of BANK_PATTERNS) {
        for (const pat of bank.patterns) {
            if (pat.test(upper)) return bank.name
        }
    }
    return null
}

// ── Period Extraction ────────────────────────────────────────────────────────

/** Extract period start/end dates from DT PDF text. Returns DD/MM/YYYY format. */
export function extractPeriodFromText(text: string): { periodStart?: string; periodEnd?: string } {
    // Intesa: "PERIODO RENDICONTATO: 1.07.2015 - 31.12.2015"
    const intesaMatch = text.match(/PERIODO\s+RENDICONTATO:\s*(\d{1,2})[./](\d{2})[./](\d{4})\s*[-–]\s*(\d{1,2})[./](\d{2})[./](\d{4})/i)
    if (intesaMatch) {
        return {
            periodStart: `${intesaMatch[1].padStart(2, '0')}/${intesaMatch[2]}/${intesaMatch[3]}`,
            periodEnd: `${intesaMatch[4].padStart(2, '0')}/${intesaMatch[5]}/${intesaMatch[6]}`,
        }
    }

    // Generali: "periodo intercorso dal 31.03.2023 al 30.06.2023"
    const generaliMatch = text.match(/periodo\s+intercorso\s+dal\s+(\d{2})[./](\d{2})[./](\d{4})\s+al\s+(\d{2})[./](\d{2})[./](\d{4})/i)
    if (generaliMatch) {
        return {
            periodStart: `${generaliMatch[1]}/${generaliMatch[2]}/${generaliMatch[3]}`,
            periodEnd: `${generaliMatch[4]}/${generaliMatch[5]}/${generaliMatch[6]}`,
        }
    }

    // CA: "ESTRATTO CONTO TITOLI AL 31/12/2018" (only end date)
    const caMatch = text.match(/ESTRATTO\s+CONTO\s+(?:DEPOSITO\s+)?TITOLI\s+(?:E\s+OBBLIGAZ[A-Z.]*\s+)?AL\s+(\d{2})[./](\d{2})[./](\d{4})/i)
    if (caMatch) {
        // CA DT typically covers 1 year, try to find start date from "Rendiconto dal DD/MM/YYYY al DD/MM/YYYY"
        const caRangeMatch = text.match(/(?:Rendiconto|Periodo)\s+dal\s+(\d{2})[./](\d{2})[./](\d{4})\s+al\s+(\d{2})[./](\d{2})[./](\d{4})/i)
        if (caRangeMatch) {
            return {
                periodStart: `${caRangeMatch[1]}/${caRangeMatch[2]}/${caRangeMatch[3]}`,
                periodEnd: `${caRangeMatch[4]}/${caRangeMatch[5]}/${caRangeMatch[6]}`,
            }
        }
        return { periodEnd: `${caMatch[1]}/${caMatch[2]}/${caMatch[3]}` }
    }

    // Generic: "al DD/MM/YYYY" or "AL DD.MM.YYYY" near start of text
    const header = text.substring(0, 3000)
    const genericEnd = header.match(/\bAL\s+(\d{2})[./](\d{2})[./](\d{4})\b/i)
    if (genericEnd) {
        return { periodEnd: `${genericEnd[1]}/${genericEnd[2]}/${genericEnd[3]}` }
    }

    return {}
}

// ── Holder Extraction ────────────────────────────────────────────────────────

/** Extract holder (client name) from DT PDF text. */
export function extractHolderFromText(text: string): string | null {
    const header = text.substring(0, 3000)

    // Generali: "Intestato a" followed by "NAME1,NAME2,NAME3 CDG_CODE"
    // Pattern: "Numero Dossier Intestato a CDG\n850/005/0947918 CONDORELLI ALESSANDRA,ZANACCA GIANLUCA,ZANACCA FRA 1362943"
    const generaliMatch = header.match(/Intestato\s+a\s+CDG\s*\n[^\n]*?\d+\/\d+\/\d+\s+([A-ZÀÈÉÌÒÙÜ][A-ZÀÈÉÌÒÙÜ\s,]+?)(?:\s+\d{5,}|\s*$)/im)
    if (generaliMatch) {
        const raw = generaliMatch[1].trim()
        // Split by comma, title-case each person, sort
        const persons = raw.split(',').map(p => p.trim()).filter(p => p.length > 1)
        const titled = persons.map(p =>
            p.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
        ).sort()
        return titled.join(', ')
    }

    // Intesa: "Int.a NOME COGNOME" appears in the holdings section
    const intaMatch = text.match(/Int\.a\s+([A-ZÀÈÉÌÒÙÜ][A-ZÀÈÉÌÒÙÜ\s]+?)(?:\s*\n|\s+\d)/m)
    if (intaMatch) {
        const raw = intaMatch[1].trim()
        return raw.split(/\s+/).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
    }

    // CA: name on its own line before "ESTRATTO CONTO TITOLI"
    // Pattern: "FRIGERI MARIA CRISTINA\nVIALE SOLFERINO 50\n...\nESTRATTO CONTO TITOLI"
    const caEctIdx = header.search(/ESTRATTO\s+CONTO\s+(?:DEPOSITO\s+)?TITOLI/i)
    if (caEctIdx > 0) {
        const beforeEct = header.substring(0, caEctIdx).split('\n').map(l => l.trim()).filter(l => l.length > 0)
        // Look for a name line: ALL CAPS, only letters and spaces, 2-4 words, 8-50 chars
        for (const line of beforeEct) {
            if (/^[A-ZÀÈÉÌÒÙÜ][A-ZÀÈÉÌÒÙÜ\s]+$/.test(line) && line.length >= 8 && line.length <= 50) {
                const words = line.split(/\s+/)
                if (words.length >= 2 && words.length <= 5 && !/(VIA|VIALE|PIAZZA|CORSO|LARGO|PARMA|ROMA|MILANO|BOLOGNA)/i.test(line)) {
                    return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
                }
            }
        }
    }

    // Generic: "Intestato a:" pattern (also used by Generali CC)
    const intestatoMatch = header.match(/Intestato\s+a:\s*([A-ZÀÈÉÌÒÙÜ][A-ZÀÈÉÌÒÙÜ\s,]+)/i)
    if (intestatoMatch) {
        const raw = intestatoMatch[1].trim()
        const persons = raw.split(',').map(p => p.trim()).filter(p => p.length > 1)
        return persons.map(p =>
            p.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
        ).sort().join(', ')
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
    // Negative lookahead (?![A-Za-z]) prevents matching numbers embedded in names (e.g., "1,40CUM")
    const pattern = /(?<!\d)(\d{1,3}(?:\.\d{3})+,\d{2,})(?![A-Za-z])|(?<!\d[.,])(\d+,\d{2,})(?![A-Za-z])/g
    const numbers: number[] = []
    let m
    while ((m = pattern.exec(text)) !== null) {
        const matched = m[1] || m[2]
        const val = parseItalianNumber(matched)
        if (!isNaN(val) && val >= 0) numbers.push(val)
    }
    return numbers
}

/**
 * Extract numbers from an Intesa CONSISTENZA tab-separated line.
 * Intesa format for stocks/bonds: CODE \t NAME \t QTY [CCY] \t PRICE [CCY] \t +CONTROVALORE
 * Unlike extractItalianNumbers, this also captures integer quantities (e.g., "6000", "24000")
 * by looking at specific tab positions where quantities are expected.
 */
function extractIntesaConsistenzaNumbers(text: string): number[] {
    if (!text.includes('\t')) return extractItalianNumbers(text)
    const fields = text.split('\t').map(f => f.trim())
    if (fields.length < 3) return extractItalianNumbers(text)

    const numbers: number[] = []
    // Skip first field (internal code) and second field (name)
    // Process fields 2+ for numbers
    for (let i = 2; i < fields.length; i++) {
        const field = fields[i]
        if (!field) continue
        // Strip leading +/-, trailing currency codes, and "EUR"/"USD" etc.
        const cleaned = field.replace(/^[+-]/, '').replace(/\s*(EUR|USD|GBP|CHF|JPY|SEK|NOK|DKK|AUD|CAD|HKD|SGD|NZD|ZAR|TRY|PLN|CZK|HUF)\s*/gi, '').trim()
        if (!cleaned) continue

        // Try Italian number format first (with comma decimals)
        const italianNums = extractItalianNumbers(field)
        if (italianNums.length > 0) {
            numbers.push(...italianNums)
            continue
        }

        // Try pure integer (no comma) — common for bond nominal/stock qty in Intesa
        // Must be purely numeric (possibly with dot thousand separators)
        const intMatch = cleaned.match(/^(\d{1,3}(?:\.\d{3})*|\d+)$/)
        if (intMatch) {
            const val = parseItalianNumber(intMatch[1])
            if (!isNaN(val) && val > 0) {
                numbers.push(val)
            }
        }
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
    let currentName = ''
    let currentCurrency = 'EUR'
    let currentNumbers: number[] = []
    let currentRawLines: string[] = []

    // Pending buffer for Intesa format: numbers appear BEFORE the ISIN (on previous line)
    let pendingNumbers: number[] = []
    let pendingCurrency = 'EUR'
    let pendingRawLine = ''
    let pendingName = ''

    const flushCurrent = () => {
        if (currentIsin && currentNumbers.length >= 2 && !seenIsins.has(currentIsin)) {
            const h = buildHoldingFromNumbers(currentIsin, currentCurrency, currentNumbers)
            if (h) {
                if (currentName) h.name = currentName
                holdings.push(h)
                seenIsins.add(currentIsin)
            }
        }
        currentIsin = ''
        currentName = ''
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
                // Extract holding name from pending line (Intesa: "CODE \t NAME \t QTY \t PRICE ...")
                if (pendingName) currentName = pendingName
            }
            pendingNumbers = []
            pendingCurrency = 'EUR'
            pendingRawLine = ''
            pendingName = ''
        } else if (currentIsin) {
            // Continuation line for current ISIN (description, more numbers)
            // Stop accumulating if we hit a section break, total line, header, or page footer
            if (isSectionBreak(trimmed)) {
                flushCurrent()
                continue
            }

            // Extract numbers from this line
            // For Intesa tab-separated lines, also capture integer quantities (e.g., "6000", "24000")
            const nums = trimmed.includes('\t') ? extractIntesaConsistenzaNumbers(trimmed) : extractItalianNumbers(trimmed)

            // Intesa format: if this line has 2+ numbers and looks like a data line for
            // a DIFFERENT holding, buffer it as pending for the next ISIN.
            // This triggers when:
            //   a) Current holding already has 2+ numbers (normal case), OR
            //   b) Current holding has <2 numbers AND the line is tab-separated (Intesa format)
            //      — meaning the current ISIN had no data of its own, and this data line
            //        belongs to the NEXT ISIN (numbers-then-ISIN pattern)
            // (Continuation lines like "CAMBIO: 1,105000" only have 1 number, so this is safe)
            const isIntesaDataLine = nums.length >= 2 && trimmed.includes('\t')
            if (nums.length >= 2 && (currentNumbers.length >= 2 || isIntesaDataLine)) {
                flushCurrent()
                // Buffer these numbers as pending for the next ISIN
                pendingNumbers = nums
                const currMatch = trimmed.match(/\b(USD|GBP|CHF|JPY|SEK|NOK|DKK|AUD|CAD|HKD|SGD|NZD|ZAR|TRY|PLN|CZK|HUF)\b/)
                pendingCurrency = currMatch ? currMatch[1] : 'EUR'
                pendingRawLine = trimmed
                // Extract name: second tab-separated field (Intesa: "CODE \t NAME \t QTY \t ...")
                const tabFields = trimmed.split('\t').map(f => f.trim())
                pendingName = tabFields.length >= 3 && /^[A-Z]/.test(tabFields[1]) ? tabFields[1] : ''
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
                // For Intesa tab-separated lines, also capture integer quantities (e.g., "6000", "24000")
                const nums = trimmed.includes('\t') ? extractIntesaConsistenzaNumbers(trimmed) : extractItalianNumbers(trimmed)
                if (nums.length >= 2) {
                    pendingNumbers = nums
                    const currMatch = trimmed.match(/\b(USD|GBP|CHF|JPY|SEK|NOK|DKK|AUD|CAD|HKD|SGD|NZD|ZAR|TRY|PLN|CZK|HUF)\b/)
                    pendingCurrency = currMatch ? currMatch[1] : 'EUR'
                    pendingRawLine = trimmed
                    // Extract name: second tab-separated field
                    const tabFields = trimmed.split('\t').map(f => f.trim())
                    pendingName = tabFields.length >= 3 && /^[A-Z]/.test(tabFields[1]) ? tabFields[1] : ''
                } else {
                    // Non-numeric line without ISIN: clear pending (prevents cross-contamination)
                    if (nums.length === 0 && trimmed.length > 5) {
                        pendingNumbers = []
                        pendingCurrency = 'EUR'
                        pendingRawLine = ''
                        pendingName = ''
                    }
                }
            } else {
                pendingNumbers = []
                pendingCurrency = 'EUR'
                pendingRawLine = ''
                pendingName = ''
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

                    // For foreign currency bonds: qty × (price / 100) / exchangeRate = marketValue
                    if (!verified && (currency !== 'EUR' || !verified)) {
                        for (let ei = 0; ei < numbers.length; ei++) {
                            if (ei === qi || ei === pi || ei === mvIdx) continue
                            const rateCandidate = numbers[ei]
                            if (rateCandidate < 0.3 || rateCandidate > 3.0) continue

                            const bondWithRate = bondProduct / rateCandidate
                            if (marketValue > 0) {
                                const error = Math.abs(bondWithRate - marketValue) / marketValue
                                if (error < 0.03 && error < bestError) {
                                    bestQty = qtyCandidate
                                    bestPrice = priceCandidate / 100
                                    bestRate = 1 / rateCandidate
                                    bestMv = marketValue
                                    bestError = error
                                    if (error < 0.01) { verified = true; break }
                                }
                            }
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
    logFn?: (tag: string, msg: string) => void,
    textTotal?: number
): { merged: any[]; corrections: number } {
    if (textHoldings.length === 0) return { merged: geminiHoldings, corrections: 0 }

    const log = logFn || (() => {})
    const textMap = new Map<string, TextHolding>()
    for (const th of textHoldings) {
        textMap.set(th.isin, th)
    }

    // If text parser has a complete extraction (sum ≈ total), Gemini-only holdings are unreliable
    const verifiedSum = textHoldings.filter(h => h.verified).reduce((s, h) => s + h.marketValue, 0)
    const allSum = textHoldings.reduce((s, h) => s + h.marketValue, 0)
    // Complete if verified sum matches total, OR if all holdings sum matches total (some may fail qty×price check but have correct marketValue)
    const textIsComplete = textTotal != null && textTotal > 0
        && (
            (verifiedSum > 0 && Math.abs(verifiedSum - textTotal) / textTotal < 0.03) ||
            (allSum > 0 && Math.abs(allSum - textTotal) / textTotal < 0.03)
        )

    let corrections = 0
    const usedTextIsins = new Set<string>()
    const merged: any[] = []

    // Process Gemini holdings: override numbers with text data where available
    for (const gh of geminiHoldings) {
        if (!gh.isin) { merged.push(gh); continue }

        const th = textMap.get(gh.isin)
        if (!th) {
            if (textIsComplete) {
                // Text extraction is complete — Gemini-only holdings are unreliable (hallucinations/duplicates)
                log('MERGE SKIP', `${gh.isin}: scartato (solo Gemini, testo completo)`)
                continue
            }
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
                ...(th.name ? { name: th.name } : {}),
                quantity: th.quantity,
                price: th.price,
                marketValue: th.marketValue,
                exchangeRate: th.exchangeRate,
                _source: 'text_verified',
            })
        } else if (textIsComplete && th.marketValue > 0) {
            // Text extraction is complete (sum ≈ total) — trust text marketValue even if unverified
            // The text parser's sum matches the PDF total, so individual values are correct
            if (mktDiff > 0.01) {
                log('MERGE', `${gh.isin}: marketValue da testo (estrazione completa) | ${gh.marketValue?.toFixed(2) || 0} → ${th.marketValue.toFixed(2)}€`)
                corrections++
            }
            merged.push({
                ...gh,
                quantity: th.quantity || gh.quantity,
                price: th.price || gh.price,
                marketValue: th.marketValue,
                exchangeRate: th.exchangeRate !== 1 ? th.exchangeRate : gh.exchangeRate,
                _source: 'text_unverified',
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

    // Add text-only ISINs (Gemini missed them)
    // When textIsComplete, also add unverified holdings (their marketValue is validated by the total sum)
    for (const th of textHoldings) {
        if (usedTextIsins.has(th.isin)) continue
        if (!th.verified && !textIsComplete) continue // Don't add unverified holdings unless text extraction is complete

        const srcLabel = th.verified ? 'verificato' : 'non verificato, estrazione completa'
        log('MERGE ADD', `${th.isin}: aggiunto da testo (${srcLabel}) | qty=${th.quantity} × price=${th.price.toFixed(4)} = ${th.marketValue.toFixed(2)}€`)
        merged.push({
            isin: th.isin,
            name: th.name || th.isin, // Use text-extracted name, fallback to ISIN
            currency: th.currency,
            exchangeRate: th.exchangeRate,
            quantity: th.quantity,
            price: th.price,
            marketValue: th.marketValue,
            _source: th.verified ? 'text_verified' : 'text_unverified',
        })
        corrections++
    }

    return { merged, corrections }
}

// ── Full Pipeline Entry Point ────────────────────────────────────────────────

// ── Metadata Extraction ─────────────────────────────────────────────────────
// Extract period dates, account number, holder, bank, doc type from PDF text

function extractMetadataFromText(text: string, bankDetected: string | null): TextMetadata | undefined {
    const meta: TextMetadata = {}
    let found = false

    // Bank name (already detected)
    if (bankDetected) { meta.bankName = bankDetected; found = true }
    // Also detect from BIC codes
    if (!meta.bankName) {
        if (/BCITITMM/i.test(text)) { meta.bankName = 'Intesa Sanpaolo'; found = true }
        else if (/CRPPIT2P/i.test(text)) { meta.bankName = 'Crédit Agricole'; found = true }
    }

    // Period dates: "PERIODO RENDICONTATO: 1.07.2015 - 31.12.2015" or "PERIODO DAL 30/06/2020 AL 31/12/2020"
    const periodRe1 = /PERIODO\s+RENDICONTAT[OA]:\s*(\d{1,2})\.(\d{2})\.(\d{4})\s*[-–]\s*(\d{1,2})\.(\d{2})\.(\d{4})/i
    const periodRe2 = /PERIODO\s+(?:DAL\s+)?(\d{1,2})[.\/](\d{2})[.\/](\d{4})\s*(?:[-–]|AL)\s*(\d{1,2})[.\/](\d{2})[.\/](\d{4})/i
    const pm1 = text.match(periodRe1) || text.match(periodRe2)
    if (pm1) {
        meta.periodStart = `${pm1[1].padStart(2, '0')}/${pm1[2]}/${pm1[3]}`
        meta.periodEnd = `${pm1[4].padStart(2, '0')}/${pm1[5]}/${pm1[6]}`
        found = true
    }
    // Fallback: "AL DD.MM.YYYY" for period_end
    if (!meta.periodEnd) {
        const alMatch = text.match(/\bAL\s+(\d{1,2})\.(\d{2})\.(\d{4})\b/)
        if (alMatch) {
            meta.periodEnd = `${alMatch[1].padStart(2, '0')}/${alMatch[2]}/${alMatch[3]}`
            found = true
        }
    }

    // Account number: "DEPOSITO AMMINISTRATO N. 3100/1000811" or "N. 19812/3100/01000811"
    const accRe = /DEPOSITO\s+AMMINISTRATO\s+N\.\s*([\d/]+)/i
    const accMatch = text.match(accRe)
    if (accMatch) { meta.accountNumber = accMatch[1].trim(); found = true }

    // Banca Generali DT: "Numero Dossier ... 850/005/0947918" or IBAN "T58500947918"
    if (!meta.accountNumber) {
        const genDossierMatch = text.match(/Numero\s+Dossier[\s\S]{0,200}?(\d{3}\/\d{3}\/\d{5,10})/i)
        if (genDossierMatch) { meta.accountNumber = genDossierMatch[1].trim(); found = true }
        else {
            // Fallback: DT IBAN with T-prefix like "T58500947918"
            const genIbanMatch = text.match(/IBAN[:\s]+IT\s*\d{2}\s*[A-Z]\s*\d{5}\s*\d{5}\s*(T\d{8,12})/i)
            if (genIbanMatch) { meta.accountNumber = genIbanMatch[1].trim(); found = true }
        }
    }

    // Doc type: RENDICONTO TITOLI = DOSSIER, CONTO CORRENTE = CC
    if (/RENDICONTO\s+TITOLI/i.test(text) || /DEPOSITO\s+AMMINISTRATO/i.test(text) || /DOSSIER\s+TITOLI/i.test(text)) {
        meta.accountType = 'DOSSIER'; found = true
    } else if (/CONTO\s+CORRENTE/i.test(text) || /ESTRATTO\s+CONTO/i.test(text)) {
        meta.accountType = 'CC'; found = true
    } else if (/LIQUIDIT[AÀ]/i.test(text)) {
        meta.accountType = 'LIQUIDITA'; found = true
    }

    // IBAN
    const ibanMatch = text.match(/IBAN\s+(IT\d{2}\s*[A-Z0-9\s]{20,30})/i)
    if (ibanMatch) { meta.settlementAccount = ibanMatch[1].replace(/\s+/g, ''); found = true }

    // Holder: for Intesa, appears after "01 NNNNN" line, may have spaced characters
    if (meta.bankName === 'Intesa Sanpaolo') {
        const lines = text.split('\n')
        for (let i = 0; i < Math.min(lines.length, 10); i++) {
            if (/^\d{2}\s+\d{4,6}\s*$/.test(lines[i].trim()) && i + 1 < lines.length) {
                // Next line(s) are the holder name — may be spaced like "F R IG E R I"
                let raw = lines[i + 1].trim()
                // Un-space: if >60% of tokens are 1-2 chars, it's spaced text
                // e.g. "F R IG E R I M A R IA C R IS T IN A" → "FRIGERIMARIACRISTINA"
                // All inter-char spaces are single, so word boundaries are indistinguishable.
                // Just collapse all spaces for spaced text — produces a single identifier string.
                const tokens = raw.split(/\s+/)
                const shortCount = tokens.filter(t => t.length <= 2).length
                if (tokens.length >= 3 && shortCount / tokens.length > 0.6) {
                    raw = tokens.join('')
                }
                if (raw.length >= 3 && !/^\d/.test(raw)) {
                    meta.holder = raw; found = true
                }
                break
            }
        }
    }

    // Banca Generali holder: prefer "Dettaglio Cointestatari" (DT, full names) over "Intestato a" (truncated)
    // DT format has "Dettaglio Cointestatari\nNAME1\nNAME2\n..." with full names on separate lines
    if (!meta.holder) {
        const coinIdx = text.search(/Dettaglio\s+Cointestatari/i)
        if (coinIdx !== -1) {
            const afterCoin = text.substring(coinIdx).split('\n').slice(1) // skip "Dettaglio Cointestatari" line
            const nameLines: string[] = []
            for (const line of afterCoin) {
                const trimmed = line.trim()
                if (trimmed && trimmed.length >= 3 && trimmed.length <= 60
                    && /^[A-ZÀÈÉÌÒÙÜ][A-ZÀÈÉÌÒÙÜ\s]+$/.test(trimmed)) {
                    nameLines.push(trimmed)
                } else {
                    break
                }
            }
            if (nameLines.length > 0) {
                // Title case each name, then join with ", "
                const titleNames = nameLines.map(n =>
                    n.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
                ).filter(n => !/^\s*NI\s*$/i.test(n))
                const name = titleNames.join(', ')
                if (name.length >= 3) { meta.holder = name; found = true }
            }
        }
    }

    // Banca Generali holder: "Intestato a: NOME1,NOME2" (CC/LIQ) or "Intestato a CDG\n850/NNN NAME" (DT)
    if (!meta.holder) {
        const intestIdx = text.search(/Intestato\s+a[\s:]/i)
        if (intestIdx !== -1) {
            const afterIntest = text.substring(intestIdx).replace(/^Intestato\s+a[:\s]+(?:CDG\s*\n)?/i, '')
            const nameLines: string[] = []
            for (const line of afterIntest.split('\n')) {
                const trimmed = line.trim()
                // DT format: "850/005/0947918 CONDORELLI ALESSANDRA,ZANACCA GIANLUCA,... 1362943"
                let namePart = trimmed.replace(/^\d{3}\/\d{3}\/\d{5,10}\s+/, '').replace(/\s+\d{4,}$/, '')
                // Name line: ALL CAPS, letters/commas/spaces only, max ~70 chars
                if (namePart && namePart.length >= 3 && namePart.length <= 70
                    && /^[A-ZÀÈÉÌÒÙÜ][A-ZÀÈÉÌÒÙÜ\s,]+$/.test(namePart)) {
                    nameLines.push(namePart)
                } else {
                    break
                }
            }
            if (nameLines.length > 0) {
                // Smart multi-line join: space for name continuations, preserve existing commas
                let name = nameLines[0]
                for (let i = 1; i < nameLines.length; i++) {
                    if (name.endsWith(',') || nameLines[i].startsWith(',')) {
                        name += nameLines[i]
                    } else {
                        name += ' ' + nameLines[i]
                    }
                }
                name = name.replace(/,+/g, ',').replace(/\s+NI\s*$/i, '').trim()
                // Title case each person, split by comma, sort alphabetically
                const persons = name.split(',').map(p => p.trim()).filter(p => p.length > 0)
                const titled = persons.map(p =>
                    p.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
                ).sort()
                name = titled.join(', ')
                if (name.length >= 3) { meta.holder = name; found = true }
            }
        }
    }

    // Crédit Agricole holder: "Intestatario: NOME COGNOME" or similar
    if (!meta.holder) {
        const holderRe = /(?:Intestatari?o|INTESTATARI?O|Titolare|TITOLARE)[:\s]+([A-ZÀÈÉÌÒÙÜ][A-ZÀÈÉÌÒÙÜ\s]{3,40})/
        const hm = text.match(holderRe)
        if (hm) { meta.holder = hm[1].trim(); found = true }
    }

    return found ? meta : undefined
}

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
    const metadata = extractMetadataFromText(fullText, bankDetected)

    const holdingsSum = holdings.reduce((s, h) => s + h.marketValue, 0)

    // If no explicit total found but we have holdings, use holdingsSum as total
    // (Banca Generali PDFs don't have a "CONTROVALORE TOTALE" line)
    const effectiveTotal = total > 0 ? total : holdingsSum
    const effectiveTotalSource = total > 0 ? totalSource : (holdingsSum > 0 ? 'keyword' as const : 'none' as const)

    return {
        holdings,
        total: effectiveTotal,
        totalSource: effectiveTotalSource,
        holdingsSum,
        bankDetected,
        sectionFound: consistenzaSection.length > 50,
        metadata,
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
    // Match buy/sell operations (quantity-changing):
    // - "Acquisto titoli", "Acquisto in collocamento-opv"
    // - "Vendita titoli"
    // - "scarico con liquidazione"
    // Does NOT match income operations (no quantity change): "Incasso dividendi", "Incasso proventi certificates"
    const GENERALI_MOV_RE = /^(\d{2}\.\d{2}\.\d{4})\s+(Acquisto\b|Vendita\b|scarico\s+con\s+liquidazione)/i

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
        // Also: "DD.MM.YYYY Acquisto in collocamento-opv - Op. N° ..."
        // Also: "DD.MM.YYYY scarico con liquidazione - scarico - Op. N° ..."
        // Data on continuation lines: "DD.MM.YYYY" (ref date), then "QTY PRICE RATE FEES CURRENCY AMOUNT"
        const movMatch = trimmed.match(GENERALI_MOV_RE)
        if (movMatch) {
            const dateRaw = movMatch[1]
            const date = dateRaw.replace(/\./g, '/')
            const opRaw = movMatch[2].toLowerCase()
            const opType = opRaw.startsWith('acquisto') ? 'Acquisto' as const : 'Vendita' as const

            // Look ahead for the data line with quantity (up to 5 lines after the operation line)
            // Format varies: "Operaz. N° ... del" / "DD.MM.YYYY" / "QTY (EUR) PRICE RATE AMOUNT"
            let qty = 0
            for (let j = i + 1; j < lines.length && j <= i + 5; j++) {
                const dataLine = lines[j].trim()
                if (!dataLine) continue
                // Skip reference date line (just a date)
                if (/^\d{2}\.\d{2}\.\d{4}\s*$/.test(dataLine)) continue
                // Skip "del DD.MM.YYYY" continuation
                if (/^del\s+\d{2}\.\d{2}\.\d{4}/i.test(dataLine)) continue
                // Skip "Operaz. N°" continuation lines
                if (/^Operaz/i.test(dataLine)) continue
                // Skip "scarico -" continuation line
                if (/^scarico\s*-/i.test(dataLine)) continue
                // Stop if we hit the next Saldo or ISIN header
                if (/^(\d{2}\.\d{2}\.\d{4})\s+Saldo/i.test(dataLine)) break
                if (ISIN_HEADER_RE.test(dataLine)) break
                // Data line starts with quantity: "15" or "100 44,30000 1,00000 ..."
                // or "-60 120,00000 ..." (negative for sells)
                const qtyMatch = dataLine.match(/^-?(\d+(?:,\d+)?)\s/)
                if (qtyMatch) {
                    qty = parseItalianNumber(qtyMatch[1])
                    break
                }
                // Also match standalone integer (just "15" on its own line)
                const standaloneQty = dataLine.match(/^(\d+)$/)
                if (standaloneQty) {
                    qty = parseInt(standaloneQty[1])
                    break
                }
            }

            if (qty > 0) {
                movements.push({
                    isin: currentIsin,
                    date,
                    quantity: qty,
                    operationType: opType,
                    description: trimmed.substring(11).trim(),
                })
            }
        }
    }

    return { startQuantities, endQuantities, movements }
}

// ── Banca Generali CC/LIQ (Estratto Conto Corrente / Liquidità) Parser ──────

export interface TextCCMovement {
    date: string              // DD/MM/YYYY
    valueDate?: string        // DD/MM/YYYY (data valuta)
    amount: number            // positive = entrata, negative = uscita
    description: string
    category?: string         // BONIFICO, SOTTOSCRIZ. FONDI/SICAV, etc.
}

export interface TextCCCompetenze {
    interessiCreditoriLordi: number     // INTERESSI A CREDITO LIQUIDATI
    interessiDebitoriLordi: number      // INTERESSI A DEBITO LIQUIDATI
    ritenutaFiscale: number             // RITENUTA FISCALE SU INTERESSI CREDITORI
    interessiCreditoriNetti: number     // INTERESSI CREDITORI NETTI LIQUIDATI
    speseTotali: number                 // Totale spese di periodo
    totaleSbilancio: number             // TOTALE SBILANCIO COMPETENZE
    numeriCreditori: number             // TOTALE NUMERI ... creditori
    numeriDebitori: number              // TOTALE NUMERI ... debitori
    tassoAttivo?: string                // Tasso annuo creditori (e.g. "0,0000%")
    tassoPassivo?: string               // Tasso annuo debitori
}

export interface TextCCResult {
    saldoIniziale: number
    saldoFinale: number
    periodStart?: string      // DD/MM/YYYY
    periodEnd?: string        // DD/MM/YYYY
    movements: TextCCMovement[]
    movementsSum: number      // sum of all movements
    bankDetected: string | null
    accountNumber?: string    // CC account number (e.g. "CC8500852708")
    holder?: string           // Intestatario name from "Intestato a:" field
    isCC: true
    competenze?: TextCCCompetenze       // COMPETENZE section data
    giacenzaMedia?: number               // Giacenza media annuale (from ISEE section)
}

/**
 * Parse the COMPETENZE section of a Banca Generali CC/LIQ PDF.
 * Extracts: interessi creditori/debitori, ritenuta fiscale, spese, numeri creditori/debitori.
 *
 * Section structure:
 *   COMPETENZE
 *   1. INTERESSI A CREDITO LIQUIDATI <amount>
 *   2. INTERESSI A DEBITO LIQUIDATI <amount> -
 *   3. SPESE <amount> -
 *   TOTALE SBILANCIO COMPETENZE ... <amount> [-]
 *   1. INTERESSI A CREDITO
 *     Decorrenza Tasso annuo Tasso di periodo Numeri creditori Interessi creditori
 *     <date> <tasso%> <tasso%> <numeri> <interessi>
 *     TOTALE INTERESSI CREDITORI <amount>
 *     RITENUTA FISCALE SU INTERESSI CREDITORI POSITIVI (*) <amount> -
 *     TOTALE INTERESSI CREDITORI NETTI LIQUIDATI <amount>
 *   2. INTERESSI A DEBITO
 *     TOTALE INTERESSI A DEBITO LIQUIDATI <amount>
 *   RIASSUNTO SCALARE
 *     ...
 *     TOTALE NUMERI <debitori> <creditori>
 *   3. SPESE
 *     Totale spese di periodo <amount> -
 */
function parseGeneraliCompetenze(fullText: string): TextCCCompetenze | null {
    const upper = fullText.toUpperCase()
    const compIdx = upper.indexOf('COMPETENZE')
    if (compIdx === -1) return null

    // Extract from COMPETENZE to the end (or next major section)
    const compSection = fullText.substring(compIdx)

    // Helper: parse Italian number (1.234,56 → 1234.56)
    function parseItalianNum(s: string): number {
        if (!s) return 0
        s = s.trim().replace(/\./g, '').replace(',', '.')
        const n = parseFloat(s)
        return isNaN(n) ? 0 : n
    }

    let interessiCreditoriLordi = 0
    let interessiDebitoriLordi = 0
    let ritenutaFiscale = 0
    let interessiCreditoriNetti = 0
    let speseTotali = 0
    let totaleSbilancio = 0
    let numeriCreditori = 0
    let numeriDebitori = 0
    let tassoAttivo: string | undefined
    let tassoPassivo: string | undefined

    const lines = compSection.split('\n')

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const lineUpper = line.toUpperCase().trim()

        // 1. INTERESSI A CREDITO LIQUIDATI <amount>
        // New format: "1. INTERESSI A CREDITO LIQUIDATI 0,00"
        // Old format: "INTERESSI A CREDITO LIQUIDATI" (no amount) or on same line with other text
        if (lineUpper.includes('INTERESSI A CREDITO LIQUIDATI')) {
            const creditMatch = line.match(/INTERESSI\s+A\s+CREDITO\s+LIQUIDATI\s+([\d.,]+)/i)
            if (creditMatch) {
                interessiCreditoriLordi = parseItalianNum(creditMatch[1])
            }
        }

        // TOTALE NETTO INTERESSI A CREDITO LIQUIDATI (old format)
        if (lineUpper.includes('TOTALE NETTO INTERESSI A CREDITO LIQUIDATI')) {
            const nettoMatch = line.match(/TOTALE\s+NETTO\s+INTERESSI\s+A\s+CREDITO\s+LIQUIDATI\s+([\d.,]+)/i)
            if (nettoMatch) {
                interessiCreditoriNetti = parseItalianNum(nettoMatch[1])
            }
        }

        // 2. INTERESSI A DEBITO LIQUIDATI <amount> -
        // New format: "2. INTERESSI A DEBITO LIQUIDATI 0,00 -"
        // Old format: "0,00\tINTERESSI A DEBITO LIQUIDATI\t2 -" (amount prefix) or "TOTALE INTERESSI A DEBITO LIQUIDATI"
        // Always stored as positive (absolute value)
        if (lineUpper.includes('INTERESSI A DEBITO LIQUIDATI')) {
            // Try new format: amount after text
            const debitMatch = line.match(/INTERESSI\s+A\s+DEBITO\s+LIQUIDATI\s+([\d.,]+)/i)
            if (debitMatch) {
                interessiDebitoriLordi = Math.abs(parseItalianNum(debitMatch[1]))
            } else {
                // Try old format: amount before text "0,00\tINTERESSI A DEBITO LIQUIDATI"
                const oldDebitMatch = line.match(/^([\d.,]+)\s+(?:INTERESSI\s+A\s+DEBITO\s+LIQUIDATI|TOTALE\s+INTERESSI\s+A\s+DEBITO)/i)
                if (oldDebitMatch) {
                    interessiDebitoriLordi = Math.abs(parseItalianNum(oldDebitMatch[1]))
                }
            }
        }

        // TOTALE SBILANCIO COMPETENZE ... <amount> [-]
        // New format: "TOTALE SBILANCIO COMPETENZE REGISTRATE CON VALUTA 31.12.2024" (no amount on line!)
        // Old format: "18,75 -\tTOTALE SBILANCIO COMPETENZE REGISTRATE CON VALUTA 31.12.2022"
        if (lineUpper.includes('TOTALE SBILANCIO COMPETENZE')) {
            // Skip if line ends with a date (DD.MM.YYYY) — no amount on this line
            if (!/\d{2}\.\d{2}\.\d{4}\s*$/.test(line.trim())) {
                const sbilMatch = line.match(/([\d.,]+)\s*-?\s*$/)
                if (sbilMatch) {
                    totaleSbilancio = parseItalianNum(sbilMatch[1])
                    if (line.trim().endsWith('-')) totaleSbilancio = -totaleSbilancio
                }
            }
            // Old format: amount before text "18,75 -\tTOTALE SBILANCIO"
            const oldSbilMatch = line.match(/^([\d.,]+)\s*-?\s*\t.*TOTALE\s+SBILANCIO/i)
            if (oldSbilMatch) {
                totaleSbilancio = parseItalianNum(oldSbilMatch[1])
                if (/^[\d.,]+\s*-/.test(line)) totaleSbilancio = -totaleSbilancio
            }
        }

        // RITENUTA FISCALE SU INTERESSI CREDITORI POSITIVI (*) <amount> -
        // Also: "RITENUTA FISCALE ATTUALMENTE IN VIGORE 0,00-" (old format)
        // Always stored as positive (absolute value)
        if (lineUpper.includes('RITENUTA FISCALE')) {
            const ritMatch = line.match(/([\d.,]+)\s*-?\s*$/)
            if (ritMatch) {
                ritenutaFiscale = Math.abs(parseItalianNum(ritMatch[1]))
            }
        }

        // TOTALE INTERESSI CREDITORI NETTI LIQUIDATI <amount> (new format)
        // Note: old format uses TOTALE NETTO INTERESSI A CREDITO LIQUIDATI (handled above)
        if (lineUpper.includes('INTERESSI CREDITORI NETTI LIQUIDATI')) {
            const nettiMatch = line.match(/([\d.,]+)\s*-?\s*$/)
            if (nettiMatch) {
                interessiCreditoriNetti = parseItalianNum(nettiMatch[1])
            }
        }

        // TOTALE NUMERI — column order differs between old and new format:
        // NEW format (space-separated): TOTALE NUMERI <debitori> <creditori>
        // OLD format (tab-separated):   TOTALE NUMERI <creditori>\t<debitori>
        if (lineUpper.includes('TOTALE NUMERI')) {
            if (line.includes('\t')) {
                // Old format: "TOTALE NUMERI 6.745.288,44\t0,00" — creditori first
                const numMatch = line.match(/TOTALE\s+NUMERI\s+([\d.,]+)\s+([\d.,]+)/i)
                if (numMatch) {
                    numeriCreditori = parseItalianNum(numMatch[1])
                    numeriDebitori = parseItalianNum(numMatch[2])
                }
            } else {
                // New format: "TOTALE NUMERI 0,00 3.305.858,27" — debitori first
                const numMatch = line.match(/TOTALE\s+NUMERI\s+([\d.,]+)\s+([\d.,]+)/i)
                if (numMatch) {
                    numeriDebitori = parseItalianNum(numMatch[1])
                    numeriCreditori = parseItalianNum(numMatch[2])
                }
            }
        }

        // Totale spese di periodo <amount> -
        // New format: "Totale spese di periodo 25,00 -"
        // Old format: "Totale spese di periodo -\t0,00" (amount after tab)
        // Always stored as positive (absolute value) — expenses are always costs
        if (lineUpper.includes('TOTALE SPESE DI PERIODO')) {
            if (line.includes('\t')) {
                // Old format: "Totale spese di periodo -\t0,00"
                const parts = line.split('\t')
                const amtPart = parts[parts.length - 1].trim()
                speseTotali = Math.abs(parseItalianNum(amtPart))
            } else {
                // New format: "Totale spese di periodo 25,00 -"
                const speseMatch = line.match(/([\d.,]+)\s*-?\s*$/)
                if (speseMatch) {
                    speseTotali = Math.abs(parseItalianNum(speseMatch[1]))
                }
            }
        }

        // Extract tasso from INTERESSI A CREDITO rows
        // Format: "01.01.2024 0,0000% 0,0000% 130.476,58 0,00"
        if (!tassoAttivo && lineUpper.includes('INTERESSI A CREDITO') && !lineUpper.includes('LIQUIDATI') && !lineUpper.includes('NETTI')) {
            // Look ahead for first data row with tasso
            for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
                const rowMatch = lines[j].match(/^\d{2}\.\d{2}\.\d{4}\s+([\d,]+%)\s/)
                if (rowMatch) {
                    tassoAttivo = rowMatch[1]
                    break
                }
            }
        }

        // Extract tasso from INTERESSI A DEBITO rows
        if (!tassoPassivo && lineUpper.includes('INTERESSI A DEBITO') && !lineUpper.includes('LIQUIDATI')) {
            for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
                const rowMatch = lines[j].match(/^\d{2}\.\d{2}\.\d{4}\s+([\d,]+%)\s/)
                if (rowMatch) {
                    tassoPassivo = rowMatch[1]
                    break
                }
            }
        }
    }

    return {
        interessiCreditoriLordi,
        interessiDebitoriLordi,
        ritenutaFiscale,
        interessiCreditoriNetti,
        speseTotali,
        totaleSbilancio,
        numeriCreditori,
        numeriDebitori,
        tassoAttivo,
        tassoPassivo,
    }
}

/**
 * Detect if the PDF text is a Banca Generali CC/LIQ (Estratto Conto Corrente / Liquidità).
 */
export function isGeneraliCC(fullText: string): boolean {
    const upper = fullText.toUpperCase()
    return /BANCA\s*GENERALI/i.test(fullText) &&
        (upper.includes('ESTRATTO CONTO CORRENTE') || upper.includes('EC LIQUIDIT'))
}

/**
 * Extract CC/LIQ data from Banca Generali Estratto Conto Corrente / Liquidità PDFs.
 * Extracts: saldo iniziale/finale, period dates, individual cash movements.
 *
 * Two format variants:
 * OLD (pre-2024): dates DD/MM/YYYY
 *   - Uscita: "DD/MM/YYYY DD/MM/YYYY AMOUNT-"  (amount with trailing "-" on date line)
 *   - Entrata: "DD/MM/YYYY DD/MM/YYYY Description...\n...\nAMOUNT\tCATEGORY"
 *     (amount on separate tab-separated line, always positive)
 *
 * NEW (2024+): dates DD.MM.YYYY
 *   - "DD.MM.YYYY DD.MM.YYYY DESCRIPTION\n...\nAMOUNT" or "AMOUNT -"
 *     (amount on separate line, with " -" suffix for negatives)
 */
export function extractGeneraliCCData(fullText: string): TextCCResult | null {
    fullText = normalizeInvisibleChars(fullText)

    const bankDetected = detectBank(fullText)

    // --- Extract account number from IBAN line ---
    // Pattern: "IBAN: IT 14 G 03075 02200 CC8500852708" → "CC8500852708"
    let accountNumber: string | undefined
    const ibanMatch = fullText.match(/IBAN[:\s]+IT\s*\d{2}\s*[A-Z]\s*\d{5}\s*\d{5}\s*(CC?\d+)/i)
    if (ibanMatch) {
        accountNumber = ibanMatch[1]
    } else {
        // Fallback: look for standalone CC+digits pattern
        const ccMatch = fullText.match(/\bCC\s*(\d{8,12})\b/)
        if (ccMatch) accountNumber = 'CC' + ccMatch[1]
    }

    // --- Extract holder name from "Intestato a:" field ---
    let holder: string | undefined
    // Find "Intestato a:" and capture name(s) - may span 1-2 lines
    const intestatoIdx = fullText.search(/Intestato\s+a:/i)
    if (intestatoIdx !== -1) {
        const afterIntest = fullText.substring(intestatoIdx).replace(/^Intestato\s+a:\s*/i, '')
        const nameLines: string[] = []
        for (const line of afterIntest.split('\n')) {
            const trimmed = line.trim()
            // Name continuation line: ALL CAPS, only letters/commas/spaces, max ~60 chars
            // Stops at lines with lowercase words > 3 chars (like "Imposta", "Gentile", etc.)
            if (trimmed && trimmed.length >= 2 && trimmed.length <= 70
                && /^[A-ZÀÈÉÌÒÙÜ][A-ZÀÈÉÌÒÙÜ\s,]+$/.test(trimmed)) {
                nameLines.push(trimmed)
            } else {
                break
            }
        }
        if (nameLines.length > 0) {
            // Smart join: if prev line ends mid-name (no comma), join with space
            let name = nameLines[0]
            for (let i = 1; i < nameLines.length; i++) {
                if (name.endsWith(',') || nameLines[i].startsWith(',')) {
                    name += nameLines[i]
                } else {
                    // Line continuation (e.g. "UGHETTI\nMASSIMILIANO" → "UGHETTI MASSIMILIANO")
                    name += ' ' + nameLines[i]
                }
            }
            name = name.replace(/,+/g, ',').replace(/\s+NI\s*$/i, '').trim()
            // Title case each person, split by comma, sort alphabetically
            const persons = name.split(',').map(p => p.trim()).filter(p => p.length > 0)
            const titled = persons.map(p =>
                p.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
            ).sort()
            holder = titled.join(', ')
        }
    }

    let saldoIniziale = 0
    let saldoFinale = 0
    let periodStart: string | undefined
    let periodEnd: string | undefined

    // --- Extract from RIEPILOGO section (amounts on same line as label) ---
    const saldoInizNuovo = fullText.match(/Saldo\s+iniziale\s+al\s+(\d{2})[./](\d{2})[./](\d{4})\s+([\d.,]+)/i)
    if (saldoInizNuovo) {
        periodStart = `${saldoInizNuovo[1]}/${saldoInizNuovo[2]}/${saldoInizNuovo[3]}`
        saldoIniziale = parseItalianNumber(saldoInizNuovo[4])
    }

    const saldoFinNuovo = fullText.match(/Saldo\s+finale\s+al\s+(\d{2})[./](\d{2})[./](\d{4})\s+([\d.,]+)/i)
    if (saldoFinNuovo) {
        periodEnd = `${saldoFinNuovo[1]}/${saldoFinNuovo[2]}/${saldoFinNuovo[3]}`
        saldoFinale = parseItalianNumber(saldoFinNuovo[4])
    }

    // --- Extract ELENCO MOVIMENTI section ---
    const upper = fullText.toUpperCase()
    const movStart = upper.indexOf('ELENCO MOVIMENTI')
    if (movStart === -1) return null

    // Find end of movements section
    let movEnd = fullText.length
    const movEndMarkers = [
        'DATI PER IL CALCOLO ISEE', 'AVVISI E NOVITA',
        'La sicurezza dei Clienti', 'RIASSUNTO SCALARE',
        'Ai sensi del D.Lgs',
    ]
    // Note: 'COMPETENZE' is NOT a valid end marker — it appears inside movement
    // descriptions (e.g., "Competenze complessive al 31/12/2022") and would truncate
    // the section before SALDO FINALE.
    for (const marker of movEndMarkers) {
        const idx = upper.indexOf(marker.toUpperCase(), movStart + 20)
        if (idx !== -1 && idx < movEnd) movEnd = idx
    }

    const movSection = fullText.substring(movStart, movEnd)

    // Split preserving original lines (tabs are significant for old format)
    const rawLines = movSection.split('\n')

    // Clean page breaks: remove page footer/header boilerplate between pages
    const cleanedLines: string[] = []
    let inPageBreak = false
    for (const line of rawLines) {
        const t = line.trim()
        if (!t) continue
        if (/^Pagina\s+\d+/i.test(t) || /^--\s*\d+\s*of\s*\d+\s*--$/i.test(t)) { inPageBreak = true; continue }
        if (/^F:\d+\/\d+/i.test(t)) continue
        if (/^Banca Generali S\.p\.A/i.test(t)) continue
        if (/^soggetta alla direzione/i.test(t)) continue
        if (/^Fondo Interbancario/i.test(t)) continue
        if (/^Uffici Operativi/i.test(t)) continue
        if (/^Iscrizione al Reg/i.test(t)) continue
        if (inPageBreak && /^Conto\s+Corrente$/i.test(t)) continue
        if (inPageBreak && /^IBAN\s+/i.test(t)) { inPageBreak = false; continue }
        inPageBreak = false
        cleanedLines.push(line.trimEnd())  // keep leading whitespace for tab detection
    }

    const movements: TextCCMovement[] = []
    let foundSaldoIniziale = false
    let foundSaldoFinale = false

    // Detect format: new format uses DD.MM.YYYY (dots) in movement section
    const isNewFormat = /^\d{2}\.\d{2}\.\d{4}\s+\d{2}\.\d{2}\.\d{4}\s+\S/m.test(movSection)

    for (let i = 0; i < cleanedLines.length; i++) {
        const trimmed = cleanedLines[i].trim()
        if (!trimmed) continue

        // --- SALDO INIZIALE ---
        const siMatch = trimmed.match(/^(\d{2})[./](\d{2})[./](\d{4})\s+SALDO\s+INIZIALE\s+([\d.,]+)/i)
        if (siMatch) {
            const siAmount = parseItalianNumber(siMatch[4])
            // ELENCO MOVIMENTI saldo ALWAYS overrides RIEPILOGO (ground truth)
            saldoIniziale = siAmount
            periodStart = `${siMatch[1]}/${siMatch[2]}/${siMatch[3]}`
            foundSaldoIniziale = true
            continue
        }

        // --- SALDO FINALE ---
        // Old format: "AMOUNT\tDD/MM/YYYY SALDO FINALE"
        const sfMatchTab = trimmed.match(/([\d.,]+)\t(\d{2})[./](\d{2})[./](\d{4})\s+SALDO\s+FINALE/i)
        if (sfMatchTab) {
            saldoFinale = parseItalianNumber(sfMatchTab[1])
            periodEnd = `${sfMatchTab[2]}/${sfMatchTab[3]}/${sfMatchTab[4]}`
            foundSaldoFinale = true
            continue
        }
        // Old format variant: "AMOUNT DD/MM/YYYY SALDO FINALE" (space instead of tab)
        const sfMatch1 = trimmed.match(/^([\d.,]+)\s+(\d{2})[./](\d{2})[./](\d{4})\s+SALDO\s+FINALE/i)
        if (sfMatch1) {
            saldoFinale = parseItalianNumber(sfMatch1[1])
            periodEnd = `${sfMatch1[2]}/${sfMatch1[3]}/${sfMatch1[4]}`
            foundSaldoFinale = true
            continue
        }
        // New format: "DD.MM.YYYY SALDO FINALE AMOUNT"
        const sfMatch2 = trimmed.match(/^(\d{2})[./](\d{2})[./](\d{4})\s+SALDO\s+FINALE\s+([\d.,]+)/i)
        if (sfMatch2) {
            saldoFinale = parseItalianNumber(sfMatch2[4])
            periodEnd = `${sfMatch2[1]}/${sfMatch2[2]}/${sfMatch2[3]}`
            foundSaldoFinale = true
            continue
        }

        // Skip lines before SALDO INIZIALE or after SALDO FINALE
        if (!foundSaldoIniziale) continue
        if (foundSaldoFinale) continue

        // Skip header/meta lines
        if (/^Data\s+operazione/i.test(trimmed)) continue
        if (/^Elenco,\s+in\s+ordine/i.test(trimmed)) continue

        if (isNewFormat) {
            // === NEW FORMAT (2024+) ===
            // Date line: "DD.MM.YYYY DD.MM.YYYY DESCRIPTION"
            // Amount on separate line: "AMOUNT" (positive) or "AMOUNT -" (negative)
            const dateMatch = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2})\.(\d{2})\.(\d{4})\s+(.+)/)
            if (dateMatch) {
                const date = `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`
                const valueDate = `${dateMatch[4]}/${dateMatch[5]}/${dateMatch[6]}`
                let desc = dateMatch[7].trim()
                let amount = 0
                let isNeg = false

                // Look ahead for amount on subsequent lines
                for (let j = i + 1; j < cleanedLines.length && j <= i + 8; j++) {
                    const nextLine = cleanedLines[j].trim()
                    if (!nextLine) continue
                    // Stop at next movement line or SALDO FINALE
                    if (/^\d{2}\.\d{2}\.\d{4}\s+/.test(nextLine)) break
                    if (/SALDO\s+FINALE/i.test(nextLine)) break

                    // Amount-only line: "40.000,00" or "8,59 -"
                    // Guard: must contain a comma (Italian decimal separator) to be a real amount.
                    // This rejects dates (31.12.2023, 20240215) and ref numbers (0088015775)
                    // that appear on their own line in SDD/bonifico descriptions.
                    const amtMatch = nextLine.match(/^([\d.,]+)\s*(-)?$/)
                    if (amtMatch && amount === 0 && amtMatch[1].includes(',')) {
                        amount = parseItalianNumber(amtMatch[1])
                        isNeg = !!amtMatch[2]
                        continue
                    }

                    // Description continuation
                    desc += ' ' + nextLine
                }

                if (amount > 0) {
                    movements.push({
                        date, valueDate,
                        amount: isNeg ? -amount : amount,
                        description: desc,
                    })
                }
                continue
            }
        } else {
            // === OLD FORMAT (pre-2024) ===
            // Three patterns:
            // 1. Uscita: "DD/MM/YYYY DD/MM/YYYY AMOUNT-" (amount with trailing minus)
            // 2. Entrata inline: "DD/MM/YYYY DD/MM/YYYY Description AMOUNT\tCATEGORY" (tab on same line)
            // 3. Entrata multiline: "DD/MM/YYYY DD/MM/YYYY Description\n...\nAMOUNT\tCATEGORY"

            // Check if this is a date-starting line
            const dateLineMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2})\/(\d{2})\/(\d{4})\s+(.+)/)
            if (dateLineMatch) {
                const date = `${dateLineMatch[1]}/${dateLineMatch[2]}/${dateLineMatch[3]}`
                const valueDate = `${dateLineMatch[4]}/${dateLineMatch[5]}/${dateLineMatch[6]}`
                const rest = dateLineMatch[7]

                // Pattern 1: Uscita — rest is just "AMOUNT-"
                const uscitaInline = rest.match(/^([\d.,]+)-\s*$/)
                if (uscitaInline) {
                    const amount = parseItalianNumber(uscitaInline[1])
                    let desc = ''
                    let category = ''
                    for (let j = i + 1; j < cleanedLines.length && j <= i + 6; j++) {
                        const nextLine = cleanedLines[j].trim()
                        if (!nextLine) continue
                        if (/^\d{2}\/\d{2}\/\d{4}\s+\d{2}\/\d{2}\/\d{4}/.test(nextLine)) break
                        if (/^\d{2}\/\d{2}\/\d{4}\s+SALDO/i.test(nextLine)) break
                        if (/SALDO\s+FINALE/i.test(nextLine)) break
                        // Category line (ALL CAPS, short, no tab)
                        if (/^[A-Z][A-Z./ ']+$/.test(nextLine) && nextLine.length < 40 && !category) {
                            category = nextLine
                        } else {
                            desc += (desc ? ' ' : '') + nextLine
                        }
                    }
                    movements.push({
                        date, valueDate, amount: -amount,
                        description: desc, category: category || undefined,
                    })
                    continue
                }

                // Pattern 2: Entrata inline — rest contains "Description AMOUNT\tCATEGORY"
                // Check if the original (un-trimmed) line has a tab
                const rawLine = cleanedLines[i]
                if (rawLine.includes('\t')) {
                    const tabParts = rawLine.split('\t')
                    const lastPart = tabParts[tabParts.length - 1].trim()
                    // Find amount: look for Italian number just before the tab
                    const beforeTab = tabParts.slice(0, -1).join('\t')
                    const amtInLine = beforeTab.match(/([\d.,]+)\s*(-)?$/)
                    if (amtInLine) {
                        const amount = parseItalianNumber(amtInLine[1])
                        const isNeg = !!amtInLine[2]
                        // Description is everything between dates and the amount
                        const descEnd = beforeTab.lastIndexOf(amtInLine[1])
                        const afterDates = beforeTab.replace(/^\d{2}\/\d{2}\/\d{4}\s+\d{2}\/\d{2}\/\d{4}\s+/, '')
                        const desc = afterDates.substring(0, afterDates.lastIndexOf(amtInLine[1])).trim()
                        const category = /^[A-Z]/.test(lastPart) ? lastPart : ''
                        movements.push({
                            date, valueDate,
                            amount: isNeg ? -amount : amount,
                            description: desc, category: category || undefined,
                        })
                        continue
                    }
                }

                // Pattern 3: Entrata multiline — description starts after dates,
                // amount on a later "AMOUNT\tCATEGORY" line
                let desc = rest.trim()
                let amount = 0
                let isNeg = false
                let category = ''

                for (let j = i + 1; j < cleanedLines.length && j <= i + 8; j++) {
                    const nextLine = cleanedLines[j].trim()
                    const nextRaw = cleanedLines[j]
                    if (!nextLine) continue
                    // Stop at next movement date line or SALDO
                    if (/^\d{2}\/\d{2}\/\d{4}\s+\d{2}\/\d{2}\/\d{4}/.test(nextLine)) break
                    if (/^\d{2}\/\d{2}\/\d{4}\s+SALDO/i.test(nextLine)) break
                    if (/SALDO\s+FINALE/i.test(nextLine)) break

                    // Tab-separated amount + category: "40.000,00\tBONIFICO"
                    if (nextRaw.includes('\t') && amount === 0) {
                        const tabParts = nextRaw.split('\t')
                        const amountPart = tabParts[0].trim()
                        const catPart = tabParts[tabParts.length - 1].trim()
                        const amtMatch = amountPart.match(/^([\d.,]+)\s*(-)?$/)
                        if (amtMatch) {
                            amount = parseItalianNumber(amtMatch[1])
                            isNeg = !!amtMatch[2]
                            if (/^[A-Z]/.test(catPart) && catPart.length < 50) category = catPart
                            continue
                        }
                    }

                    // Category line (ALL CAPS, short, standalone)
                    if (/^[A-Z][A-Z./ ']+$/.test(nextLine) && nextLine.length < 40 && !category) {
                        category = nextLine
                        continue
                    }

                    // Description continuation
                    desc += ' ' + nextLine
                }

                if (amount > 0) {
                    movements.push({
                        date, valueDate,
                        amount: isNeg ? -amount : amount,
                        description: desc, category: category || undefined,
                    })
                }
                continue
            }
        }
    }

    if (!foundSaldoIniziale && !foundSaldoFinale) return null

    const movementsSum = movements.reduce((s, m) => s + m.amount, 0)

    // Parse COMPETENZE section (interessi, numeri, spese)
    const competenze = parseGeneraliCompetenze(fullText) || undefined

    // Extract Giacenza media from ISEE section: "Giacenza media 9.032,40 Euro"
    let giacenzaMedia: number | undefined
    const giacenzaMatch = fullText.match(/Giacenza\s+media\s+([\d.,]+)\s*Euro/i)
    if (giacenzaMatch) {
        giacenzaMedia = parseItalianNumber(giacenzaMatch[1])
    }

    return {
        saldoIniziale, saldoFinale,
        periodStart, periodEnd,
        movements, movementsSum,
        bankDetected,
        accountNumber,
        holder,
        isCC: true as const,
        competenze,
        giacenzaMedia,
    }
}
