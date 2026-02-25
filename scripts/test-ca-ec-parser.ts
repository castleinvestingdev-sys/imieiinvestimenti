#!/usr/bin/env npx tsx
/**
 * Test the CA EC (Estratto Conto / Liquidità) text parser on all CA Liquidità PDFs.
 * Shows fast-path eligibility for each file.
 */
import { PDFParse } from 'pdf-parse'
import * as fs from 'fs'
import * as path from 'path'
import { isCreditAgricoleEC, extractCreditAgricoleECData } from '../lib/pdf-text-parser'

const CA_LIQ_BASE = '/Users/leon/Desktop/banche EC/Credit Agricole/Liquidità'

async function extractText(filePath: string): Promise<string> {
    const buf = fs.readFileSync(filePath)
    const parser = new PDFParse(new Uint8Array(buf))
    const result = await parser.getText()
    return result.text || ''
}

async function main() {
    // Find all subdirectories
    const subdirs = fs.readdirSync(CA_LIQ_BASE)
        .filter(d => fs.statSync(path.join(CA_LIQ_BASE, d)).isDirectory())
        .sort()

    let totalPdfs = 0
    let fastPathOk = 0
    let saldoOnlyOk = 0
    let failed = 0
    const failures: string[] = []

    for (const subdir of subdirs) {
        const dirPath = path.join(CA_LIQ_BASE, subdir)
        const pdfs = fs.readdirSync(dirPath)
            .filter(f => f.toLowerCase().endsWith('.pdf'))
            .sort()

        console.log(`\n=== ${subdir} (${pdfs.length} PDFs) ===`)

        for (const pdf of pdfs) {
            totalPdfs++
            const filePath = path.join(dirPath, pdf)
            try {
                const text = await extractText(filePath)

                if (!isCreditAgricoleEC(text)) {
                    console.log(`  ${pdf}: NOT CA EC (skipped)`)
                    continue
                }

                const result = extractCreditAgricoleECData(text)
                if (!result) {
                    console.log(`  ${pdf}: PARSER RETURNED NULL`)
                    failed++
                    failures.push(`${subdir}/${pdf}: null result`)
                    continue
                }

                const delta = result.saldoFinale - result.saldoIniziale
                const movErr = Math.abs(delta - result.movementsSum)
                const tag = movErr < 1 ? '✅ FAST' : `⚠️ GAP ${movErr.toFixed(2)}€`

                if (movErr < 1) fastPathOk++
                else saldoOnlyOk++

                console.log(`  ${pdf}: ${tag} | ${result.saldoIniziale.toFixed(2)} → ${result.saldoFinale.toFixed(2)} | ${result.movements.length} mov | Holder: ${result.holder || 'N/D'} | Period: ${result.periodStart} → ${result.periodEnd}`)
            } catch (err: any) {
                console.log(`  ${pdf}: ERROR ${err.message}`)
                failed++
                failures.push(`${subdir}/${pdf}: ${err.message}`)
            }
        }
    }

    console.log(`\n========== SUMMARY ==========`)
    console.log(`Total PDFs: ${totalPdfs}`)
    console.log(`Fast path (skip Gemini): ${fastPathOk} ✅`)
    console.log(`Saldo OK, movements GAP: ${saldoOnlyOk} ⚠️ (Gemini fallback for movements)`)
    console.log(`Failed: ${failed}`)
    if (failures.length > 0) {
        console.log(`\nFailures:`)
        failures.forEach(f => console.log(`  - ${f}`))
    }
}

main().catch(console.error)
