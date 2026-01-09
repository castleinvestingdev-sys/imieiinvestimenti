import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

export async function POST(request: NextRequest) {
    const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY

    try {
        console.log('\n========== NUOVA RICHIESTA PARSE PDF ==========')
        console.log('Timestamp:', new Date().toISOString())

        const formData = await request.formData()
        const file = formData.get('file') as File
        const userId = formData.get('userId') as string
        const guestEmail = formData.get('guestEmail') as string
        const fileName = file?.name || 'documento.pdf'

        console.log(`\n[SERVER] >>> RICEVUTA RICHIESTA DI ANALISI: ${fileName}`)
        console.log(`[SERVER] UserID: ${userId} | GuestEmail: ${guestEmail} | Size: ${file?.size} bytes`)

        if (!file || (!userId && !guestEmail)) {
            console.error('[SERVER] ERRORE: File, UserId o Email mancante')
            return NextResponse.json({ success: false, error: 'File, UserId o Email mancante' }, { status: 400 })
        }

        if (!GEMINI_API_KEY) {
            console.error('ERRORE: GOOGLE_GEMINI_API_KEY non trovata in process.env')
            return NextResponse.json({
                success: false,
                error: 'Configurazione API Google mancante. Assicurati che GOOGLE_GEMINI_API_KEY sia impostata e riavvia il server.'
            }, { status: 500 })
        }

        console.log(`API Key caricata (lunghezza: ${GEMINI_API_KEY.length})`)
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
        const fileBuffer = await file.arrayBuffer()
        const base64Data = Buffer.from(fileBuffer).toString('base64')

        const systemPrompt = `Sei un esperto analista finanziario italiano specializzato in estratti conto bancari.
Il tuo compito è analizzare il documento fornito (PDF) ed estrarre i dati in un formato JSON rigoroso.

### CLASSIFICAZIONE DEL DOCUMENTO:
- "ESTRATTO CONTO", "CONTO CORRENTE", "E/C" → type = "LIQUIDITY"
- "DOSSIER TITOLI", "ESTRATTO CONTO TITOLI" → type = "DOSSIER"

### REGOLE DI PARSING (CRÉDIT AGRICOLE & GENERALI):
1. **LAYOUT COLONNE**: Spesso il layout è: \`Data | Valuta | DARE (Uscite) | AVERE (Entrate) | Descrizione\`.
   - I numeri nella colonna **DARE** sono **NEGATIVI** (es. Spese, prelievi, bonifici in uscita, investimenti).
   - I numeri nella colonna **AVERE** sono **POSITIVI** (es. Stipendi, bonifici in entrata, dividendi, vendite).
   - IGNORA simboli come \`*\` che precedono i numeri (es. \`* 8,62\` è \`8.62\`).

2. **DETERMINAZIONE SEGNO TRAMITE KEYWORDS (FALLBACK)**:
   Se il layout è ambiguo, usa queste parole chiave nella descrizione per determinare il segno:
   - **NEGATIVO (-)**: "SOTTOSC" (Sottoscrizione Fondi/PAC), "ADDEBITO", "SDD", "BOLLO", "COMMISSIONI", "SPESE", "PREL" (Prelievo), "PAGAMENTO", "BONIFICO A", "V/ORDINE", "PAGAM", "EMESSO".
   - **POSITIVO (+)**: "PENSIONE", "STIPENDIO", "EMOLUMENTI", "DIVIDENDO", "CEDOLA", "ACCREDITO", "BONIFICO DA", "VERSAMENTO", "RIMBORSO".

   **REGOLA DI DEFAULT (CRIRICO)**:
   - Se una transazione è ambigua e NON contiene parole chiave esplicitamente POSITIVE, assumi che sia un'**USCITA (NEGATIVO)**. È statisticamente più probabile nei conti personali.

3. **DESCRIZIONI MULTI-RIGA (FONDAMENTALE)**:
   - Molte transazioni hanno descrizioni che continuano su più righe (righe successive prive di data e importo).
   - **DEVI ASSOLUTAMENTE LEGGERE E CONCATENARE** le righe successive (fino alla prossima data) per trovare keywords come "V/ORDINE" o "ADDEBITO".
   - Esempio: "15.11 ... 332,00 FRIGERI..." seguito da "V/ORDINE E CONTO" -> "V/ORDINE" indica NEGATIVO.

4. **VERIFICA MATEMATICA (OBBLIGATORIA)**:
   - Estrai \`saldo_iniziale\` e \`saldo_finale\` dal documento.
   - Calcola la somma di TUTTI i movimenti estratti.
   - DEVE valere: **Saldo Finale - Saldo Iniziale = Somma Movimenti**.
   - Se non torna, ricontrolla i segni (spesso "SOTTOSC" viene scambiato per positivo, ma è un acquisto -> uscita -> negativo).

### STRUTTURA JSON RICHIESTA:
{
  "type": "DOSSIER" | "LIQUIDITY",
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
      "description": "Descrizione completa", 
      "amount": 0,    // Usa il punto per i decimali. NEGATIVO per uscite.
      "movement_type": "Commissioni" | "Acquisto" | "Vendita" | "Proventi" | "Bonifico" | "Spesa" | "Altro"
    }
  ],
  "summary": {
    "initial_balance": { "value": 0, "source": "extracted" },
    "final_balance": { "value": 0, "source": "extracted" },
    "total_movements_amount": { "value": 0, "source": "calculated" }, // Final - Initial
    "total_commissions": { "value": 0, "source": "calculated" },
    "total_proventi": { "value": 0, "source": "calculated" }
  },
  "finalPortfolio": [],
  "dividends": []
}

Restituisci SOLO il JSON.`

        // Modelli da provare in ordine di priorità
        const models = [
            'gemini-2.0-flash',
            'gemini-1.5-pro',
            'gemini-1.5-flash'
        ]

        let resText = ''
        let success = false
        let lastError = ''
        const maxRetries = 2

        for (const modelName of models) {
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    console.log(`Provando modello Gemini: ${modelName} (tentativo ${attempt}/${maxRetries})`)
                    const model = genAI.getGenerativeModel({
                        model: modelName,
                        generationConfig: {
                            temperature: 0,
                            topP: 1,
                            topK: 1,
                            maxOutputTokens: 8192,
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
                        console.log(`Successo con modello ${modelName}`)
                        break
                    }
                } catch (err: any) {
                    const errMsg = err.message || ''
                    console.error(`Errore con modello ${modelName} (tentativo ${attempt}):`, errMsg)
                    lastError = errMsg

                    // If model not found or not supported, skip immediately
                    if (errMsg.includes('not found') || errMsg.includes('not supported') || errMsg.includes('404')) {
                        console.log(`Modello ${modelName} non disponibile, salto...`)
                        break
                    }

                    // If rate limited, wait before retry
                    if (errMsg.includes('429') || errMsg.includes('rate') || errMsg.includes('quota') || errMsg.includes('Resource')) {
                        const waitTime = attempt * 15000 // 15s, 30s
                        console.log(`Rate limit su ${modelName} - aspetto ${waitTime / 1000}s prima di riprovare...`)
                        await new Promise(resolve => setTimeout(resolve, waitTime))
                    } else {
                        break // Altri errori (es. PDF non valido), prova prossimo modello
                    }
                }
            }
            if (success) break
        }

        if (!success) {
            console.error('Tutti i modelli hanno fallito. Ultimo errore:', lastError)
            return NextResponse.json({ success: false, error: 'Gemini AI fallito: ' + lastError }, { status: 500 })
        }


        // Pulizia JSON
        const jsonMatch = resText.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
            return NextResponse.json({ success: false, error: 'Risposta AI non valida' }, { status: 500 })
        }

        const parsed = JSON.parse(jsonMatch[0])

        if (parsed.type === 'UNOFFICIAL') {
            console.warn(`[SERVER] Documento rifiutato (UNOFFICIAL): ${fileName}`)
            return NextResponse.json({
                success: false,
                error: 'Questo documento non è un estratto conto ufficiale. Per un\'analisi accurata, carica solo gli estratti conto trimestrali o annuali originali della banca.'
            }, { status: 400 })
        }

        const isDossier = parsed.type === 'DOSSIER'
        console.log(`[SERVER] >>> ANALISI COMPLETATA: ${fileName}`)
        console.log(`[SERVER] Classificato come: ${parsed.type} | Bank: ${parsed.info?.bankName} | Account: ${parsed.info?.accountNumber}`)

        // Salvataggio su Supabase
        const supabase = await createClient()

        const analysisData = {
            document_id: crypto.randomUUID(),
            user_id: userId || null,
            bank_name: parsed.info?.bankName || 'Banca N/D',
            period_start: parseDate(parsed.info?.period_start),
            period_end: parseDate(parsed.info?.period_end),
            account_type: parsed.type,
            portfolio_value: isDossier
                ? (parsed.finalPortfolio?.reduce((acc: number, item: any) => acc + (item.marketValue || 0), 0) || 0)
                : (typeof parsed.summary?.final_balance === 'object' ? parsed.summary.final_balance.value : (parsed.summary?.final_balance || 0)),
            initial_value: 0,
            holdings: parsed.finalPortfolio || [],
            transactions: parsed.movements || [],
            dividends: parsed.dividends || [],
            costs_breakdown: {
                ...(parsed.summary || {}),
                settlementAccount: parsed.info?.settlementAccount || null,
                original_ai_data: { ...(parsed.summary || {}) } // Backup for restore
            },
            benchmark_comparison: parsed.info?.accountNumber || 'N/D',
        }

        const { data, error } = await supabase
            .from('analyses')
            .insert(analysisData)
            .select()
            .single()

        if (error) {
            console.error('Errore Database:', error)
            return NextResponse.json({ success: false, error: 'Errore salvataggio database' }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            analysisId: data.id,
            documentId: data.id,
            fileName: file.name,
            status: 'ready'
        })


    } catch (error: any) {
        console.error('\n!!!!! ERRORE CRITICO PARSE PDF !!!!!')
        console.error('Messaggio:', error.message)
        console.error('Stack:', error.stack)
        return NextResponse.json({ success: false, error: error.message || 'Errore interno del server' }, { status: 500 })
    }
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
