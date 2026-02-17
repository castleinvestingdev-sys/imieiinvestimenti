/**
 * Check Banca Generali PDFs for extractable text vs scanned images.
 * Usage: npx tsx scripts/check-generali.ts
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { PDFParse } from 'pdf-parse'

const GENERALI_DIR = '/Users/leon/Desktop/banche EC/banca generali'

async function checkPdf(filePath: string) {
    const fileName = filePath.split('/').pop() || filePath
    const fileSize = statSync(filePath).size
    const fileSizeKB = (fileSize / 1024).toFixed(0)

    console.log(`\n${'='.repeat(80)}`)
    console.log(`File: ${fileName}`)
    console.log(`Size: ${fileSizeKB} KB`)
    console.log(`${'='.repeat(80)}`)

    try {
        const pdfBuffer = readFileSync(filePath)
        const pdfParser = new PDFParse(new Uint8Array(pdfBuffer))
        const pdfData = await pdfParser.getText()
        const text = pdfData.text || ''
        const numPages = pdfData.numPages || 0

        console.log(`Pages: ${numPages}`)
        console.log(`Text length: ${text.length} characters`)

        if (text.length === 0) {
            console.log(`RESULT: SCANNED IMAGE - No extractable text`)
        } else if (text.length < 200) {
            console.log(`RESULT: MINIMAL TEXT - Likely scanned with some metadata`)
            console.log(`\nFull text:\n---`)
            console.log(text)
            console.log(`---`)
        } else {
            console.log(`RESULT: HAS TEXT - Text extraction possible`)
            // Show first 1500 chars to understand the structure
            console.log(`\nFirst 1500 chars:\n---`)
            console.log(text.substring(0, 1500))
            console.log(`---`)

            // Check for key markers
            const hasISIN = /[A-Z]{2}[A-Z0-9]{9}[0-9]/.test(text)
            const hasConsistenza = /CONSISTENZA/i.test(text)
            const hasMovimenti = /MOVIMENT/i.test(text)
            const hasDossier = /DOSSIER/i.test(text)
            const hasControvalore = /CONTROVALORE|CONTROVAL/i.test(text)
            const hasQuantita = /QUANTIT|QTA|Q\.TA/i.test(text)

            console.log(`\nKey markers found:`)
            console.log(`  ISIN codes: ${hasISIN}`)
            console.log(`  CONSISTENZA: ${hasConsistenza}`)
            console.log(`  MOVIMENTI: ${hasMovimenti}`)
            console.log(`  DOSSIER: ${hasDossier}`)
            console.log(`  CONTROVALORE: ${hasControvalore}`)
            console.log(`  QUANTITA: ${hasQuantita}`)

            // Count ISINs
            const isinMatches = text.match(/[A-Z]{2}[A-Z0-9]{9}[0-9]/g)
            if (isinMatches) {
                const uniqueIsins = [...new Set(isinMatches)]
                console.log(`\n  Unique ISINs found: ${uniqueIsins.length}`)
                uniqueIsins.forEach(isin => console.log(`    - ${isin}`))
            }
        }
    } catch (err: any) {
        console.log(`ERROR: ${err.message}`)
    }
}

async function main() {
    console.log(`Checking all Banca Generali PDFs in: ${GENERALI_DIR}\n`)

    const files = readdirSync(GENERALI_DIR)
        .filter(f => f.endsWith('.pdf'))
        .sort()

    for (const file of files) {
        await checkPdf(join(GENERALI_DIR, file))
    }

    console.log(`\n${'='.repeat(80)}`)
    console.log(`Done. Checked ${files.length} PDFs.`)
}

main().catch(console.error)
