import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function computeStandardPeriodStart(periodEnd: string, monthsBack: number): string {
    const [y, m] = periodEnd.split('-').map(Number)
    let targetMonth = m - 1 - monthsBack
    let targetYear = y
    while (targetMonth < 0) { targetMonth += 12; targetYear-- }
    const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0))
    const yy = lastDay.getUTCFullYear()
    const mm = String(lastDay.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(lastDay.getUTCDate()).padStart(2, '0')
    return `${yy}-${mm}-${dd}`
}

function doesMatchFrequency(days: number, freq: string): boolean {
    switch (freq) {
        case 'monthly': return days >= 25 && days <= 36
        case 'quarterly': return days >= 85 && days <= 100
        case 'semiannual': return days >= 175 && days <= 195
        case 'annual': return days >= 355 && days <= 375
        default: return false
    }
}

function normalizeAccountNumber(acc: string): string {
    if (!acc) return ''
    const segments = acc.split(/[\/\-]/).map(s => s.replace(/^0+/, '') || '0').filter(s => s.length > 0)
    if (segments.length === 0) return ''
    // Use only last segment — the account identifier is unique per bank
    return segments.slice(-1).join('').toUpperCase()
}

// Run the SAME coherence check as the dashboard to find docs with errors
function findCoherenceErrors(allDocs: any[]): { errors: any[], missing: any[] } {
    const dossiers = allDocs.filter(a => a.account_type === 'DOSSIER' && a.period_start && a.period_end)
    const errors: any[] = []
    const missing: any[] = []

    for (const doc of dossiers) {
        const normAcc = normalizeAccountNumber(doc.benchmark_comparison || '')
        if (!normAcc || normAcc === 'ND') { missing.push(doc); continue }

        const docStart = new Date(doc.period_start)
        const docEnd = new Date(doc.period_end)
        const docDays = (docEnd.getTime() - docStart.getTime()) / 86400000

        // Find previous doc (same account, period_end <= this doc's period_start)
        const prevDoc = dossiers
            .filter(a => a.id !== doc.id
                && normalizeAccountNumber(a.benchmark_comparison || '') === normAcc
                && new Date(a.period_end) <= docStart)
            .sort((a, b) => new Date(b.period_end).getTime() - new Date(a.period_end).getTime())[0]

        if (!prevDoc) continue // No predecessor = can't check

        const prevEnd = new Date(prevDoc.period_end!)
        const gapDays = (docStart.getTime() - prevEnd.getTime()) / 86400000
        const maxGap = docDays < 2 ? 35 : 5
        if (gapDays > maxGap) continue // Gap too large

        // Quarter/month continuity check
        if (docDays < 45) {
            const expPrevM = docEnd.getMonth() === 0 ? 11 : docEnd.getMonth() - 1
            const expPrevMY = docEnd.getMonth() === 0 ? docEnd.getFullYear() - 1 : docEnd.getFullYear()
            if (prevEnd.getMonth() !== expPrevM || prevEnd.getFullYear() !== expPrevMY) continue
        } else if (docDays <= 150 && docDays > 45) {
            const getQ = (d: Date) => ({ q: Math.floor(d.getMonth() / 3), y: d.getFullYear() })
            const dQ = getQ(docEnd), pQ = getQ(prevEnd)
            const expQ = dQ.q === 0 ? 3 : dQ.q - 1
            const expY = dQ.q === 0 ? dQ.y - 1 : dQ.y
            if (pQ.q !== expQ || pQ.y !== expY) continue
        } else if (docDays > 150 && docDays <= 330) {
            const getH = (d: Date) => ({ h: d.getMonth() < 6 ? 0 : 1, y: d.getFullYear() })
            const dH = getH(docEnd), pH = getH(prevEnd)
            const expH = dH.h === 0 ? 1 : 0
            const expHY = dH.h === 0 ? dH.y - 1 : dH.y
            if (pH.h !== expH || pH.y !== expHY) continue
        }

        // Holdings coherence: calcInit = currentQty - buys + sells, compare with prevDoc
        const prevH: Record<string, number> = {}
        ;(prevDoc.holdings || []).forEach((h: any) => { if (h.isin) prevH[h.isin] = h.quantity || 0 })

        const movMap: Record<string, { b: number; s: number }> = {}
        ;(doc.costs_breakdown?.securityMovements || []).forEach((m: any) => {
            const isin = m.isin || ''
            if (!isin) return
            if (!movMap[isin]) movMap[isin] = { b: 0, s: 0 }
            if (m.operationType === 'Acquisto') movMap[isin].b += m.quantity || 0
            else if (m.operationType === 'Vendita') movMap[isin].s += m.quantity || 0
        })

        const calcInit: Record<string, number> = {}
        ;(doc.holdings || []).forEach((h: any) => {
            const isin = h.isin || ''
            if (!isin) return
            const d = movMap[isin] || { b: 0, s: 0 }
            calcInit[isin] = (h.quantity || 0) - d.b + d.s
        })
        Object.entries(movMap).forEach(([isin, d]) => {
            if (!(isin in calcInit)) { const q = 0 - d.b + d.s; if (q !== 0) calcInit[isin] = q }
        })

        const allIsins = new Set([...Object.keys(prevH), ...Object.keys(calcInit)])
        const mismatchIsins: string[] = []
        allIsins.forEach(isin => {
            if (Math.abs((calcInit[isin] || 0) - (prevH[isin] || 0)) >= 0.0001) {
                mismatchIsins.push(isin)
            }
        })

        // Filter out corporate action ISINs (RAGGRUPPAMENTO, SPLIT, etc.)
        const CA_KW = ['RAGGR', 'DIRITTO', 'DIRITTI', 'FRAZION', 'CONCAMBIO', 'CONVERSIONE', 'SPLIT AZ']
        const nameMap: Record<string, string> = {}
        ;(prevDoc.holdings || []).forEach((h: any) => { if (h.isin) nameMap[h.isin] = h.name || h.description || h.isin })
        ;(doc.holdings || []).forEach((h: any) => { if (h.isin) nameMap[h.isin] = h.name || h.description || h.isin })
        ;(doc.costs_breakdown?.securityMovements || []).forEach((m: any) => { if (m.isin && m.name) nameMap[m.isin] = m.name })
        const realMismatches = mismatchIsins.filter(isin => {
            const u = (nameMap[isin] || '').toUpperCase()
            return !CA_KW.some(kw => u.includes(kw)) && !/^DIR\s+[A-Z]/i.test(nameMap[isin] || '')
        })

        if (realMismatches.length > 0) {
            errors.push({
                id: doc.id,
                idShort: doc.id.substring(0, 8),
                account: normAcc,
                period: `${doc.period_start} → ${doc.period_end}`,
                prevPeriod: `${prevDoc.period_start} → ${prevDoc.period_end}`,
                mismatchCount: realMismatches.length,
                mismatchIsins: realMismatches.slice(0, 10),
                totalIsins: allIsins.size,
            })
        }
    }

    return { errors, missing }
}

// GET = diagnostic
export async function GET(request: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

    const action = request.nextUrl.searchParams.get('action')

    // --- Soft-delete all analyses for a specific account ---
    if (action === 'clean-account') {
        const accountParam = request.nextUrl.searchParams.get('account')
        if (!accountParam) return NextResponse.json({ error: 'Missing account parameter' }, { status: 400 })

        const { data: allDocs } = await supabase
            .from('analyses')
            .select('id, benchmark_comparison')
            .eq('user_id', user.id).is('deleted_at', null)
        const targetNorm = normalizeAccountNumber(accountParam)
        const toDelete = (allDocs || []).filter(d => {
            const docNorm = normalizeAccountNumber(d.benchmark_comparison || '')
            if (docNorm === targetNorm) return true
            // Also match if the raw account number ends with the target (e.g. "990" matches "0000004742990")
            const raw = (d.benchmark_comparison || '').replace(/[^0-9]/g, '')
            const targetDigits = accountParam.replace(/[^0-9]/g, '')
            return targetDigits.length >= 3 && raw.endsWith(targetDigits)
        })
        if (toDelete.length === 0) {
            return NextResponse.json({ action: 'CLEAN_ACCOUNT', account: targetNorm, deleted: 0, message: 'Nessuna analisi trovata per questo conto.' })
        }
        const now = new Date().toISOString()
        const { error: delErr } = await supabase
            .from('analyses')
            .update({ deleted_at: now })
            .in('id', toDelete.map(d => d.id))
        return NextResponse.json({
            action: 'CLEAN_ACCOUNT',
            account: targetNorm,
            deleted: delErr ? 0 : toDelete.length,
            error: delErr?.message || null
        })
    }

    const { data, error } = await supabase
        .from('analyses')
        .select('id, bank_name, account_type, period_start, period_end, portfolio_value, benchmark_comparison, costs_breakdown, holdings')
        .eq('user_id', user.id).is('deleted_at', null).order('period_start', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const allAnalyses = data || []

    // --- Overlap detection ---
    const byAccount: Record<string, any[]> = {}
    allAnalyses.forEach((a: any) => {
        const acc = normalizeAccountNumber(a.benchmark_comparison || '')
        if (!acc) return
        if (!byAccount[acc]) byAccount[acc] = []
        byAccount[acc].push(a)
    })

    const overlaps: any[] = []
    for (const [acc, docs] of Object.entries(byAccount)) {
        docs.sort((a: any, b: any) => (a.period_start || '').localeCompare(b.period_start || ''))
        for (let i = 0; i < docs.length; i++) {
            for (let j = i + 1; j < docs.length; j++) {
                const a = docs[i], b = docs[j]
                if (!a.period_start || !a.period_end || !b.period_start || !b.period_end) continue
                if (a.period_start < b.period_end && a.period_end > b.period_start) {
                    const aDays = Math.round((new Date(a.period_end).getTime() - new Date(a.period_start).getTime()) / 86400000)
                    const bDays = Math.round((new Date(b.period_end).getTime() - new Date(b.period_start).getTime()) / 86400000)
                    const durations = docs.map((d: any) => d.period_start && d.period_end ? Math.round((new Date(d.period_end).getTime() - new Date(d.period_start).getTime()) / 86400000) : 0).filter((d: number) => d > 0)
                    const buckets: Record<string, number> = { monthly: 0, quarterly: 0, semiannual: 0, annual: 0 }
                    for (const d of durations) { if (d >= 25 && d <= 36) buckets.monthly++; else if (d >= 85 && d <= 100) buckets.quarterly++; else if (d >= 175 && d <= 195) buckets.semiannual++; else if (d >= 355 && d <= 375) buckets.annual++ }
                    const [majorityFreq] = Object.entries(buckets).sort((x, y) => y[1] - x[1])[0]
                    const aMatch = doesMatchFrequency(aDays, majorityFreq), bMatch = doesMatchFrequency(bDays, majorityFreq)
                    const anomaly = !aMatch ? a : !bMatch ? b : (aDays >= bDays ? a : b)
                    const anomalyDays = anomaly === a ? aDays : bDays
                    const monthsMap: Record<string, number> = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 }
                    const correctedStart = computeStandardPeriodStart(anomaly.period_end, monthsMap[majorityFreq] || 1)
                    if (!overlaps.find(o => o.fixId === anomaly.id)) {
                        overlaps.push({ account: acc, fixId: anomaly.id, fixShort: anomaly.id.substring(0, 8), currentPeriod: `${anomaly.period_start} → ${anomaly.period_end}`, currentDays: anomalyDays, correctedStart, majorityFreq })
                    }
                }
            }
        }
    }

    // --- Coherence errors ---
    const { errors: coherenceErrors } = findCoherenceErrors(allAnalyses)

    // --- Apply fixes ---
    if (action === 'fix' && overlaps.length > 0) {
        const fixLog: any[] = []
        for (const ov of overlaps) {
            const { error: fixErr } = await supabase.from('analyses').update({ period_start: ov.correctedStart }).eq('id', ov.fixId)
            fixLog.push({ docId: ov.fixShort, oldStart: ov.currentPeriod.split(' → ')[0], newStart: ov.correctedStart, success: !fixErr })
        }
        return NextResponse.json({ action: 'FIX_OVERLAPS', fixed: fixLog.filter(c => c.success).length, fixLog })
    }

    // --- Fix Italian number format errors in holdings quantities ---
    // Detects cases where currQty × 1000 ≈ prevQty (or ÷ 1000) and fixes them
    if (action === 'fix-quantities') {
        const fixLog: any[] = []
        const dossiers = allAnalyses.filter(a => a.account_type === 'DOSSIER' && a.period_start && a.period_end)
            .sort((a, b) => (a.period_start || '').localeCompare(b.period_start || ''))

        for (const doc of dossiers) {
            const normAcc = normalizeAccountNumber(doc.benchmark_comparison || '')
            if (!normAcc || normAcc === 'ND') continue

            const prevDoc = dossiers
                .filter(a => a.id !== doc.id
                    && normalizeAccountNumber(a.benchmark_comparison || '') === normAcc
                    && new Date(a.period_end) <= new Date(doc.period_start))
                .sort((a, b) => new Date(b.period_end).getTime() - new Date(a.period_end).getTime())[0]
            if (!prevDoc) continue

            const prevH: Record<string, number> = {}
            ;(prevDoc.holdings || []).forEach((h: any) => { if (h.isin) prevH[h.isin] = h.quantity || 0 })

            const movMap: Record<string, { b: number; s: number }> = {}
            ;(doc.costs_breakdown?.securityMovements || []).forEach((m: any) => {
                const isin = m.isin || ''
                if (!isin) return
                if (!movMap[isin]) movMap[isin] = { b: 0, s: 0 }
                if (m.operationType === 'Acquisto') movMap[isin].b += m.quantity || 0
                else if (m.operationType === 'Vendita') movMap[isin].s += m.quantity || 0
            })

            let holdingsChanged = false
            const updatedHoldings = (doc.holdings || []).map((h: any) => {
                const isin = h.isin
                if (!isin) return h
                const prev = prevH[isin]
                if (prev === undefined || prev <= 0) return h
                const mov = movMap[isin] || { b: 0, s: 0 }
                if (mov.b > 0 || mov.s > 0) return h // Has movements, skip
                const curr = h.quantity || 0
                if (curr <= 0) return h

                for (const factor of [1000, 1000000]) {
                    if (Math.abs(curr * factor - prev) / prev < 0.01) {
                        fixLog.push({
                            docId: doc.id.substring(0, 8),
                            period: `${doc.period_start} → ${doc.period_end}`,
                            isin, old: curr, new: curr * factor, factor: `×${factor}`
                        })
                        holdingsChanged = true
                        return { ...h, quantity: curr * factor }
                    }
                    if (Math.abs(curr / factor - prev) / prev < 0.01) {
                        fixLog.push({
                            docId: doc.id.substring(0, 8),
                            period: `${doc.period_start} → ${doc.period_end}`,
                            isin, old: curr, new: curr / factor, factor: `÷${factor}`
                        })
                        holdingsChanged = true
                        return { ...h, quantity: curr / factor }
                    }
                }
                return h
            })

            if (holdingsChanged) {
                await supabase.from('analyses').update({ holdings: updatedHoldings }).eq('id', doc.id)
            }
        }

        return NextResponse.json({
            action: 'FIX_QUANTITIES',
            totalFixed: fixLog.length,
            fixLog
        })
    }

    // --- Fix all period_start dates using frequency detection ---
    if (action === 'fix-dates') {
        const fixLog: any[] = []
        const dossiers = allAnalyses.filter(a => a.account_type === 'DOSSIER' && a.period_end)

        // Group by account to detect majority frequency
        const byAccFix: Record<string, any[]> = {}
        dossiers.forEach(d => {
            const acc = normalizeAccountNumber(d.benchmark_comparison || '')
            if (!acc) return
            if (!byAccFix[acc]) byAccFix[acc] = []
            byAccFix[acc].push(d)
        })

        for (const [acc, docs] of Object.entries(byAccFix)) {
            // Detect majority frequency for this account
            const durations = docs.map(d => d.period_start && d.period_end
                ? Math.round((new Date(d.period_end).getTime() - new Date(d.period_start).getTime()) / 86400000) : 0
            ).filter(d => d > 0)
            const buckets: Record<string, number> = { monthly: 0, quarterly: 0, semiannual: 0, annual: 0 }
            for (const d of durations) {
                if (d >= 25 && d <= 36) buckets.monthly++
                else if (d >= 85 && d <= 100) buckets.quarterly++
                else if (d >= 175 && d <= 195) buckets.semiannual++
                else if (d >= 355 && d <= 375) buckets.annual++
            }
            const [majorityFreq] = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0]
            const monthsMap: Record<string, number> = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 }
            const months = monthsMap[majorityFreq] || 3

            for (const doc of docs) {
                if (!doc.period_end) continue
                const correctStart = computeStandardPeriodStart(doc.period_end, months)
                if (correctStart !== doc.period_start) {
                    const { error: fixErr } = await supabase.from('analyses')
                        .update({ period_start: correctStart }).eq('id', doc.id)
                    fixLog.push({
                        id: doc.id.substring(0, 8), account: acc,
                        oldStart: doc.period_start, newStart: correctStart,
                        freq: majorityFreq, success: !fixErr
                    })
                }
            }
        }

        return NextResponse.json({
            action: 'FIX_DATES',
            totalFixed: fixLog.filter(f => f.success).length,
            totalSkipped: dossiers.length - fixLog.length,
            fixLog
        })
    }

    // --- Re-analyze docs with coherence errors ---
    if (action === 'reanalyze') {
        const idsToReanalyze = coherenceErrors.map((e: any) => e.id)
        if (idsToReanalyze.length === 0) {
            return NextResponse.json({ action: 'REANALYZE', total: 0, message: 'Nessun documento con errori di coerenza.' })
        }

        const baseUrl = request.nextUrl.origin
        const results: any[] = []

        for (const docId of idsToReanalyze) {
            const docInfo = coherenceErrors.find((e: any) => e.id === docId)
            try {
                const formData = new FormData()
                formData.append('reanalyzeId', docId)
                formData.append('userId', user.id)

                const response = await fetch(`${baseUrl}/api/parse-pdf`, {
                    method: 'POST',
                    body: formData,
                    headers: { cookie: request.headers.get('cookie') || '' },
                })

                const result = await response.json()
                results.push({
                    id: docId.substring(0, 8),
                    account: docInfo?.account || '?',
                    period: docInfo?.period || '?',
                    mismatches: docInfo?.mismatchIsins || [],
                    status: result.success !== false ? 'OK' : 'ERROR',
                    error: result.error || null,
                })
            } catch (err: any) {
                results.push({
                    id: docId.substring(0, 8),
                    account: docInfo?.account || '?',
                    period: docInfo?.period || '?',
                    status: 'ERROR',
                    error: err.message,
                })
            }
        }

        return NextResponse.json({
            action: 'REANALYZE',
            total: idsToReanalyze.length,
            ok: results.filter(r => r.status === 'OK').length,
            errors: results.filter(r => r.status === 'ERROR').length,
            results,
        })
    }

    // --- Detailed mismatch analysis for each coherence error ---
    if (action === 'details') {
        const details: any[] = []
        const dossiers = allAnalyses.filter(a => a.account_type === 'DOSSIER' && a.period_start && a.period_end)

        for (const errDoc of coherenceErrors) {
            const doc = allAnalyses.find(a => a.id === errDoc.id)
            if (!doc) continue

            const normAcc = normalizeAccountNumber(doc.benchmark_comparison || '')
            const prevDoc = dossiers
                .filter(a => a.id !== doc.id
                    && normalizeAccountNumber(a.benchmark_comparison || '') === normAcc
                    && new Date(a.period_end) <= new Date(doc.period_start))
                .sort((a, b) => new Date(b.period_end).getTime() - new Date(a.period_end).getTime())[0]
            if (!prevDoc) continue

            const prevH: Record<string, { qty: number; name: string }> = {}
            ;(prevDoc.holdings || []).forEach((h: any) => { if (h.isin) prevH[h.isin] = { qty: h.quantity || 0, name: h.name || h.isin } })

            const currH: Record<string, { qty: number; name: string; price: number; mktVal: number }> = {}
            ;(doc.holdings || []).forEach((h: any) => { if (h.isin) currH[h.isin] = { qty: h.quantity || 0, name: h.name || h.isin, price: h.price || 0, mktVal: h.marketValue || 0 } })

            const movements = doc.costs_breakdown?.securityMovements || []
            const movByIsin: Record<string, any[]> = {}
            movements.forEach((m: any) => {
                const isin = m.isin || ''
                if (!isin) return
                if (!movByIsin[isin]) movByIsin[isin] = []
                movByIsin[isin].push({ op: m.operationType, qty: m.quantity || 0, price: m.price || 0, gross: m.grossAmount || 0, date: m.date || '' })
            })

            const allIsins = new Set([...Object.keys(prevH), ...Object.keys(currH), ...Object.keys(movByIsin)])
            const isinDetails: any[] = []

            allIsins.forEach(isin => {
                const prev = prevH[isin]?.qty || 0
                const curr = currH[isin]?.qty || 0
                const movs = movByIsin[isin] || []
                const buys = movs.filter(m => m.op === 'Acquisto').reduce((s, m) => s + m.qty, 0)
                const sells = movs.filter(m => m.op === 'Vendita').reduce((s, m) => s + m.qty, 0)
                const calcInit = curr - buys + sells
                const diff = calcInit - prev
                if (Math.abs(diff) < 0.0001) return // match, skip

                const name = currH[isin]?.name || prevH[isin]?.name || isin
                // Skip corporate action ISINs
                const CA_KW_D = ['RAGGR', 'DIRITTO', 'DIRITTI', 'FRAZION', 'CONCAMBIO', 'CONVERSIONE', 'SPLIT AZ']
                const uName = name.toUpperCase()
                if (CA_KW_D.some(kw => uName.includes(kw)) || /^DIR\s+[A-Z]/i.test(name)) return

                isinDetails.push({
                    isin, name: name.substring(0, 40),
                    prevQty: +prev.toFixed(4), currQty: +curr.toFixed(4),
                    buys: +buys.toFixed(4), sells: +sells.toFixed(4),
                    calcInit: +calcInit.toFixed(4), diff: +diff.toFixed(4),
                    expectedOp: diff > 0 ? `Acquisto ${Math.abs(diff).toFixed(2)}` : `Vendita ${Math.abs(diff).toFixed(2)}`,
                    movements: movs
                })
            })

            details.push({
                id: doc.id.substring(0, 8),
                period: `${doc.period_start} -> ${doc.period_end}`,
                prevPeriod: `${prevDoc.period_start} -> ${prevDoc.period_end}`,
                mismatchCount: isinDetails.length,
                totalMovements: movements.length,
                mismatches: isinDetails
            })
        }

        return NextResponse.json({ action: 'DETAILS', details })
    }

    // --- Grouping pipeline diagnostic ---
    const typeBreakdown: Record<string, number> = {}
    const bankBreakdown: Record<string, number> = {}
    const accBreakdown: Record<string, { count: number; types: Set<string>; banks: Set<string> }> = {}
    allAnalyses.forEach((a: any) => {
        typeBreakdown[a.account_type || 'NULL'] = (typeBreakdown[a.account_type || 'NULL'] || 0) + 1
        bankBreakdown[a.bank_name || 'NULL'] = (bankBreakdown[a.bank_name || 'NULL'] || 0) + 1
        const normAcc = normalizeAccountNumber(a.benchmark_comparison || 'N/D')
        if (!accBreakdown[normAcc]) accBreakdown[normAcc] = { count: 0, types: new Set(), banks: new Set() }
        accBreakdown[normAcc].count++
        accBreakdown[normAcc].types.add(a.account_type || 'NULL')
        accBreakdown[normAcc].banks.add(a.bank_name || 'NULL')
    })

    return NextResponse.json({
        action: 'DIAGNOSTIC',
        totalDocs: allAnalyses.length,
        byAccountType: typeBreakdown,
        byBankName: bankBreakdown,
        byNormalizedAccount: Object.fromEntries(
            Object.entries(accBreakdown).map(([k, v]) => [k, { count: v.count, types: [...v.types], banks: [...v.banks] }])
        ),
        overlapsFound: overlaps.length,
        overlaps,
        coherenceErrors: coherenceErrors.length,
        coherenceErrorDocs: coherenceErrors,
    })
}

// POST = re-analyze docs with errors
export async function POST(request: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const specificIds: string[] = body.ids || []

    // If no specific IDs, find docs with coherence errors automatically
    let idsToReanalyze: string[] = specificIds

    if (idsToReanalyze.length === 0) {
        const { data: allDocs } = await supabase
            .from('analyses')
            .select('id, account_type, period_start, period_end, benchmark_comparison, costs_breakdown, holdings')
            .eq('user_id', user.id).is('deleted_at', null).order('period_start', { ascending: true })

        const { errors } = findCoherenceErrors(allDocs || [])
        idsToReanalyze = errors.map(e => e.id)
    }

    if (idsToReanalyze.length === 0) {
        return NextResponse.json({ action: 'BATCH_REANALYSIS', total: 0, message: 'Nessun documento con errori di coerenza trovato.' })
    }

    // Fetch doc info for logging
    const { data: docsInfo } = await supabase
        .from('analyses')
        .select('id, period_start, period_end, benchmark_comparison')
        .in('id', idsToReanalyze)

    const baseUrl = request.nextUrl.origin
    const results: any[] = []

    for (const docId of idsToReanalyze) {
        const docInfo = docsInfo?.find(d => d.id === docId)
        try {
            const formData = new FormData()
            formData.append('reanalyzeId', docId)
            formData.append('userId', user.id)

            const response = await fetch(`${baseUrl}/api/parse-pdf`, {
                method: 'POST',
                body: formData,
                headers: { cookie: request.headers.get('cookie') || '' },
            })

            const result = await response.json()
            results.push({
                id: docId.substring(0, 8),
                account: (docInfo?.benchmark_comparison || '').slice(-7),
                period: docInfo ? `${docInfo.period_start} → ${docInfo.period_end}` : '?',
                status: result.success !== false ? 'OK' : 'ERROR',
                error: result.error || null,
            })
        } catch (err: any) {
            results.push({
                id: docId.substring(0, 8),
                account: (docInfo?.benchmark_comparison || '').slice(-7),
                period: docInfo ? `${docInfo.period_start} → ${docInfo.period_end}` : '?',
                status: 'ERROR',
                error: err.message,
            })
        }
    }

    return NextResponse.json({
        action: 'BATCH_REANALYSIS',
        total: idsToReanalyze.length,
        ok: results.filter(r => r.status === 'OK').length,
        errors: results.filter(r => r.status === 'ERROR').length,
        results,
    })
}
