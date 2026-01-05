import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData()
        const file = formData.get('file') as File
        const userId = formData.get('userId') as string

        if (!file || !userId) {
            return NextResponse.json({ success: false, error: 'File o UserId mancante' }, { status: 400 })
        }

        if (!GEMINI_API_KEY) {
            return NextResponse.json({ success: false, error: 'Configurazione API Google mancante' }, { status: 500 })
        }

        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
        const fileBuffer = await file.arrayBuffer()
        const base64Data = Buffer.from(fileBuffer).toString('base64')

        const systemPrompt = `Sei un esperto analista finanziario italiano specializzato in estratti conto bancari e dossier titoli.
Il tuo compito è analizzare il documento fornito (PDF) ed estrarre i dati in un formato JSON rigoroso.

### REGOLE FONDAMENTALI (ZERO-HALLUCINATION):
1. **TRASCRIZIONE LETTERALE**: Trascrivi ISIN, Ticker e nomi dei titoli esattamente come appaiono. Non cercare di correggerli o indovinarli.
2. **DATI CERTI**: Se un dato non è chiaramente leggibile o presente, usa null. NON inventare mai numeri o date.
3. **ISIN**: Cerca codici di 12 caratteri (es. IE00B4L5Y983, IT0001234567). Se trovi un ISIN, associalo sempre al titolo corretto.
4. **VALUTA**: Tutti gli importi estratti devono essere trattati come Euro (€), a meno che non sia esplicitamente indicata un'altra valuta.

### STRUTTURA JSON RICHIESTA:
{
  "type": "DOSSIER" | "LIQUIDITY",
  "info": {
    "bankName": "Nome Banca",
    "periodStart": "GG/MM/AAAA",
    "periodEnd": "GG/MM/AAAA",
    "accountNumber": "Numero Conto/Dossier",
    "holder": "Intestatario",
    "settlementAccount": "IBAN Conto Corrente associato (se presente)"
  },
  "finalPortfolio": [
    { "isin": "ISIN", "ticker": "Ticker", "name": "Nome Titolo", "quantity": 0, "marketValue": 0 }
  ],
  "movements": [
    { "date": "GG/MM/AAAA", "type": "ACQUISTO/VENDITA", "isin": "ISIN", "ticker": "Ticker", "quantity": 0, "exchangeValue": 0 }
  ],
  "dividends": [
    { "date": "GG/MM/AAAA", "isin": "ISIN", "ticker": "Ticker", "grossAmount": 0, "tax": 0, "netAmount": 0 }
  ],
  "coupons": [
    { "date": "GG/MM/AAAA", "isin": "ISIN", "ticker": "Ticker", "grossAmount": 0, "tax": 0, "netAmount": 0 }
  ],
  "summary": {
    "liquidity": 0,
    "totalInvested": 0
  }
}

Restituisci SOLO il JSON, senza alcun commento o formattazione markdown esterna.`

        // Modelli da provare in ordine di priorità
        const models = ['gemini-flash-latest', 'gemini-2.0-flash-lite', 'gemini-pro-latest']
        let resText = ''
        let success = false
        let lastError = ''

        for (const modelName of models) {
            try {
                console.log(`Provando modello Gemini: ${modelName}`)
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
                    break
                }
            } catch (err: any) {
                console.error(`Errore con modello ${modelName}:`, err.message)
                lastError = err.message
                continue
            }
        }

        if (!success) {
            return NextResponse.json({ success: false, error: 'Gemini AI failed: ' + lastError }, { status: 500 })
        }

        // Pulizia JSON
        const jsonMatch = resText.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
            return NextResponse.json({ success: false, error: 'Risposta AI non valida' }, { status: 500 })
        }

        const parsed = JSON.parse(jsonMatch[0])
        const isDossier = parsed.type === 'DOSSIER'

        // Salvataggio su Supabase
        const supabase = await createClient()

        const analysisData = {
            document_id: crypto.randomUUID(),
            user_id: userId,
            bank_name: parsed.info?.bankName || 'Banca N/D',
            period_start: parseDate(parsed.info?.periodStart),
            period_end: parseDate(parsed.info?.periodEnd),
            account_type: parsed.type,
            portfolio_value: isDossier
                ? (parsed.finalPortfolio?.reduce((acc: number, item: any) => acc + (item.marketValue || 0), 0) || 0)
                : (parsed.summary?.liquidity || 0),
            initial_value: 0,
            holdings: parsed.finalPortfolio || [],
            transactions: parsed.movements || [],
            dividends: parsed.dividends || [],
            costs_breakdown: {
                ...(parsed.summary || {}),
                settlementAccount: parsed.info?.settlementAccount || null
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
            documentId: data.id,
            fileName: file.name,
            status: 'ready'
        })

    } catch (error: any) {
        console.error('Errore Parse PDF:', error)
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
