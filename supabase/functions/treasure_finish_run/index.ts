// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
// deno-lint-ignore-file no-explicit-any
// supabase/functions/treasure_finish_run/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = (req: Request) => ({
  "Access-Control-Allow-Origin": req.headers.get("origin") ?? "*",
  "Vary": "Origin",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
});

const ALLOWED_DROP_MOVES = new Set(["ball"]); // allinea con il client

serve(async (req) => {
  const headers = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405, headers });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
  );

  // auth
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });

  // body
  const { run_id, reason, pet_id } = await req.json().catch(() => ({}));
  if (!run_id) return new Response(JSON.stringify({ error: "Bad request: missing run_id" }), { status: 400, headers });

  // run check
  const { data: run, error: runErr } = await supabase
    .from("treasure_runs")
    .select("id,user_id,status,started_at")
    .eq("id", run_id)
    .single();

  if (runErr) return new Response(JSON.stringify({ error: runErr.message }), { status: 400, headers });
  if (!run || run.user_id !== user.id || run.status !== "open") {
    return new Response(JSON.stringify({ error: "Run not open or not yours" }), { status: 400, headers });
  }

  // eventi della run
  const { data: evs, error: evErr } = await supabase
    .from("treasure_events")
    .select("kind, v")
    .eq("run_id", run_id);

  if (evErr) return new Response(JSON.stringify({ error: evErr.message }), { status: 400, headers });

  // aggregazioni base
  let coins = 0;
  let powerups = 0;
  const drops = new Set<string>();

  for (const e of (evs ?? [])) {
    if (e.kind === "coin") coins++;
    else if (e.kind === "powerup") powerups++;
    else if (e.kind === "drop") {
      const k = typeof e.v?.key === "string" ? e.v.key : null;
      if (k && ALLOWED_DROP_MOVES.has(k)) drops.add(k);
    }
  }

  // punteggio server (coerente con client: +1 coin, +12 powerup, +5 drop)
  const score_server = (coins * 1) + (powerups * 12) + (drops.size * 5);

  // assegna i drop al pet (se fornito)
  const awarded: string[] = [];
  if (pet_id && drops.size > 0) {
    for (const mv of drops) {
      // tua RPC lato DB (SECURITY DEFINER consigliato)
      const { error: rpcErr } = await supabase.rpc("award_move_drop", {
        p_pet_id: pet_id,
        p_move_key: mv,
      });
      if (!rpcErr) awarded.push(mv);
      // se fallisce, prosegui sugli altri
    }
  }

  // chiudi la run (best effort: se RLS blocca l'UPDATE, non falliamo la risposta)
  const ended_at = new Date().toISOString();
  await supabase
    .from("treasure_runs")
    .update({ status: "closed", ended_at, coins, score_server, reason: reason ?? null })
    .eq("id", run_id)
    .eq("user_id", user.id);

  // risposta
  const summary = {
    coins,
    powerups,
    awarded_moves: awarded,
    score_server,
    level_server: null as number | null, // se in futuro vorrai dedurlo dagli eventi
  };

  return new Response(JSON.stringify({ ok: true, summary }), { status: 200, headers });
});


/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/treasure_finish_run' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
