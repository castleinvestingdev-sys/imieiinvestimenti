/**
 * Dump full text from specific Generali PDFs to understand structure.
 */
import { readFileSync } from 'fs'
import { PDFParse } from 'pdf-parse'

const files = [
    '/Users/leon/Desktop/banche EC/banca generali/250630 Banca Generali EC Dossier Titoli.pdf',
    '/Users/leon/Desktop/banche EC/banca generali/250930 Banca Generali EC Dossier Titoli.pdf',
    '/Users/leon/Desktop/banche EC/banca generali/241231 Banca Generali EC Dossier Titoli.pdf',
]

async function main() {
    for (const filePath of files) {
        const fileName = filePath.split('/').pop()
        console.log(`\n${'='.repeat(80)}`)
        console.log(`FULL TEXT: ${fileName}`)
        console.log(`${'='.repeat(80)}\n`)

        const pdfBuffer = readFileSync(filePath)
        const pdfParser = new PDFParse(new Uint8Array(pdfBuffer))
        const pdfData = await pdfParser.getText()
        const text = pdfData.text || ''
        console.log(text)
    }
}

main().catch(console.error)
