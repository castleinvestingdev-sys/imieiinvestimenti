import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    let totalCleaned = 0
    let totalSoftDeleted = 0

    // Step 1: Soft-delete all active analyses
    while (true) {
        const { data } = await supabase
            .from('analyses')
            .select('id')
            .eq('user_id', user.id)
            .is('deleted_at', null)
            .limit(200)

        if (!data || data.length === 0) break

        const now = new Date().toISOString()
        await supabase
            .from('analyses')
            .update({ deleted_at: now })
            .in('id', data.map(a => a.id))
        totalSoftDeleted += data.length
    }

    // Step 2: Strip large JSONB data from ALL soft-deleted rows to free DB space
    // This is the key optimization: costs_breakdown can be 50-200KB per row
    while (true) {
        const { data } = await supabase
            .from('analyses')
            .select('id')
            .eq('user_id', user.id)
            .not('deleted_at', 'is', null)
            .not('costs_breakdown', 'is', null)
            .limit(200)

        if (!data || data.length === 0) break

        const { error } = await supabase
            .from('analyses')
            .update({
                costs_breakdown: null,
                holdings: null,
            })
            .in('id', data.map(a => a.id))

        if (error) {
            return NextResponse.json({ error: error.message, totalCleaned, totalSoftDeleted }, { status: 500 })
        }

        totalCleaned += data.length
    }

    return NextResponse.json({ success: true, totalSoftDeleted, totalCleaned })
}
