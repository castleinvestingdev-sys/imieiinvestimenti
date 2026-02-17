/**
 * Test script: extracts text from a PDF and runs the deterministic parser.
 * Usage: npx tsx scripts/test-text-parser.ts <path-to-pdf>
 */
import { readFileSync } from 'fs'
import { PDFParse } from 'pdf-parse'
import {
    extractPortfolioFromText,
    parseConsistenzaHoldings,
    extractConsistenzaSection,
    extractPortfolioTotal,
    detectBank,
} from '../lib/pdf-text-parser'

async function main() {
    const pdfPath = process.argv[2]
    if (!pdfPath) {
        console.error('Usage: npx tsx scripts/test-text-parser.ts <path-to-pdf>')
        process.exit(1)
    }

    console.log(`\n📄 File: ${pdfPath}\n`)

    // Extract text
    const pdfBuffer = readFileSync(pdfPath)
    const pdfParser = new PDFParse(new Uint8Array(pdfBuffer))
    const pdfData = await pdfParser.getText()
    const text = pdfData.text || ''

    console.log(`📝 Testo estratto: ${text.length} caratteri\n`)

    // Bank detection
    const bank = detectBank(text)
    console.log(`🏦 Banca: ${bank || 'non rilevata'}\n`)

    // Portfolio total
    const { total, source } = extractPortfolioTotal(text)
    console.log(`💰 Totale portfolio: ${total > 0 ? total.toFixed(2) + '€' : 'non trovato'} (source: ${source})\n`)

    // CONSISTENZA section
    const section = extractConsistenzaSection(text)
    console.log(`📊 Sezione CONSISTENZA: ${section.length > 0 ? section.length + ' caratteri' : 'NON TROVATA'}\n`)

    if (section.length > 0) {
        // Show first 500 chars
        console.log('--- INIZIO SEZIONE (primi 500 chars) ---')
        console.log(section.substring(0, 500))
        console.log('--- FINE ANTEPRIMA ---\n')
    }

    // Parse holdings
    const holdings = parseConsistenzaHoldings(section)
    const verifiedCount = holdings.filter(h => h.verified).length
    const holdingsSum = holdings.reduce((s, h) => s + h.marketValue, 0)

    console.log(`📋 Holdings estratti: ${holdings.length} (${verifiedCount} verificati)\n`)
    console.log(`💰 Somma holdings: ${holdingsSum.toFixed(2)}€`)
    if (total > 0) {
        const gap = Math.abs(holdingsSum - total)
        const gapPct = (gap / total) * 100
        console.log(`📊 Gap vs totale PDF: ${gap.toFixed(2)}€ (${gapPct.toFixed(1)}%)`)
    }
    console.log('')

    // Print each holding
    for (const h of holdings) {
        const check = h.verified ? '✅' : '⚠️'
        const qxp = h.quantity > 0 && h.price > 0
            ? `${h.quantity} × ${h.price.toFixed(4)} ${h.exchangeRate !== 1 ? `× ${h.exchangeRate.toFixed(4)}` : ''} = ${(h.quantity * h.price * h.exchangeRate).toFixed(2)}`
            : 'qty/price non trovati'
        console.log(`  ${check} ${h.isin} | ${h.currency} | mktVal=${h.marketValue.toFixed(2)}€ | ${qxp}`)
    }

    // Full pipeline result
    console.log('\n--- PIPELINE COMPLETA ---')
    const result = extractPortfolioFromText(text)
    console.log(`Banca: ${result.bankDetected}`)
    console.log(`Sezione trovata: ${result.sectionFound}`)
    console.log(`Totale: ${result.total.toFixed(2)}€ (${result.totalSource})`)
    console.log(`Holdings: ${result.holdings.length} (${result.holdings.filter(h => h.verified).length} verificati)`)
    console.log(`Somma: ${result.holdingsSum.toFixed(2)}€`)
}

main().catch(err => {
    console.error('Errore:', err.message)
    process.exit(1)
})
