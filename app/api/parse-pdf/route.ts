import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as https from 'https'
import crypto from 'crypto'

// Allow up to 5 minutes for OpenAI PDF processing
export const maxDuration = 300

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

function callOpenAI(apiKey: string, model: string, systemPrompt: string, pdfBase64: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const requestBody = JSON.stringify({
            model,
            temperature: 0,
            max_completion_tokens: 128000,
            messages: [
                {
                    role: 'system',
                    content: systemPrompt
                },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: 'Analizza questo documento PDF ed estrai i dati in formato JSON.' },
                        {
                            type: 'file',
                            file: {
                                filename: 'documento.pdf',
                                file_data: `data:application/pdf;base64,${pdfBase64}`
                            }
                        }
                    ]
                }
            ]
        })

        const options = {
            hostname: 'api.openai.com',
            port: 443,
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Content-Length': Buffer.byteLength(requestBody)
            },
        }

        const req = https.request(options, (res) => {
            let data = ''
            res.on('data', (chunk: Buffer) => { data += chunk.toString() })
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const json = JSON.parse(data)
                        const text = json.choices?.[0]?.message?.content || ''
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
        req.setTimeout(240000, () => {
            req.destroy(new Error('Request timeout after 240s'))
        })
        req.write(requestBody)
        req.end()
    })
}

export async function POST(request: NextRequest) {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY

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
        console.log(`👤 UserID: ${userId || 'Guest'} | Email: ${guestEmail || 'N/A'} | Force: ${forceRecalculate} | Reanalyze: ${reanalyzeId || 'no'}`)

        if (!OPENAI_API_KEY) {
            console.error('ERRORE: OPENAI_API_KEY non trovata in process.env')
            return NextResponse.json({
                success: false,
                error: 'Configurazione API OpenAI mancante. Assicurati che OPENAI_API_KEY sia impostata in .env.local e riavvia il server.'
            }, { status: 500 })
        }

        logProgress('API KEY CARICATA', `Lunghezza: ${OPENAI_API_KEY.length}`)

        logProgress('CONVERSIONE PDF', 'Encoding file in base64...')
        const base64Data = pdfBuffer.toString('base64')
        logProgress('PDF CONVERTITO', `${(base64Data.length / 1024).toFixed(0)}KB base64`)

        const systemPrompt = `Analista finanziario italiano. Estrai dati da PDF bancari in JSON rigoroso.

### 1. CLASSIFICAZIONE
- "ESTRATTO CONTO"/"CONTO CORRENTE"/"E/C" → type="LIQUIDITY"
- "DOSSIER TITOLI"/"ESTRATTO CONTO TITOLI" → type="DOSSIER"
- Normalizza banca al nome ufficiale (Intesa Sanpaolo, UniCredit, Banco BPM, BPER, MPS, Crédit Agricole Italia, BNL, Credem, Mediolanum, FinecoBank, Banca Generali, Azimut, CheBanca!, Banca Sella, Pop. Sondrio, Banco Desio, Banca Asti, Passadore, Cassa Risp. Bolzano, Volksbank, Banca Piemonte, Carige, Ifis, Illimity, Progetto, CF+, Sistema, Valsabbina, Cassa Centrale, Raiffeisen, Cassa Rurale, BCC, Iccrea, Deutsche Bank Italia, ING, N26, Revolut, Widiba, Webank, Buddybank, BBVA, Santander, Aletti, Euromobiliare, Fideuram, Sanpaolo Invest, IW Bank)

### 2. PERIODO
- LIQUIDITY: period_start=data SALDO INIZIALE, period_end=data SALDO FINALE (dalla tabella movimenti, NON intestazione). Può essere mensile/bimestrale/trimestrale.
- DOSSIER: da "PERIODO RENDICONTATO" o frontespizio.

### 3. LAYOUT E SEGNI (priorità decrescente)
1. Colonne DARE/AVERE separate → DARE=negativo, AVERE=positivo
2. Segno esplicito +/- → leggi direttamente
3. Keywords: NEGATIVO=ADDEBITO,SDD,BOLLO,COMMISSIONI,SPESE,PRELIEVO,PAGAMENTO,BONIFICO A FAVORE,SOTTOSC,MAV,RAV,F24,CANONE | POSITIVO=ACCREDITO,STIPENDIO,PENSIONE,DIVIDENDO,CEDOLA,BONIFICO DA,VERSAMENTO,RIMBORSO,STORNO
4. Verifica matematica: scegli segno che fa tornare SaldoFinale-SaldoIniziale=SommaMovimenti
- Crédit Agricole: SEMPRE due colonne DARE(sx)=negativo / AVERE(dx)=positivo

### 4. CLASSIFICAZIONE movement_type (5 categorie)
- **"Commissioni"**: costi bancari + imposte (commissioni, spese E/C, canoni, bolli, ritenute, Tobin Tax, competenze fruttifere). NON include: pensione, stipendio, affitto, bollette, bonifici, prelievi, rimborsi>20€
- **"Acquisto"**: sottoscrizione fondi, PAC, acquisto titoli
- **"Vendita"**: riscatto fondi, vendita titoli, rimborso quote
- **"Proventi"**: cedole, dividendi
- **"Altro"**: tutto il resto (bonifici, pensioni, stipendi, utenze, prelievi)

### 5. ESTRAZIONE MOVIMENTI
- Estrai OGNI riga, anche con stessa data/importo (sono transazioni diverse). NO deduplicazione.
- Leggi TUTTE le pagine. Concatena descrizioni multi-riga.
- Numeri: "1.234,56"→1234.56 (punto=migliaia, virgola=decimale). Date: restituisci GG/MM/AAAA.
- Validazione: se abs(SaldoFinale-SaldoIniziale-SommaMovimenti)>0.01€ → hai sbagliato segni, correggi.
- "BONIFICO A VOSTRO FAVORE" da fondi/SGR = "Altro", NON "Vendita".

### 6. DATI SCALARI (COMPETENZE - solo LIQUIDITY)
Da "CONTO SCALARE": numeri_creditori e numeri_debitori (ULTIMO periodo, non sommare periodi diversi).
Da "INTERESSI CREDITORI": conta righe con DATA nella colonna Decorrenza.
- 1 riga con data → interessi_attivi_lordi = "Totale lordo"
- 2+ righe con data → interessi_attivi_lordi = valore Interessi dell'ULTIMA riga con data (NON il Totale lordo che è la somma!)
- interessi_creditori_periodi: array di {data, interessi} per OGNI riga con data
- interessi_passivi_lordi: "Totale lordo" interessi debitori
- tasso_attivo/passivo: dalla colonna TASSO
- Movimenti titoli in LIQUIDITY: conta acquisti (ACQ/SOTTOSC/PAC) e vendite (VEND/RISCATTO/DISINV). RIMBORSO=vendita solo se seguito da FONDI/SICAV/QUOTE/ETF/OBBLIG. CEDOLA/DIVIDENDO=Proventi, non vendite.

### 7. PORTAFOGLIO (solo DOSSIER)
Estrai TUTTI i titoli da TUTTE le sezioni (Azioni, Obbligazioni, Fondi/OICR, SICAV, ETF, Certificates, GPM, Polizze) e TUTTE le pagine.
- portfolio_total_extracted: "CONTROVALORE TOTALE APPARENTE"
- Per ogni titolo: isin, name (esattamente dal PDF), currency, exchangeRate (1 se EUR), quantity, price, marketValue, assetType (Azione/Obbligazione/Fondo/ETF/Altro)
- VERIFICA: somma marketValue ≈ portfolio_total_extracted (tolleranza <1%). Se minore, hai perso titoli.
- NUMERI ITALIANI: "1.000,000"=1000 (punto=migliaia!), "5.000"=5000, "28.355,00"=28355. Se qty×price≠marketValue, probabilmente qty è sbagliata.
- Titoli in default: marketValue=0, price=0. Nomi esattamente dal PDF.

### 8. MOVIMENTI TITOLI (solo DOSSIER)
Keywords ACQUISTO: ACQUISTO, ACQ, CARICO, SOTTOSCRIZIONE, VERSAMENTO QUOTE, CONFERIMENTO, PAC, NOTA INF. ACQ., SWITCH IN, INVESTIMENTO
Keywords VENDITA: VENDITA, VEND, SCARICO, RISCATTO, RIMBORSO, LIQUIDAZIONE, DISINVESTIMENTO, NOTA INF. VEND., SWITCH OUT, PRELIEVO QUOTE, CONFERIMENTO A GPM
OPERAZIONI STRAORDINARIE: RAGGRUPPAMENTO (qty negativa=Vendita, positiva=Acquisto), VERSAMENTO VALORI (=Acquisto), FRAZIONAMENTO/SPLIT, CONCAMBIO/CONVERSIONE. Spesso price=0, netAmount=0. FONDAMENTALE estrarre: influenzano saldi quantità.
Per ogni movimento: isin, date(DD/MM/YYYY), name, operationType("Acquisto"|"Vendita"), quantity(positivo), price, exchangeRate(1 se EUR), currency, grossAmount(qty×price×exRate), fees, taxes, netAmount.
Se fees/taxes non nel PDF → lascia 0.
NUMERI ITALIANI: "6.000"=6000, "84.000"=84000, "1.000"=1000 (punto=migliaia!).

### STRUTTURA JSON:
{"type":"DOSSIER"|"LIQUIDITY","layout_detected":"two_columns_dare_avere"|"single_column_with_sign"|"single_column_no_sign"|"other","info":{"bankName":"","accountNumber":"","period_start":"YYYY-MM-DD","period_end":"YYYY-MM-DD","holder":"","settlementAccount":"(DOSSIER: Conto Regolamento/C/EURO; LIQUIDITY: IBAN)"},"scalar_data":{"numeri_creditori":0,"numeri_debitori":0,"interessi_attivi_lordi":0,"interessi_passivi_lordi":0,"interessi_creditori_periodi":[{"data":"GG/MM/AAAA","interessi":0}],"tasso_attivo":"0%","tasso_passivo":"0%","acquisto_titoli_count":0,"vendita_titoli_count":0,"movimenti_titoli_count":0,"acquisto_titoli_amount":0,"vendita_titoli_amount":0},"movements":[{"date":"GG/MM/AAAA","description":"","amount":0,"sign_source":"column_position"|"explicit_sign"|"keyword"|"math_verification","movement_type":"Commissioni"|"Acquisto"|"Vendita"|"Proventi"|"Altro"}],"summary":{"initial_balance":{"value":0,"source":"extracted"},"final_balance":{"value":0,"source":"extracted"},"total_movements_amount":{"value":0,"source":"calculated"},"total_commissions":{"value":0,"source":"calculated"},"total_proventi":{"value":0,"source":"calculated"},"math_verification":{"expected_delta":0,"actual_sum":0,"matches":true},"portfolio_total_extracted":0,"portfolio_currency":"EUR"},"finalPortfolio":[{"isin":"","name":"","assetType":"Fondo","currency":"EUR","exchangeRate":1,"quantity":0,"price":0,"marketValue":0}],"securityMovements":[{"isin":"","date":"DD/MM/YYYY","name":"","operationType":"Acquisto"|"Vendita","quantity":0,"price":0,"exchangeRate":1,"currency":"EUR","grossAmount":0,"fees":0,"taxes":0,"netAmount":0}],"dividends":[]}

Restituisci SOLO il JSON, nessun altro testo.`;

        const modelName = 'gpt-5-nano'
        const maxRetries = 3

        let resText = ''
        let success = false
        let lastError = ''

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                logProgress('CHIAMATA OPENAI', `Tentativo ${attempt}/${maxRetries} con ${modelName}`)
                resText = await callOpenAI(OPENAI_API_KEY, modelName, systemPrompt, base64Data)
                logProgress('RISPOSTA RICEVUTA', `${resText.length} caratteri da OpenAI`)

                if (resText && resText.length > 10) {
                    success = true
                    break
                }
            } catch (err: any) {
                const errMsg = err.message || ''
                lastError = errMsg
                console.error(`[OPENAI ERROR] Attempt ${attempt}/${maxRetries}: ${errMsg}`)

                if (errMsg.includes('not found') || errMsg.includes('404')) {
                    break
                }

                const isRateLimit = errMsg.includes('429') || errMsg.includes('rate') || errMsg.includes('quota') || errMsg.includes('Resource')
                const isNetworkError = errMsg.includes('ECONNRESET') || errMsg.includes('ETIMEDOUT') || errMsg.includes('socket hang up') || errMsg.includes('timeout')
                const isServerError = errMsg.includes('500') || errMsg.includes('502') || errMsg.includes('503') || errMsg.includes('Internal Server Error')

                if (isRateLimit) {
                    const waitTime = Math.pow(2, attempt) * 30000 // 60s, 120s, 240s
                    logProgress('⏳ RATE LIMIT', `Attendo ${waitTime/1000}s prima del prossimo tentativo`)
                    await new Promise(resolve => setTimeout(resolve, waitTime))
                } else if (isServerError) {
                    const waitTime = attempt * 10000 // 10s, 20s, 30s
                    logProgress('🔥 SERVER ERROR', `${errMsg.substring(0, 80)}, riprovo tra ${waitTime/1000}s`)
                    await new Promise(resolve => setTimeout(resolve, waitTime))
                } else if (isNetworkError) {
                    const waitTime = attempt * 15000
                    logProgress('🔌 ERRORE RETE', `Riprovo tra ${waitTime/1000}s`)
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

        if (!success) {
            console.error('Tutti i modelli hanno fallito. Ultimo errore:', lastError)
            return NextResponse.json({ success: false, error: 'OpenAI GPT fallito: ' + lastError }, { status: 500 })
        }

        // Parse JSON from response (single attempt with repair fallback)
        logProgress('PARSING JSON', 'Estrazione dati dalla risposta AI')
        let parsed = null
        let jsonError = ''

        try {
            const jsonMatch = resText.match(/\{[\s\S]*\}/)
            if (!jsonMatch) {
                throw new Error('Risposta AI non valida - nessun JSON trovato')
            }

            try {
                parsed = JSON.parse(jsonMatch[0])
                logProgress('✅ JSON PARSED', 'Parsing completato')
            } catch {
                logProgress('🔧 RIPARAZIONE JSON', 'Tentativo di riparazione JSON troncato')
                const repaired = repairTruncatedJson(jsonMatch[0])
                if (repaired) {
                    parsed = JSON.parse(repaired)
                    logProgress('✅ JSON RIPARATO', 'Riparazione completata con successo')
                } else {
                    throw new Error('JSON non riparabile')
                }
            }
        } catch (parseErr: any) {
            jsonError = parseErr.message
            console.error(`JSON parse fallito: ${jsonError}`)
        }

        if (!parsed) {
            return NextResponse.json({ success: false, error: 'Parsing JSON fallito: ' + jsonError }, { status: 500 })
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
        logProgress('✅ ANALISI COMPLETATA', fileName)
        console.log(`📋 Tipo: ${parsed.type} | 🏦 Banca: ${parsed.info?.bankName} | 💳 Conto: ${parsed.info?.accountNumber}`)

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
                        const retryText = await callOpenAI(OPENAI_API_KEY!, modelName, phaseAPrompt, base64Data)
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

        if (!forceRecalculate && !isReanalysis && userId && periodStart && periodEnd && accountNumber) {
            logProgress('CHECK DUPLICATI', 'Verifico periodo già caricato')
            // Query per periodo senza filtro account esatto (il numero può variare tra PDF)
            const { data: existingAnalyses } = await supabase
                .from('analyses')
                .select('id, period_start, period_end, benchmark_comparison')
                .eq('user_id', userId)
                .eq('period_start', periodStart)
                .eq('period_end', periodEnd)
                .is('deleted_at', null)

            // Match normalizzato: gestisce prefissi filiale variabili (es. "19812/3100/1000811" vs "3100/1000811")s
            const normalizedNew = normalizeAccountNumber(accountNumber)
            const existingAnalysis = existingAnalyses?.find(a =>
                normalizeAccountNumber(a.benchmark_comparison || '') === normalizedNew
            )

            if (existingAnalysis) {
                logProgress('⚠️ DUPLICATO RILEVATO', `Periodo ${periodStart} - ${periodEnd} già presente`)
                return NextResponse.json({
                    success: false,
                    isDuplicate: true,
                    existingAnalysisId: existingAnalysis.id,
                    message: `Hai già caricato questo periodo (${new Date(periodStart).toLocaleDateString('it-IT')} - ${new Date(periodEnd).toLocaleDateString('it-IT')}) per questo conto.`,
                    period: { start: periodStart, end: periodEnd, account: accountNumber }
                }, { status: 409 }) // 409 Conflict
            }
        } else if (forceRecalculate || isReanalysis) {
            logProgress('🔄 RICALCOLO FORZATO', `Skip check duplicati (${isReanalysis ? 'ri-analisi' : 'richiesto dall\'utente'})`)
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
                            const targetedText = await callOpenAI(
                                OPENAI_API_KEY!, modelName, phaseBPrompt, base64Data
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
            const costsCalculated = grossAmount > 0 && netAmount !== 0
                ? Math.abs(Math.abs(netAmount) - grossAmount)
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
