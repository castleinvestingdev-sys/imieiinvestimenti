import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import path from 'path'

async function main() {
  const envPath = path.join(process.cwd(), '.env.local')
  const envContent = readFileSync(envPath, 'utf-8')
  const env: Record<string, string> = {}
  envContent.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=')
    if (key && vals.length) env[key.trim()] = vals.join('=').trim()
  })

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'leonrivas27@gmail.com', password: '123456'
  })
  if (authErr) { console.error('Auth error:', authErr.message); return }
  const userId = authData.user.id
  console.log('Logged in:', userId)

  // Count active (non-deleted) analyses
  const { count: activeCount } = await supabase
    .from('analyses')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('deleted_at', null)

  console.log('Active analyses (not deleted):', activeCount)

  if (!activeCount || activeCount === 0) {
    console.log('Nothing to delete')
    return
  }

  // Soft delete all in batches
  let total = 0
  const now = new Date().toISOString()
  while (total < (activeCount + 100)) {
    const { data } = await supabase
      .from('analyses')
      .select('id')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .limit(500)

    if (!data || data.length === 0) break

    const ids = data.map(a => a.id)
    const { error: updErr } = await supabase
      .from('analyses')
      .update({ deleted_at: now })
      .in('id', ids)

    if (updErr) { console.error('Update error:', updErr.message); break }
    total += ids.length
    process.stdout.write(`\rSoft-deleted: ${total}`)
  }

  console.log('')

  // Now hard delete (permanently) the soft-deleted ones
  let hardTotal = 0
  while (true) {
    const { data } = await supabase
      .from('analyses')
      .select('id')
      .eq('user_id', userId)
      .not('deleted_at', 'is', null)
      .limit(200)

    if (!data || data.length === 0) break

    for (const row of data) {
      const { error } = await supabase.from('analyses').delete().eq('id', row.id)
      if (!error) hardTotal++
    }
    process.stdout.write(`\rHard-deleted: ${hardTotal}`)
  }

  console.log('')

  const { count: finalCount } = await supabase
    .from('analyses')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)

  console.log('Final total count:', finalCount)

  const { count: activeLeft } = await supabase
    .from('analyses')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('deleted_at', null)

  console.log('Final active count:', activeLeft)
}

main().catch(console.error)
