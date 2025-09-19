// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
// supabase/functions/submit_quiz/index.ts
// supabase/functions/submit_quiz/index.ts
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { json, bad, token } from '../_shared/utils.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

interface Body { run_id: string; answers: number[]; client_id: string }

serve(async (req) => {
  if (req.method !== 'POST') return bad('Use POST', 405)
  let body: Body
  try { body = await req.json() } catch { return bad('Invalid JSON') }
  const { run_id, answers, client_id } = body
  if (!run_id || !Array.isArray(answers)) return bad('run_id and answers required')

  // carica run
  const { data: run, error } = await admin
    .from('quiz_runs')
    .select('id, event_id, nickname, run_state, submitted_at, score')
    .eq('id', run_id)
    .single()
  if (error || !run) return bad('Run not found', 404)

  if (run.submitted_at) {
    // idempotenza: restituisci stato precedente (senza rigenerare claim)
    const alreadyPerfect = (run.score === 15)
    return json({ ok: true, already_submitted: true, score: run.score, claim_token: null, perfect: alreadyPerfect })
  }

  const rs = run.run_state as any[]
  if (answers.length !== rs.length) return bad('Invalid answers length')
  let score = 0
  rs.forEach((q, i) => { if (answers[i] === q.correct) score++ })

  const perfect = (score === rs.length)
  let claim_token: string | null = null

  // aggiorna quiz_run
  const upd = { answers, score, submitted_at: new Date().toISOString() }
  if (perfect) {
    claim_token = token(24)
    Object.assign(upd, { claim_token })
  }
  await admin.from('quiz_runs').update(upd).eq('id', run_id)

  // aggiorna scoreboard (solo se nickname prenotato o libero)
  const { data: sb } = await admin
    .from('scoreboard')
    .select('reserved_by, best_score')
    .eq('event_id', run.event_id)
    .eq('nickname', run.nickname)
    .maybeSingle()

  if (!sb || !sb.reserved_by || sb.reserved_by === client_id) {
    const best = Math.max(sb?.best_score ?? 0, score)
    await admin.from('scoreboard').upsert({
      event_id: run.event_id,
      nickname: run.nickname,
      best_score: best,
      perfect_at: perfect ? new Date().toISOString() : sb?.['perfect_at'] ?? null,
      last_run_id: run_id,
      submitted_at: new Date().toISOString(),
      reserved_by: sb?.reserved_by ?? client_id
    }, { onConflict: 'event_id, nickname' })
  }

  return json({ ok: true, score, perfect, claim_token })
})

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/submit_quiz' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
