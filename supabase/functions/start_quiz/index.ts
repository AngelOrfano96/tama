// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// supabase/functions/start_quiz/index.ts
// supabase/functions/start_quiz/index.ts
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { json, bad, shuffle, sha256Hex } from '../_shared/utils.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

interface Body {
  event_slug?: string
  event_id?: string
  nickname: string
  client_id: string
}

serve(async (req) => {
  if (req.method !== 'POST') return bad('Use POST', 405)
  const ip = req.headers.get('x-forwarded-for') ?? ''
  const ua = req.headers.get('user-agent') ?? ''
  let body: Body
  try { body = await req.json() } catch { return bad('Invalid JSON') }
  const { event_slug, event_id, nickname, client_id } = body
  if (!nickname || !client_id) return bad('nickname and client_id required')

  // 1) trova evento
  let eventId = event_id
  if (!eventId) {
    const { data: ev, error } = await admin
      .from('events')
      .select('id')
      .eq('is_open', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error || !ev) return bad('No open event found')
    eventId = ev.id
  }

  // 2) prenota nickname (se libero) su scoreboard
  // Se già presente con reserved_by diverso, errore
  const { data: sbRow } = await admin
    .from('scoreboard')
    .select('reserved_by')
    .eq('event_id', eventId)
    .eq('nickname', nickname)
    .maybeSingle()

  if (sbRow && sbRow.reserved_by && sbRow.reserved_by !== client_id) {
    return bad('Nickname already in use')
  }

  // upsert (riserva se libero)
  await admin.from('scoreboard').upsert({
    event_id: eventId,
    nickname,
    reserved_by: client_id
  }, { onConflict: 'event_id, nickname' })

  // 3) pesca 15 domande (9 game + 6 anime; fallback se insufficienti)
  const pick = async (cat: 'game'|'anime', lim: number) => {
    const { data, error } = await admin.rpc('pick_random_questions', { cat, lim })
    if (error) throw error
    return data as any[]
  }

  let game = await pick('game', 9)
  let anime = await pick('anime', 6)

  // fallback: se poche anime o game, ribilancia
  if (anime.length < 6) {
    const extra = await pick('game', 6 - anime.length)
    game = game.concat(extra)
  }
  if (game.length < 9) {
    const extra = await pick('anime', 9 - game.length)
    anime = anime.concat(extra)
  }

  const chosen = shuffle([...game, ...anime]).slice(0, 15)

  // prepara run_state con opzioni mescolate
  const run_state = chosen.map((q) => {
    const idxs = [0,1,2,3]
    const shuffledIdxs = shuffle(idxs)
    const options = shuffledIdxs.map(i => q.options[i])
    const correct = shuffledIdxs.indexOf(q.correct_index)
    return {
      qid: q.id,
      question: q.question,         // utile per audit
      options,
      correct,
      image_url: q.image_url ?? null
    }
  })

  // salva quiz_run
  const ipHash = await sha256Hex(ip)
  const { data: run, error: runErr } = await admin
    .from('quiz_runs')
    .insert({
      event_id: eventId,
      client_id,
      nickname,
      run_state,
      ip_hash: ipHash,
      ua
    })
    .select('id')
    .single()
  if (runErr) return bad('Could not create run')

  // payload per il client: senza indici corretti
  const questions = run_state.map((x, i) => ({
    idx: i,
    qid: x.qid,
    question: x.question,
    options: x.options,
    image_url: x.image_url
  }))

  return json({ ok: true, event_id: eventId, run_id: run.id, questions })
})
/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/start_quiz' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
