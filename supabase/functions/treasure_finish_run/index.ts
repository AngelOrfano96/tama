// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = (req: Request) => ({
  "Access-Control-Allow-Origin": req.headers.get("origin") ?? "*",
  "Vary": "Origin",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "Content-Type": "application/json"
});

serve(async (req) => {
  const headers = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST")
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405, headers });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
  );

  // auth
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });

  // body
  const body = await req.json().catch(() => ({}));
  const run_id = body?.run_id as string | undefined;
  if (!run_id) return new Response(JSON.stringify({ error: "Missing run_id" }), { status: 400, headers });

  // run deve esistere ed essere dell'utente
  // (niente select su colonne “extra” per restare tolleranti)
  const { data: run, error: runErr } = await supabase
    .from("treasure_runs")
    .select("id,user_id")
    .eq("id", run_id)
    .single();

  if (runErr) return new Response(JSON.stringify({ error: runErr.message }), { status: 400, headers });
  if (!run || run.user_id !== user.id) {
    return new Response(JSON.stringify({ error: "Run not yours" }), { status: 400, headers });
  }

  // prendi tutti gli eventi della run (di solito sono pochi)
  const { data: evs, error: evErr } = await supabase
    .from("treasure_events")
    .select("kind,v,t")
    .eq("run_id", run_id)
    .order("t", { ascending: true });

  if (evErr) return new Response(JSON.stringify({ error: evErr.message }), { status: 400, headers });

  // aggregazione lato server
  let coins = 0, powerups = 0, drops = 0, level = 1;
  const coinSet = new Set<string>();
  const roomsSet = new Set<string>();
  const dropKeys = new Set<string>();

  for (const e of evs ?? []) {
    const k = e.kind;
    const v = (e as any).v || {};
    if (k === "coin") {
      const key = `${v.rx},${v.ry},${v.x},${v.y}`;
      if (!coinSet.has(key)) { coinSet.add(key); coins++; }
    } else if (k === "powerup") {
      powerups++;
    } else if (k === "drop") {
      const dk = typeof v.key === "string" ? v.key : "";
      if (dk) { drops++; dropKeys.add(dk); }
    } else if (k === "room") {
      roomsSet.add(`${v.rx},${v.ry}`);
    } else if (k === "hb") {
      if (Number.isFinite(v.lvl)) level = Math.max(level, Number(v.lvl));
      roomsSet.add(`${v.rx},${v.ry}`);
    }
  }

  // formula di score coerente col client:
  //  - coin: +1
  //  - powerup: +12
  //  - drop (icona mossa): +5
  const score = coins * 1 + powerups * 12 + drops * 5;

  const summary = {
    score, level, coins, powerups, drops,
    distinct_drop_keys: [...dropKeys],
    rooms_visited: roomsSet.size,
    events: evs?.length ?? 0
  };

  // prova ad aggiornare la run marcandola come finita (tollerante se mancano colonne)
  // NB: se hai le colonne suggerite, questo passerà con RLS "update own".
  const updateObj: Record<string, unknown> = {
    status: "finished",
    finished_at: new Date().toISOString(),
    score,
    level,
    summary
  };

  let updErr: any = null;
  const upd = await supabase.from("treasure_runs").update(updateObj).eq("id", run_id);
  if (upd.error) {
    // fallback “tollerante”: ritenta con solo finished_at
    updErr = upd.error;
    await supabase.from("treasure_runs").update({ finished_at: new Date().toISOString() }).eq("id", run_id);
  }

  return new Response(JSON.stringify({ ok: true, summary, note: updErr?.message }), { status: 200, headers });
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/treasure_finish_run' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
