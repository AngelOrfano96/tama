// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
// supabase/functions/claim_prize/index.ts
// supabase/functions/claim_prize/index.ts  (versione consigliata)
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { json, bad } from '../_shared/utils.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

interface Body { event_id?: string; event_slug?: string; run_id: string; claim_token: string }

serve(async (req) => {
  if (req.method !== 'POST') return bad('Use POST', 405)
  let body: Body
  try { body = await req.json() } catch { return bad('Invalid JSON') }
  const { event_id, event_slug, run_id, claim_token } = body
  if (!run_id || !claim_token) return bad('run_id and claim_token required')

  // carica run e verifica perfect
  const { data: run, error: rErr } = await admin
    .from('quiz_runs')
    .select('id, event_id, nickname, score, claim_token')
    .eq('id', run_id)
    .single()
  if (rErr || !run) return bad('Run not found', 404)
  if (run.score !== 15 || run.claim_token !== claim_token) return bad('Not eligible to claim', 403)

  // trova evento
  let evId = event_id
  if (!evId) {
    if (event_slug) {
      const { data: ev, error } = await admin.from('events').select('id').eq('slug', event_slug).maybeSingle()
      if (error || !ev) return bad('Event not found')
      evId = ev.id
    } else {
      evId = run.event_id
    }
  }

  // UPDATE atomica condizionata
  const { data: updated, error: updErr } = await admin
    .from('events')
    .update({
      winner_run_id: run_id,
      winner_username: run.nickname,
      prize_claimed_at: new Date().toISOString(),
      is_claimable: false
    })
    .eq('id', evId)
    .is('winner_run_id', null)
    .eq('is_claimable', true)
    .select('id, winner_username')
    .maybeSingle()

  if (updErr) return bad('Claim failed')
  const winnerAssigned = !!updated

  if (winnerAssigned) {
    await admin.from('scoreboard')
      .update({ is_winner: true, perfect_at: new Date().toISOString() })
      .eq('event_id', evId)
      .eq('nickname', run.nickname)
  }

  return json({ ok: true, winner_assigned: winnerAssigned, winner_username: run.nickname })
})

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/claim_prize' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
