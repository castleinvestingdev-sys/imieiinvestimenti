#!/usr/bin/env npx tsx
// Quick test: upload DT PDFs and measure processing time
// Usage: npx tsx scripts/test-fast-path.ts [dir-or-pdf]

import fs from 'fs'
import path from 'path'

const DEFAULT_DIR = '/Users/leon/Desktop/banche EC/BANCA INTESA/BANCA INTESA/Dossier titoli/'
const target = process.argv[2] || DEFAULT_DIR

const API_URL = 'http://localhost:3000/api/parse-pdf'

async function uploadPdf(filePath: string): Promise<{ ok: boolean; elapsed: number; data?: any }> {
    const fileName = path.basename(filePath)
    const fileBuffer = fs.readFileSync(filePath)

    const start = Date.now()
    const blob = new Blob([fileBuffer], { type: 'application/pdf' })
    const formData = new FormData()
    formData.append('file', blob, fileName)
    formData.append('userId', 'test-user-fast-path')
    formData.append('dryRun', 'true')

    const res = await fetch(API_URL, { method: 'POST', body: formData })
    const elapsed = (Date.now() - start) / 1000
    const data = await res.json()
    return { ok: res.ok && data.success, elapsed, data }
}

async function main() {
    let files: string[] = []
    const stat = fs.statSync(target)
    if (stat.isDirectory()) {
        files = fs.readdirSync(target)
            .filter(f => f.endsWith('.pdf'))
            .map(f => path.join(target, f))
    } else {
        files = [target]
    }

    console.log(`Testing ${files.length} PDFs...\n`)
    let totalTime = 0
    let successCount = 0
    let failCount = 0

    for (const f of files) {
        const { ok, elapsed, data } = await uploadPdf(f)
        totalTime += elapsed
        const name = path.basename(f).substring(0, 50)
        if (ok) {
            successCount++
            console.log(`✅ ${elapsed.toFixed(1)}s | ${name} | ${data.bank} | ${data.period} | H:${data.holdingsCount} M:${data.movementsCount} | ${data.portfolioTotal}€`)
        } else {
            failCount++
            console.log(`❌ ${elapsed.toFixed(1)}s | ${name} | ${data?.error?.substring(0, 80) || 'Unknown error'}`)
        }
    }

    console.log(`\n--- Summary ---`)
    console.log(`Total: ${files.length} PDFs | ✅ ${successCount} | ❌ ${failCount}`)
    console.log(`Total time: ${totalTime.toFixed(1)}s | Avg: ${(totalTime / files.length).toFixed(1)}s/PDF`)
}

main().catch(console.error)
