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

        const systemPrompt = `Sei un esperto analista finanziario italiano specializzato in estratti conto bancari e dossier titoli.
Il tuo compito è analizzare il documento fornito (PDF) ed estrarre i dati in un formato JSON rigoroso.

### CLASSIFICAZIONE DEL DOCUMENTO (CRITICO):
**PRIMA DI TUTTO**, determina il tipo di documento guardando l'INTESTAZIONE/TITOLO del documento:
- Se il titolo dice "ESTRATTO CONTO", "CONTO CORRENTE", "E/C" o "RIEPILOGO MOVIMENTI" → type = "LIQUIDITY"
- Se il titolo dice "ESTRATTO CONTO TITOLI" o "DOSSIER TITOLI" → type = "DOSSIER"
- Se il titolo dice "RIEPILOGO SALDI", "POSIZIONE TITOLI", "SITUAZIONE PORTAFOGLIO" o contiene esplicitamente "NON UFFICIALE" → type = "UNOFFICIAL"

**ATTENZIONE**: Un estratto conto di LIQUIDITÀ può contenere riferimenti a titoli nelle causali dei movimenti. Il tipo dipende SOLO dall'intestazione.

### REGOLE FONDAMENTALI:
1. **STRINGHE SPECIFICHE**: Usa "non trovato" se un dato manca.
2. **TRASCRIZIONE LETTERALE**: Trascrivi ISIN e Ticker esattamente.
3. **ISIN**: Cerca codici di 12 caratteri (es. IE00B4L5Y983).
4. **DATE (CRITICO)**: Rispettare rigorosamente il periodo del documento (mese singolo o trimestre).

### GESTIONE MOVIMENTI E SEGNI (CRITICO):
5. **DARE / AVERE**:
   - Colonne "Movimenti DARE", "ADDEBITI", "USCITE" o segni "-": Sono valori **NEGATIVI**.
   - Colonne "Movimenti AVERE", "ACCREDITI", "ENTRATE": Sono valori **POSITIVI**.
   - **IMPORTANTE**: Spesso i PDF hanno colonne separate per Dare/Avere. Devi identificare in quale colonna si trova l'importo e attribuire il segno corretto.
   
6. **DESCRIZIONI MULTI-RIGA**:
   - Molte transazioni hanno descrizioni che continuano su più righe (righe successive prive di data e importo).
   - **DEVI CONCATENARE** queste righe alla descrizione della transazione principale immediatamente sopra. Non ignorarle e non creare transazioni vuote.

### VERIFICA MATEMATICA (OBBLIGATORIA):
7. **CONSISTENZA DEI SALDI**:
   - Estrai **Saldo Iniziale** e **Saldo Finale**.
   - Calcola la somma algebrica di TUTTI i movimenti estratti.
   - LA REGOLA È: **Saldo Finale - Saldo Iniziale = Somma Movimenti**.
   - Se i conti non tornano, significa che hai perso dei movimenti o invertito dei segni. **RICONTROLLA E CORREGGI** prima di generare l'output.

### REGOLE DI RIEPILOGO (SUMMARY):
8. **LIQUIDITY SUMMARY**:
   - **calculate_movements**: Ricalcola sempre il totale movimenti sommando quelli che hai estratto (per verifica).
   - **Saldo Iniziale/Finale**: Usa "extracted" se li leggi esplicitamente dal documento.

### CONTESTO FILENAME: "${fileName}"

### STRUTTURA JSON RICHIESTA:
{
  "type": "DOSSIER" | "LIQUIDITY",
  "info": {
    "bankName": "Nome Banca",
    "accountNumber": "Numero Conto/Dossier",
    "period_start": "YYYY-MM-DD",
    "period_end": "YYYY-MM-DD",
    "holder": "Intestatario",
    "settlementAccount": "IBAN Conto Corrente associato"
  },
  "initialPortfolio": [
    { "isin": "string", "ticker": "string", "quantity": "da calcolare" }
  ],
  "movements": [
    { 
      "date": "GG/MM/AAAA", 
      "description": "Descrizione completa (concatenata)", 
      "movement_type": "Commissioni" | "Acquisto" | "Vendita" | "Proventi" | "Bonifico" | "Spesa" | "Altro",
      "amount": 0,
      "isin": "string", 
      "ticker": "string", 
      "quantity": 0, 
      "exchangeValue": 0 
    }
  ],
  
  "calculation_notes": "Spiega qui se la verifica (Finale - Iniziale) ha avuto successo o se hai dovuto correggere qualcosa.",
  "finalPortfolio": [
    { "isin": "string", "ticker": "string", "quantity": 0, "marketValue": 0 }
  ],
  "dividends": [
    { "date": "GG/MM/AAAA", "isin": "string", "ticker": "string", "grossAmount": 0, "tax": 0, "netAmount": 0 }
  ],
  "coupons": [
    { "date": "GG/MM/AAAA", "isin": "string", "ticker": "string", "grossAmount": 0, "tax": 0, "netAmount": 0 }
  ],
  "titles": [
    { "isin": "string", "ticker": "string", "name": "Nome Titolo" }
  ],
  "summary": {
    "initial_balance": { "value": 0, "source": "extracted" | "calculated" },
    "final_balance": { "value": 0, "source": "extracted" | "calculated" },
    "total_movements_amount": { "value": 0, "source": "extracted" | "calculated" },
    "total_commissions": { "value": 0, "source": "extracted" | "calculated" },
    "total_proventi": { "value": 0, "source": "extracted" | "calculated" },
    "securities_movements_count": { "value": 0, "source": "extracted" | "calculated" },
    "securities_net_amount": { "value": 0, "source": "extracted" | "calculated" }
  }
}

Restituisci SOLO il JSON.`

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
            guest_email: guestEmail || null,
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
