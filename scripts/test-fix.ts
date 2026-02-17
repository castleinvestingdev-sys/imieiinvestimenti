import { readFileSync } from 'fs'
import { PDFParse } from 'pdf-parse'
import { parseMovimentiFromText } from '../lib/pdf-text-parser'

async function main() {
    const buf = readFileSync('/Users/leon/Desktop/banche EC/Credit Agricole/Dossier Titoli/990/190630 190630 30_06_2019_Estratto_Conto_rapporto_0000004742990.pdf')
    const parser = new PDFParse(new Uint8Array(buf))
    const data = await parser.getText()
    const text = data.text || ''

    const movResult = parseMovimentiFromText(text)

    const targets = ['LU1883321884', 'IT0005359390', 'LU1882463380', 'LU0319686159']
    console.log('=== FIXED RESULTS ===')
    for (const isin of targets) {
        const mvs = movResult.movements.filter(m => m.isin === isin)
        const startQty = movResult.startQuantities[isin]
        const endQty = movResult.endQuantities[isin]
        console.log(isin + ':')
        console.log('  startQty: ' + (startQty !== undefined ? startQty : 'NOT SET'))
        console.log('  endQty: ' + (endQty !== undefined ? endQty : 'NOT SET'))
        for (const m of mvs) {
            console.log('  ' + m.operationType + ' qty=' + m.quantity + ' [' + m.description + ']')
        }
    }

    console.log('\n=== ALL MOVEMENTS ===')
    for (const m of movResult.movements) {
        console.log('  ' + m.isin + ' ' + m.operationType + ' qty=' + m.quantity + ' [' + m.description + ']')
    }
}
main().catch(e => console.error(e.message))
