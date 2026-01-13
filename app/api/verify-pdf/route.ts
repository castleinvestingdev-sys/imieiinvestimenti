import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

export async function POST(request: NextRequest) {
    const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY

    try {
        const formData = await request.formData()
        const file = formData.get('file') as File
        const fileName = file?.name || 'documento.pdf'

        if (!file) {
            return NextResponse.json({ success: false, error: 'File mancante' }, { status: 400 })
        }

        if (!GEMINI_API_KEY) {
            return NextResponse.json({
                success: false,
                error: 'Configurazione API Google mancante.'
            }, { status: 500 })
        }

        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
        const fileBuffer = await file.arrayBuffer()
        const base64Data = Buffer.from(fileBuffer).toString('base64')

        const systemPrompt = `Sei un esperto analista finanziario italiano specializzato in estratti conto bancari.
Il tuo compito è analizzare il documento PDF ed estrarre i dati in formato JSON rigoroso.

### FASE 1: CLASSIFICAZIONE DEL DOCUMENTO
- "ESTRATTO CONTO", "CONTO CORRENTE", "E/C" → type = "LIQUIDITY"
- "DOSSIER TITOLI", "ESTRATTO CONTO TITOLI" → type = "DOSSIER"

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

### FASE 4: ESTRAZIONE MOVIMENTI

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

### FASE 5: VALIDAZIONE FINALE (OBBLIGATORIA - ESEGUI SEMPRE)
Prima di restituire il JSON:
1. Calcola: expected_delta = Saldo Finale - Saldo Iniziale
2. Calcola: actual_sum = Somma di tutti i movimenti.amount
3. Se abs(expected_delta - actual_sum) > 0.01€:
   - HAI SBAGLIATO I SEGNI DI UNO O PIÙ MOVIMENTI
   - Calcola: errore = (expected_delta - actual_sum) / 2
   - Cerca il movimento con importo ≈ abs(errore) e INVERTI IL SUO SEGNO
   - Ripeti finché expected_delta ≈ actual_sum

**CASO COMUNE DI ERRORE**: I "RIMBORSO" o "ACCREDITO" o "VERSAMENTO" in colonna AVERE sono POSITIVI ma spesso vengono erroneamente marcati negativi. Se il calcolo non torna, verifica questi movimenti.

### STRUTTURA JSON RICHIESTA:
{
  "type": "DOSSIER" | "LIQUIDITY",
  "layout_detected": "two_columns_dare_avere" | "single_column_with_sign" | "single_column_no_sign" | "other",
  "info": {
    "bankName": "Nome Banca",
    "accountNumber": "Numero Conto",
    "period_start": "YYYY-MM-DD",
    "period_end": "YYYY-MM-DD",
    "holder": "Intestatario",
    "settlementAccount": "IBAN"
  },
  "movements": [
    {
      "date": "GG/MM/AAAA",
      "description": "Descrizione completa concatenata",
      "amount": 0,
      "sign_source": "column_position" | "explicit_sign" | "keyword" | "math_verification",
      "movement_type": "Commissioni" | "Acquisto" | "Vendita" | "Proventi" | "Bonifico" | "Spesa" | "Altro"
    }
  ],
  "summary": {
    "initial_balance": { "value": 0, "source": "extracted" },
    "final_balance": { "value": 0, "source": "extracted" },
    "total_movements_amount": { "value": 0, "source": "calculated" },
    "total_commissions": { "value": 0, "source": "calculated" },
    "total_proventi": { "value": 0, "source": "calculated" },
    "math_verification": { "expected_delta": 0, "actual_sum": 0, "matches": true }
  },
  "finalPortfolio": [],
  "dividends": []
}

Restituisci SOLO il JSON, nessun altro testo.`

        // Usa solo gemini-3-flash-preview
        const models = [
            'gemini-3-flash-preview'
        ]

        let resText = ''
        let success = false
        let lastError = ''
        const maxRetries = 2

        for (const modelName of models) {
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    const model = genAI.getGenerativeModel({
                        model: modelName,
                        generationConfig: {
                            temperature: 0,
                            topP: 1,
                            topK: 1,
                            maxOutputTokens: 65536, // Larger output for complex PDFs
                            responseMimeType: 'application/json', // Force valid JSON output
                        }
                    })

                    const result = await model.generateContent([
                        systemPrompt,
                        {
                            inlineData: {
                                data: base64Data,
                                mimeType: 'application/pdf'
                            }
                        }
                    ])

                    const response = await result.response
                    resText = response.text()

                    if (resText && resText.length > 10) {
                        success = true
                        break
                    }
                } catch (err: any) {
                    const errMsg = err.message || ''
                    lastError = errMsg

                    if (errMsg.includes('not found') || errMsg.includes('not supported') || errMsg.includes('404')) {
                        break
                    }

                    if (errMsg.includes('429') || errMsg.includes('rate') || errMsg.includes('quota') || errMsg.includes('Resource')) {
                        const waitTime = attempt * 15000
                        await new Promise(resolve => setTimeout(resolve, waitTime))
                    } else {
                        break
                    }
                }
            }
            if (success) break
        }

        if (!success) {
            return NextResponse.json({ success: false, error: 'Gemini AI fallito: ' + lastError }, { status: 500 })
        }

        // Funzione per riparare JSON troncato
        function repairTruncatedJson(jsonStr: string): string | null {
            // Remove any trailing incomplete strings
            let repaired = jsonStr

            // Count open brackets
            let openBraces = 0
            let openBrackets = 0
            let inString = false
            let lastValidPos = 0

            for (let i = 0; i < repaired.length; i++) {
                const char = repaired[i]
                const prevChar = i > 0 ? repaired[i - 1] : ''

                if (char === '"' && prevChar !== '\\') {
                    inString = !inString
                }

                if (!inString) {
                    if (char === '{') openBraces++
                    else if (char === '}') openBraces--
                    else if (char === '[') openBrackets++
                    else if (char === ']') openBrackets--

                    // Track last valid position (complete value)
                    if (char === ',' || char === '{' || char === '[' || char === '}' || char === ']') {
                        lastValidPos = i
                    }
                }
            }

            // If we're inside a string, truncate to before the string started
            if (inString) {
                // Find the last quote and remove from there
                const lastQuote = repaired.lastIndexOf('"')
                if (lastQuote > 0) {
                    repaired = repaired.substring(0, lastQuote)
                    // Remove the key if it's incomplete (e.g., "key":)
                    repaired = repaired.replace(/,?\s*"[^"]*"?\s*:?\s*$/, '')
                }
            }

            // If still unbalanced, try to close properly
            // Recount after potential truncation
            openBraces = 0
            openBrackets = 0
            inString = false

            for (let i = 0; i < repaired.length; i++) {
                const char = repaired[i]
                const prevChar = i > 0 ? repaired[i - 1] : ''

                if (char === '"' && prevChar !== '\\') {
                    inString = !inString
                }

                if (!inString) {
                    if (char === '{') openBraces++
                    else if (char === '}') openBraces--
                    else if (char === '[') openBrackets++
                    else if (char === ']') openBrackets--
                }
            }

            // Remove trailing comma if present
            repaired = repaired.replace(/,\s*$/, '')

            // Close any unclosed brackets/braces
            while (openBrackets > 0) {
                repaired += ']'
                openBrackets--
            }
            while (openBraces > 0) {
                repaired += '}'
                openBraces--
            }

            return repaired
        }

        // Pulizia JSON con retry per errori di parsing
        const maxJsonRetries = 6
        let parsed = null
        let jsonError = ''
        const retryModels = ['gemini-3-flash-preview']

        for (let jsonAttempt = 1; jsonAttempt <= maxJsonRetries; jsonAttempt++) {
            try {
                const jsonMatch = resText.match(/\{[\s\S]*\}/)
                if (!jsonMatch) {
                    throw new Error('Risposta AI non valida - nessun JSON trovato')
                }

                let jsonToParse = jsonMatch[0]

                // Try direct parse first
                try {
                    parsed = JSON.parse(jsonToParse)
                    break
                } catch (directParseErr) {
                    // Try to repair truncated JSON
                    const repaired = repairTruncatedJson(jsonToParse)
                    if (repaired) {
                        parsed = JSON.parse(repaired)
                        break
                    }
                    throw directParseErr
                }
            } catch (parseErr: any) {
                jsonError = parseErr.message
                if (jsonAttempt < maxJsonRetries) {
                    // Retry with a different model with larger output context
                    const retryModel = retryModels[(jsonAttempt - 1) % retryModels.length]
                    const retryTemp = jsonAttempt <= 2 ? 0 : 0.1 // Use 0 temp for first retries
                    try {
                        const model = genAI.getGenerativeModel({
                            model: retryModel,
                            generationConfig: {
                                temperature: retryTemp,
                                topP: 1,
                                topK: 1,
                                maxOutputTokens: 65536,
                                responseMimeType: 'application/json',
                            }
                        })

                        const result = await model.generateContent([
                            systemPrompt,
                            {
                                inlineData: {
                                    data: base64Data,
                                    mimeType: 'application/pdf'
                                }
                            }
                        ])

                        const response = await result.response
                        resText = response.text()
                    } catch {
                        // Ignore retry errors, will fail on next parse attempt
                    }
                }
            }
        }

        if (!parsed) {
            return NextResponse.json({ success: false, error: jsonError }, { status: 500 })
        }

        // Ensure summary exists and calculate missing values
        if (!parsed.summary) {
            parsed.summary = {}
        }

        // Auto-correct signs if math doesn't match
        const movements = parsed.movements || []
        const initialBalance = parsed.summary.initial_balance?.value || 0
        const finalBalance = parsed.summary.final_balance?.value || 0
        const expectedDelta = finalBalance - initialBalance

        let currentSum = movements.reduce((sum: number, m: any) => sum + (m.amount || 0), 0)

        // Auto-correct signs: try to fix errors by flipping transactions
        const MAX_CORRECTIONS = 20
        let corrections = 0
        const flippedIndices = new Set<number>()

        while (Math.abs(currentSum - expectedDelta) > 0.01 && corrections < MAX_CORRECTIONS) {
            const error = currentSum - expectedDelta
            const targetFlipAmount = Math.abs(error / 2)

            // Find the movement closest to the target flip amount (that hasn't been flipped yet)
            let bestMatch = -1
            let bestDiff = Infinity

            for (let i = 0; i < movements.length; i++) {
                if (flippedIndices.has(i)) continue // Don't flip same transaction twice
                const absAmount = Math.abs(movements[i].amount || 0)
                const diff = Math.abs(absAmount - targetFlipAmount)
                if (diff < bestDiff) {
                    bestDiff = diff
                    bestMatch = i
                }
            }

            // More aggressive tolerance: 50% of target or diff < 10€
            if (bestMatch >= 0 && (bestDiff < targetFlipAmount * 0.5 || bestDiff < 10)) {
                movements[bestMatch].amount = -movements[bestMatch].amount
                movements[bestMatch].sign_source = 'auto_corrected'
                flippedIndices.add(bestMatch)
                currentSum = movements.reduce((sum: number, m: any) => sum + (m.amount || 0), 0)
            } else {
                break
            }

            corrections++
        }

        const calculatedTotal = movements.reduce((sum: number, m: any) => sum + (m.amount || 0), 0)
        const calculatedCommissions = movements
            .filter((m: any) => m.movement_type === 'Commissioni')
            .reduce((sum: number, m: any) => sum + Math.abs(m.amount || 0), 0)
        const calculatedProventi = movements
            .filter((m: any) => m.movement_type === 'Proventi' || m.movement_type === 'Dividendo')
            .reduce((sum: number, m: any) => sum + (m.amount || 0), 0)

        // ALWAYS use calculated total after potential auto-corrections
        parsed.summary.total_movements_amount = { value: calculatedTotal, source: 'calculated' }
        if (!parsed.summary.total_commissions) {
            parsed.summary.total_commissions = { value: calculatedCommissions, source: 'calculated' }
        }
        if (!parsed.summary.total_proventi) {
            parsed.summary.total_proventi = { value: calculatedProventi, source: 'calculated' }
        }

        // If initial/final balance are missing, try to calculate them from movements
        if (!parsed.summary.initial_balance) {
            parsed.summary.initial_balance = { value: 0, source: 'missing' }
        }
        if (!parsed.summary.final_balance) {
            const initial = parsed.summary.initial_balance?.value || 0
            parsed.summary.final_balance = { value: initial + calculatedTotal, source: 'calculated' }
        }

        // Return parsed data directly without saving to database
        return NextResponse.json({
            success: true,
            fileName: fileName,
            data: parsed
        })

    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message || 'Errore interno del server' }, { status: 500 })
    }
}
