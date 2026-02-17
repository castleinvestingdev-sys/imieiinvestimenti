import { readFileSync } from 'fs'
import { PDFParse } from 'pdf-parse'
import { parseMovimentiFromText } from '../lib/pdf-text-parser'

async function main() {
    const buf = readFileSync('/Users/leon/Desktop/banche EC/Credit Agricole/Dossier Titoli/990/200630 30_06_2020_Estratto_Conto_rapporto_0000004742990.pdf')
    const parser = new PDFParse(new Uint8Array(buf))
    const data = await parser.getText()
    const text = data.text || ''

    // Search for IT0005250243
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('IT000525024') || lines[i].includes('5250243')) {
            for (let j = Math.max(0, i-3); j < Math.min(lines.length, i+20); j++) {
                console.log(j + ': ' + lines[j])
            }
            console.log('---')
        }
    }

    // Run movements parser
    const movResult = parseMovimentiFromText(text)
    const mvs = movResult.movements.filter(m => m.isin === 'IT0005250243')
    console.log('\n=== PARSED MOVEMENTS for IT0005250243 ===')
    for (const m of mvs) {
        console.log(`  ${m.operationType} qty=${m.quantity} [${m.description}]`)
    }
    console.log('startQty:', movResult.startQuantities['IT0005250243'])
    console.log('endQty:', movResult.endQuantities['IT0005250243'])

    // Check all movements
    console.log('\n=== ALL MOVEMENTS ===')
    for (const m of movResult.movements) {
        console.log(`  ${m.isin} ${m.operationType} qty=${m.quantity} [${m.description}]`)
    }
}
main().catch(e => console.error(e))
