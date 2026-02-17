/**
 * Test OCR transcription for scanned PDFs (Intesa Sanpaolo)
 *
 * Usage: npx tsx scripts/test-ocr-transcription.ts [pdf-path]
 */
import * as fs from 'fs'
import * as https from 'https'
import { extractPortfolioFromText } from '../lib/pdf-text-parser'

const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY

if (!GEMINI_API_KEY) {
    console.error('Missing GOOGLE_GEMINI_API_KEY env var')
    process.exit(1)
}

function callGeminiTranscriber(apiKey: string, pdfBase64: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const ocrModel = 'gemini-2.0-flash'

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

        console.log(`[OCR] Sending to ${ocrModel} (${(Buffer.byteLength(requestBody) / 1024 / 1024).toFixed(1)}MB)...`)

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
            console.log(`[OCR] Status: ${res.statusCode}`)
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

async function main() {
    const pdfPath = process.argv[2] || '/Users/leon/Desktop/banche EC/BANCA INTESA/BANCA INTESA/Dossier titoli/20241231 Situazione deposito titoli.pdf'

    console.log(`\n=== TEST OCR TRANSCRIPTION ===`)
    console.log(`PDF: ${pdfPath}`)

    const pdfBuffer = fs.readFileSync(pdfPath)
    const base64Data = pdfBuffer.toString('base64')
    console.log(`PDF size: ${(pdfBuffer.length / 1024).toFixed(0)}KB`)

    // Step 1: Try pdf-parse text extraction
    console.log(`\n--- Step 1: pdf-parse text extraction ---`)
    try {
        const { PDFParse } = await import('pdf-parse')
        const parser = new PDFParse(new Uint8Array(pdfBuffer))
        const textResult = await parser.getText()
        const text = textResult.text || ''
        console.log(`pdf-parse text: ${text.length} chars`)
        if (text.length > 0 && text.length < 500) {
            console.log(`Text: ${text}`)
        } else if (text.length > 0) {
            console.log(`First 300 chars: ${text.substring(0, 300)}`)
        }
    } catch (e: any) {
        console.log(`pdf-parse failed: ${e.message}`)
    }

    // Step 2: OCR transcription
    console.log(`\n--- Step 2: Gemini Flash OCR transcription ---`)
    const startTime = Date.now()
    const ocrText = await callGeminiTranscriber(GEMINI_API_KEY!, base64Data)
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`OCR completed in ${elapsed}s — ${ocrText.length} chars`)

    // Show first 2000 chars of transcription
    console.log(`\n--- Transcription (first 2000 chars) ---`)
    console.log(ocrText.substring(0, 2000))
    if (ocrText.length > 2000) console.log(`\n... (${ocrText.length} total chars)`)

    // Step 3: Check number format
    console.log(`\n--- Step 3: Number format check ---`)
    const italianNumbers = ocrText.match(/\d{1,3}\.\d{3}(?:\.\d{3})*(?:,\d{2})?/g) || []
    console.log(`Italian-format numbers found: ${italianNumbers.length}`)
    if (italianNumbers.length > 0) {
        console.log(`Examples: ${italianNumbers.slice(0, 15).join(', ')}`)
    }

    const isins = ocrText.match(/[A-Z]{2}[A-Z0-9]{9}\d/g) || []
    const uniqueIsins = [...new Set(isins)]
    console.log(`ISINs found: ${uniqueIsins.length}`)
    if (uniqueIsins.length > 0) {
        console.log(`ISINs: ${uniqueIsins.join(', ')}`)
    }

    // Step 4: Run deterministic text parser
    console.log(`\n--- Step 4: Deterministic text parser on OCR text ---`)
    const result = extractPortfolioFromText(ocrText)
    console.log(`Bank: ${result.bankDetected || 'not detected'}`)
    console.log(`Section found: ${result.sectionFound}`)
    console.log(`Holdings: ${result.holdings.length}`)
    console.log(`Verified: ${result.holdings.filter(h => h.verified).length}`)
    console.log(`Total: ${result.total > 0 ? result.total.toFixed(2) + '€' : 'not found'}`)
    console.log(`Sum: ${result.holdingsSum.toFixed(2)}€`)
    if (result.total > 0) {
        const gap = Math.abs(result.holdingsSum - result.total)
        const gapPct = (gap / result.total * 100).toFixed(1)
        console.log(`Gap: ${gap.toFixed(2)}€ (${gapPct}%)`)
    }

    if (result.holdings.length > 0) {
        console.log(`\n--- Holdings ---`)
        for (const h of result.holdings) {
            console.log(`  ${h.isin} | qty: ${h.quantity} | price: ${h.price} | mkt: ${h.marketValue} | ${h.verified ? 'V' : 'X'}`)
        }
    }
}

main().catch(e => { console.error(e); process.exit(1) })
