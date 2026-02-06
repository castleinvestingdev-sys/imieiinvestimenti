import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
    try {
        const { analysisId } = await request.json()

        if (!analysisId) {
            return NextResponse.json({ success: false, error: 'analysisId mancante' }, { status: 400 })
        }

        const supabase = await createClient()

        // Fetch the analysis
        const { data: analysis, error: fetchError } = await supabase
            .from('analyses')
            .select('*')
            .eq('id', analysisId)
            .single()

        if (fetchError || !analysis) {
            return NextResponse.json({ success: false, error: 'Analisi non trovata' }, { status: 404 })
        }

        // Only process DOSSIER documents with securityMovements
        if (analysis.account_type !== 'DOSSIER') {
            return NextResponse.json({ success: false, error: 'Solo documenti DOSSIER supportati' }, { status: 400 })
        }

        const costsBreakdown = analysis.costs_breakdown || {}
        const securityMovements = costsBreakdown.securityMovements || []

        if (securityMovements.length === 0) {
            return NextResponse.json({ success: false, error: 'Nessun movimento titoli da ricalcolare' }, { status: 400 })
        }

        // Recalculate costs for each movement
        const updatedMovements = securityMovements.map((m: any) => {
            const exchangeRate = m.exchangeRate && m.exchangeRate !== 0 ? m.exchangeRate : 1
            const quantity = m.quantity || 0
            const price = m.price || 0
            const netAmount = m.netAmount || 0

            // grossAmount: use existing or calculate
            const grossAmount = m.grossAmount || (quantity * price * exchangeRate)

            // Current fees/taxes are what was extracted from PDF
            const feesExtracted = m.fees || 0
            const taxesExtracted = m.taxes || 0
            const costsExtracted = feesExtracted + taxesExtracted

            // Calculate costs from difference: |netto - lordo|
            const costsCalculated = grossAmount > 0 && netAmount !== 0
                ? Math.abs(Math.abs(netAmount) - grossAmount)
                : 0

            // Determine source
            const costsSource = costsExtracted > 0.01 ? 'extracted' : 'calculated'

            // If nothing was extracted, use calculated value
            let fees = feesExtracted
            let taxes = taxesExtracted

            if (fees === 0 && taxes === 0 && costsCalculated > 0.01) {
                fees = costsCalculated
            }

            return {
                ...m,
                exchangeRate,
                grossAmount: Math.round(grossAmount * 100) / 100,
                fees,
                taxes,
                costsExtracted,
                costsCalculated: Math.round(costsCalculated * 100) / 100,
                costsSource
            }
        })

        // Update the analysis
        const updatedCostsBreakdown = {
            ...costsBreakdown,
            securityMovements: updatedMovements
        }

        const { error: updateError } = await supabase
            .from('analyses')
            .update({ costs_breakdown: updatedCostsBreakdown })
            .eq('id', analysisId)

        if (updateError) {
            return NextResponse.json({ success: false, error: 'Errore aggiornamento: ' + updateError.message }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            message: `Ricalcolati ${updatedMovements.length} movimenti`,
            movementsUpdated: updatedMovements.length
        })

    } catch (error: any) {
        console.error('Errore ricalcolo costi:', error)
        return NextResponse.json({ success: false, error: error.message || 'Errore interno' }, { status: 500 })
    }
}
