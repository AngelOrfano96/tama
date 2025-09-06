// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
// deno-lint-ignore-file no-explicit-any
// supabase/functions/treasure_finish_run/index.ts
// supabase/functions/treasure_finish_run/index.ts
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
const j = (o: unknown, s = 200, h?: HeadersInit) =>
  new Response(JSON.stringify(o), { status: s, headers: h });

serve(async (req) => {
  const headers = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST")    return j({ error: "Method Not Allowed" }, 405, headers);

  const authed = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
  );
  const service = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ---- auth ----
  const { data: { user } } = await authed.auth.getUser();
  if (!user) return j({ error: "Unauthorized" }, 401, headers);

  // ---- payload ----
  const body = await req.json().catch(() => ({} as any));
  const run_id = body?.run_id as string | undefined;
  const reason = (body?.reason as string | undefined) ?? "end";
  if (!run_id) return j({ error: "Missing run_id" }, 400, headers);

  // ---- verifica run (tua & open) ----
  const { data: run, error: rerr } = await authed
    .from("treasure_runs")
    .select("id,user_id,status,started_at")
    .eq("id", run_id)
    .single();

  if (rerr) return j({ error: `Run lookup failed: ${rerr.message}` }, 400, headers);
  if (!run || run.user_id !== user.id) return j({ error: "Run not yours" }, 400, headers);
  if (run.status !== "open")           return j({ error: "Run already closed" }, 409, headers);

  // ---- aggregazioni eventi (RPC se esiste, altrimenti fallback) ----
  let coins = 0, powerups = 0, drops = 0, lvl = 1, t0: string | null = null, t1: string | null = null, total = 0;

  const { data: stats, error: aerr } = await authed.rpc("treasure_run_aggregate", { p_run_id: run_id });
  if (!aerr && stats) {
    ({ coins, powerups, drops, lvl, t0, t1, total } = stats);
  } else {
    // counts
    const coinsQ = await authed.from("treasure_events").select("*", { count: "exact", head: true }).eq("run_id", run_id).eq("kind","coin");
    coins = coinsQ.count ?? 0;
    const pwoQ   = await authed.from("treasure_events").select("*", { count: "exact", head: true }).eq("run_id", run_id).eq("kind","powerup");
    powerups = pwoQ.count ?? 0;
    const dropQ  = await authed.from("treasure_events").select("*", { count: "exact", head: true }).eq("run_id", run_id).eq("kind","drop");
    drops = dropQ.count ?? 0;

    // max lvl dai heartbeat
    const lvlQ = await authed
      .from("treasure_events")
      .select("v->>lvl")
      .eq("run_id", run_id)
      .eq("kind","hb");
    const lvls = (lvlQ.data ?? []).map((r: any) => Number(r["v->>lvl"]) || 1);
    lvl = Math.max(1, ...lvls);

    // t0/t1
    const tMin = await authed.from("treasure_events").select("t").eq("run_id", run_id).order("t",{ascending:true}).limit(1).maybeSingle();
    const tMax = await authed.from("treasure_events").select("t").eq("run_id", run_id).order("t",{ascending:false}).limit(1).maybeSingle();
    t0 = tMin.data?.t ?? null;
    t1 = tMax.data?.t ?? null;

    const totQ = await authed.from("treasure_events").select("*", { count:"exact", head:true }).eq("run_id", run_id);
    total = totQ.count ?? 0;
  }

  const durSec = (t0 && t1) ? Math.max(0, Math.floor((+new Date(t1) - +new Date(t0)) / 1000)) : 0;

  // ---- anti-cheat low-effort ----
  if (durSec < 5)        return j({ error: "Too fast" }, 400, headers);
  if (durSec > 15*60) { /* se vuoi, flag AFK/abuse */ }

  // ---- punteggio server-side ----
  const score = (coins|0) + (powerups|0)*12 + (drops|0)*5;

  // ---- chiusura idempotente della run ----
  const upd = await service
    .from("treasure_runs")
    .update({
      status: "closed",
      ended_at: new Date().toISOString(),
      coins, powerups, drops,
      level: lvl,
      score,
      duration_s: durSec,
      reason,
    })
    .eq("id", run_id)
    .eq("status", "open")     // <— idempotente: chiudi solo se ancora open
    .select("id")
    .maybeSingle();

  if (upd.error) return j({ error: upd.error.message }, 400, headers);
  if (!upd.data) return j({ error: "Run already closed" }, 409, headers);

  // (OPZIONALE) premi lato server: attiva solo se NON li dai già lato client
  const fun = 15 + Math.round(score * 0.6);
  const exp = Math.round(score * 0.5);
  // es.: await service.rpc('treasure_apply_rewards', { p_user_id: user.id, p_coins: coins, p_fun: fun, p_exp: exp });

  return j({ ok: true, summary: { coins, powerups, drops, level: lvl, score, duration_s: durSec, fun, exp } }, 200, headers);
});




/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/treasure_finish_run' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
