import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
// @ts-expect-error pdf-parse doesn't have types
import pdfParse from 'pdf-parse'

const GROQ_API_KEY = process.env.GROQ_API_KEY

// Prompts for AI parsing
const dossierPrompt = `Analizza questo estratto conto dossier titoli bancario e restituisci SOLO un JSON valido con questa struttura:
{
  "type": "DOSSIER",
  "bankName": "Nome della banca",
  "dossierNumber": "Numero dossier",
  "holder": "Nome intestatario",
  "settlementAccount": "IBAN conto regolamento",
  "period": {
    "start": "GG/MM/AAAA",
    "end": "GG/MM/AAAA"
  },
  "initialPortfolio": [{ "isin": "ISIN", "name": "Nome", "quantity": 0, "price": 0, "value": 0 }],
  "finalPortfolio": [{ "isin": "ISIN", "name": "Nome", "quantity": 0, "price": 0, "value": 0 }],
  "transactions": [{ "date": "GG/MM/AAAA", "type": "ACQUISTO/VENDITA", "isin": "ISIN", "name": "Nome", "quantity": 0, "unitPrice": 0, "grossAmount": 0, "fees": 0, "netAmount": 0 }],
  "cashFlows": [{ "date": "GG/MM/AAAA", "type": "DIVIDENDO/CEDOLA", "description": "Descrizione", "grossAmount": 0, "tax": 0, "netAmount": 0 }],
  "costs": { "managementFees": 0, "performanceFees": 0, "transactionCosts": 0, "advisoryFees": 0 }
}

CRITICO: Estrai SOLO dati presenti nel testo. NON inventare valori mancanti.`

const liquidityPrompt = `Analizza questo estratto conto liquidità bancario e restituisci SOLO un JSON valido con questa struttura:
{
  "type": "LIQUIDITY",
  "bankName": "Nome della banca",
  "accountId": "IBAN/Numero conto",
  "holder": "Nome intestatario",
  "period": {
    "start": "GG/MM/AAAA",
    "end": "GG/MM/AAAA"
  },
  "initialBalance": 0,
  "finalBalance": 0,
  "movements": [{ "date": "GG/MM/AAAA", "description": "Descrizione", "amount": 0, "balance": 0 }],
  "summary": { "total_deposits": 0, "total_withdrawals": 0, "stamp_duty_total": 0 }
}`

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData()
        const file = formData.get('file') as File
        const userId = formData.get('userId') as string

        if (!file || !userId) {
            return NextResponse.json({ success: false, error: 'Missing file or userId' }, { status: 400 })
        }

        // Extract text from PDF using pdf-parse
        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        let extractedText = ''
        try {
            const pdfData = await pdfParse(buffer)
            extractedText = pdfData.text || ''
            console.log('Extracted PDF text length:', extractedText.length)
        } catch (pdfError) {
            console.error('PDF parse error:', pdfError)
            return NextResponse.json({ success: false, error: 'Failed to parse PDF' }, { status: 400 })
        }

        if (!extractedText || extractedText.length < 50) {
            return NextResponse.json({ success: false, error: 'Could not extract text from PDF. Is it a scanned document?' }, { status: 400 })
        }

        // Determine document type from content
        const textLower = extractedText.toLowerCase()
        const isDossier = textLower.includes('dossier titoli') || textLower.includes('estratto conto titoli')
        const prompt = isDossier ? dossierPrompt : liquidityPrompt

        let parsed;

        if (GROQ_API_KEY) {
            // Call Groq API for parsing
            const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    messages: [
                        {
                            role: 'system',
                            content: 'Sei un esperto analista finanziario che estrae dati strutturati da documenti bancari italiani. Rispondi SOLO con JSON valido.'
                        },
                        {
                            role: 'user',
                            content: `${prompt}\n\nEcco il testo estratto dal documento:\n\n${extractedText.substring(0, 15000)}`
                        }
                    ],
                    temperature: 0.1,
                    max_tokens: 4000,
                }),
            })

            if (!groqResponse.ok) {
                const errorText = await groqResponse.text()
                console.error('Groq API error:', errorText)
                return NextResponse.json({ success: false, error: 'AI parsing failed: ' + errorText }, { status: 500 })
            }

            const groqData = await groqResponse.json()
            const aiResponse = groqData.choices?.[0]?.message?.content || ''

            try {
                // Extract JSON from potential markdown code blocks
                const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/) || aiResponse.match(/\{[\s\S]*\}/)
                const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : aiResponse
                parsed = JSON.parse(jsonStr)
            } catch (e) {
                console.error("JSON Parse error", e)
                return NextResponse.json({ success: false, error: 'Failed to parse AI response' }, { status: 500 })
            }
        } else {
            return NextResponse.json({ success: false, error: 'Missing GROQ_API_KEY configuration' }, { status: 500 })
        }

        // Removed fallback to mock data as requested
        if (!parsed) {
            return NextResponse.json({ success: false, error: 'Parsing failed completely' }, { status: 500 })
        }


        // Save to Supabase
        const supabase = await createClient()

        const analysisData = {
            document_id: crypto.randomUUID(),
            user_id: userId,
            bank_name: parsed.bankName || 'Banca N/D',
            period_start: parseDate(parsed.period?.start),
            period_end: parseDate(parsed.period?.end),
            account_type: parsed.type || (isDossier ? 'DOSSIER' : 'LIQUIDITY'),
            portfolio_value: isDossier
                ? (parsed.finalPortfolio?.reduce((sum: number, h: { value?: number }) => sum + (h.value || 0), 0) || 0)
                : (parsed.finalBalance || 0),
            initial_value: isDossier
                ? (parsed.initialPortfolio?.reduce((sum: number, h: { value?: number }) => sum + (h.value || 0), 0) || 0)
                : (parsed.initialBalance || 0),
            holdings: parsed.finalPortfolio || [],
            transactions: parsed.transactions || [],
            dividends: parsed.cashFlows || [],
            costs_breakdown: parsed.costs || {},
            benchmark_comparison: parsed.dossierNumber || 'N/D',
        }

        const { data, error } = await supabase
            .from('analyses')
            .insert(analysisData)
            .select()
            .single()

        if (error) {
            console.error('Supabase insert error details:', JSON.stringify(error, null, 2))
            return NextResponse.json({
                success: false,
                error: `Database error: ${error.message || error.code || 'Unknown error'}`,
                details: error
            }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            documentId: data.id,
            fileName: file.name,
            status: 'ready'
        })

    } catch (error) {
        console.error('Parse PDF error:', error)
        return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
    }
}

function parseDate(dateStr: string | undefined): string | null {
    if (!dateStr) return null
    // Handle DD/MM/YYYY format
    const parts = dateStr.split('/')
    if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`
    }
    return dateStr
}
