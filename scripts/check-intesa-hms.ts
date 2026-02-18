import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import path from 'path'

const envContent = readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8')
const env: Record<string, string> = {}
envContent.split('\n').forEach(l => {
  const [k, ...v] = l.split('=')
  if (k && v.length) env[k.trim()] = v.join('=').trim()
})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

async function main() {
  const { data } = await supabase.auth.signInWithPassword({
    email: 'leonrivas27@gmail.com',
    password: '123456',
  })
  if (!data?.user) { console.log('Login failed'); return }

  const { data: analyses } = await supabase
    .from('analyses')
    .select('period_start, period_end, bank_name, costs_breakdown')
    .eq('user_id', data.user.id)
    .is('deleted_at', null)
    .order('period_end')

  for (const a of analyses || []) {
    const hms = a.costs_breakdown?.hasMovementsSection
    const nMov = (a.costs_breakdown?.securityMovements || []).length
    const bank = a.bank_name || '?'
    console.log(`${a.period_start} -> ${a.period_end} | ${bank} | hasMovSec=${hms} | nMov=${nMov}`)
  }
}

main().catch(console.error)
