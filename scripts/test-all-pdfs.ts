/**
 * Regression test: run the deterministic text parser on ALL PDFs
 * in a directory tree and report results.
 *
 * Usage:
 *   npx tsx scripts/test-all-pdfs.ts <path-to-pdf-root>
 *
 * Example:
 *   npx tsx scripts/test-all-pdfs.ts "/Users/leon/Desktop/banche EC"
 *
 * Output: per-file results + summary table
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { PDFParse } from 'pdf-parse'
import { extractPortfolioFromText } from '../lib/pdf-text-parser'

interface TestResult {
    file: string
    bank: string | null
    sectionFound: boolean
    holdings: number
    verified: number
    total: number
    holdingsSum: number
    gap: number
    gapPct: number
    status: 'perfect' | 'no_text' | 'partial' | 'error'
    error?: string
}

function findPdfs(dir: string): string[] {
    const results: string[] = []
    try {
        const entries = readdirSync(dir)
        for (const entry of entries) {
            const full = join(dir, entry)
            try {
                const stat = statSync(full)
                if (stat.isDirectory()) {
                    results.push(...findPdfs(full))
                } else if (entry.toLowerCase().endsWith('.pdf')) {
                    results.push(full)
                }
            } catch { /* skip inaccessible */ }
        }
    } catch { /* skip inaccessible */ }
    return results
}

async function testPdf(pdfPath: string): Promise<TestResult> {
    const result: TestResult = {
        file: pdfPath,
        bank: null,
        sectionFound: false,
        holdings: 0,
        verified: 0,
        total: 0,
        holdingsSum: 0,
        gap: 0,
        gapPct: 0,
        status: 'no_text',
    }

    try {
        const buffer = readFileSync(pdfPath)
        const parser = new PDFParse(new Uint8Array(buffer))
        const pdfData = await parser.getText()
        const text = pdfData.text || ''

        if (text.length < 100) {
            result.status = 'no_text'
            return result
        }

        // Check if it's a dossier titoli (not liquidity)
        const upper = text.toUpperCase()
        const isDossier = upper.includes('DOSSIER TITOLI') || upper.includes('ESTRATTO CONTO TITOLI')
            || upper.includes('RENDICONTO') || upper.includes('PORTAFOGLIO TITOLI')
            || upper.includes('CONSISTENZA') || upper.includes('SITUAZIONE FINANZIARIA')

        if (!isDossier) {
            result.status = 'no_text' // It's a liquidity statement, not relevant
            return result
        }

        const textResult = extractPortfolioFromText(text)
        result.bank = textResult.bankDetected
        result.sectionFound = textResult.sectionFound
        result.holdings = textResult.holdings.length
        result.verified = textResult.holdings.filter(h => h.verified).length
        result.total = textResult.total
        result.holdingsSum = textResult.holdingsSum

        if (textResult.holdings.length === 0) {
            result.status = 'no_text'
            return result
        }

        if (textResult.total > 0) {
            result.gap = Math.abs(textResult.holdingsSum - textResult.total)
            result.gapPct = (result.gap / textResult.total) * 100
        }

        if (result.gapPct < 0.1 && result.verified === result.holdings) {
            result.status = 'perfect'
        } else if (result.verified === result.holdings) {
            result.status = result.gapPct < 1 ? 'perfect' : 'partial'
        } else {
            result.status = 'partial'
        }
    } catch (err: any) {
        result.status = 'error'
        result.error = err.message
    }

    return result
}

async function main() {
    const rootDir = process.argv[2]
    if (!rootDir) {
        console.error('Usage: npx tsx scripts/test-all-pdfs.ts <path-to-pdf-root>')
        process.exit(1)
    }

    console.log(`\nScanning: ${rootDir}\n`)
    const pdfs = findPdfs(rootDir).sort()
    console.log(`Found ${pdfs.length} PDFs\n`)

    const results: TestResult[] = []
    let processed = 0

    for (const pdf of pdfs) {
        const result = await testPdf(pdf)
        results.push(result)
        processed++

        // Progress indicator
        const rel = relative(rootDir, pdf)
        const statusIcon = result.status === 'perfect' ? '✅'
            : result.status === 'no_text' ? '⬜'
            : result.status === 'error' ? '❌'
            : '⚠️'
        const detail = result.holdings > 0
            ? `${result.verified}/${result.holdings} verified, gap ${result.gapPct.toFixed(1)}%`
            : result.error || (result.sectionFound ? 'section found but 0 holdings' : 'no section/text')
        console.log(`  ${statusIcon} [${processed}/${pdfs.length}] ${rel} | ${detail}`)
    }

    // Summary
    const perfect = results.filter(r => r.status === 'perfect').length
    const noText = results.filter(r => r.status === 'no_text').length
    const partial = results.filter(r => r.status === 'partial').length
    const errors = results.filter(r => r.status === 'error').length

    console.log('\n' + '='.repeat(60))
    console.log('SUMMARY')
    console.log('='.repeat(60))
    console.log(`  Total PDFs:     ${pdfs.length}`)
    console.log(`  ✅ Perfect:      ${perfect}`)
    console.log(`  ⬜ No text:      ${noText}`)
    console.log(`  ⚠️  Partial:      ${partial}`)
    console.log(`  ❌ Errors:       ${errors}`)

    const accuracy = pdfs.length - noText > 0
        ? ((perfect / (pdfs.length - noText)) * 100).toFixed(1)
        : 'N/A'
    console.log(`  Accuracy:       ${accuracy}% (of parseable PDFs)`)

    // Bank breakdown
    const bankStats = new Map<string, { total: number; perfect: number }>()
    for (const r of results) {
        if (r.status === 'no_text') continue
        const bank = r.bank || 'Unknown'
        const stat = bankStats.get(bank) || { total: 0, perfect: 0 }
        stat.total++
        if (r.status === 'perfect') stat.perfect++
        bankStats.set(bank, stat)
    }

    if (bankStats.size > 0) {
        console.log('\n  Per bank:')
        for (const [bank, stat] of [...bankStats.entries()].sort((a, b) => b[1].total - a[1].total)) {
            console.log(`    ${bank}: ${stat.perfect}/${stat.total} perfect`)
        }
    }

    // Show partial/error details
    const issues = results.filter(r => r.status === 'partial' || r.status === 'error')
    if (issues.length > 0) {
        console.log('\n  Issues:')
        for (const r of issues) {
            const rel = relative(rootDir, r.file)
            if (r.status === 'error') {
                console.log(`    ❌ ${rel}: ${r.error}`)
            } else {
                console.log(`    ⚠️  ${rel}: ${r.verified}/${r.holdings} verified, gap ${r.gapPct.toFixed(1)}% (${r.gap.toFixed(2)}€)`)
            }
        }
    }

    console.log('')
}

main().catch(err => {
    console.error('Fatal error:', err.message)
    process.exit(1)
})
