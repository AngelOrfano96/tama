// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
// supabase/functions/treasure_finish_run/index.ts

// supabase/functions/treasure_finish_run/index.ts
// deno-lint-ignore-file no-explicit-any
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateLevelSpec, type Device } from "../_shared/treasure_gen.ts";

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

function detectDevice(req: Request): Device {
  const ch = req.headers.get("sec-ch-ua-mobile");
  if ((ch && /\?1\?/.test(ch)) || ch === "?1") return "mobile";
  const ua = (req.headers.get("user-agent") ?? "").toLowerCase();
  if (ua.includes("mobi")) return "mobile";
  return "desktop";
}

serve(async (req) => {
  const headers = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST")    return j({ error: "Method Not Allowed" }, 405, headers);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  const authed  = createClient(SUPABASE_URL, ANON_KEY,  { global: { headers: { Authorization: authHeader } } });
  const service = createClient(SUPABASE_URL, SERVICE_KEY);

  // --- auth ---
  const { data: { user }, error: getUserErr } = await authed.auth.getUser();
  if (getUserErr) console.log("[finish_run] getUser error:", getUserErr.message);
  if (!user) return j({ error: "Unauthorized" }, 401, headers);

  // --- payload ---
  const body = await req.json().catch(() => ({} as any));
  const run_id = body?.run_id as string | undefined;
  const reason = (body?.reason as string | undefined) ?? "end";
  if (!run_id) return j({ error: "Missing run_id" }, 400, headers);

  // --- run lookup (prendo anche seed/base_seed e device)
  const r0 = await authed
    .from("treasure_runs")
    .select("id,user_id,status,started_at,seed,base_seed,device,level,coins,powerups,drops,score,duration_s")
    .eq("id", run_id)
    .single();

  if (r0.error) return j({ error: `Run lookup failed: ${r0.error.message}` }, 400, headers);
  if (!r0.data || r0.data.user_id !== user.id) return j({ error: "Run not yours" }, 400, headers);

  // --- se non è open: non tocco nulla, provo solo i premi ---
  if (r0.data.status !== "open") {
    const rew = await service.rpc("treasure_apply_rewards", { p_run_id: run_id });
    if (rew.error) console.log("[finish_run] rewards (already closed) error:", rew.error.message);

    const r1 = await service
      .from("treasure_runs")
      .select("coins,powerups,drops,level,score,duration_s,status,ended_at")
      .eq("id", run_id)
      .single();

    const summary = r1.data ?? {
      coins: r0.data.coins ?? 0,
      powerups: r0.data.powerups ?? 0,
      drops: r0.data.drops ?? 0,
      level: r0.data.level ?? 1,
      score: r0.data.score ?? 0,
      duration_s: r0.data.duration_s ?? 0,
    };

    return j({
      ok: true,
      already_closed: true,
      summary,
      rewards: rew.error ? { awarded: false, error: rew.error.message } : (rew.data ?? { awarded: false }),
    }, 200, headers);
  }

  // --- carico eventi ---
  const evQ = await authed
    .from("treasure_events")
    .select("kind,v,t")
    .eq("run_id", run_id)
    .order("t", { ascending: true });

  if (evQ.error) {
    console.log("[finish_run] events load error:", evQ.error.message);
    return j({ error: "Events load failed" }, 400, headers);
  }
  const events = evQ.data ?? [];

  // --- max livello da heartbeat (fallback a run.level) ---
  let maxLvl = Number(r0.data.level ?? 1) || 1;
  for (const e of events) {
    if (e.kind === "hb") {
      const lvl = Number(e?.v?.lvl ?? e?.v?.["lvl"]);
      if (Number.isFinite(lvl) && lvl > maxLvl) maxLvl = lvl;
    }
  }

  // --- base seed & device ---
  const base_seed: number = Number((r0.data as any).base_seed ?? r0.data.seed);
  const device: Device = (r0.data.device === "mobile" || r0.data.device === "desktop")
    ? r0.data.device
    : detectDevice(req);

  // --- conteggio RAW (senza validazione) ---
  const raw = {
    coins:   events.filter(e => e.kind === "coin"    && Number.isFinite(+e?.v?.rx)).length,
    powerup: events.filter(e => e.kind === "powerup" && Number.isFinite(+e?.v?.rx)).length,
    drops:   events.filter(e => e.kind === "drop").length,
    total:   events.length,
  };

  // --- SPEC deterministico lato server ---
  const spec = generateLevelSpec(maxLvl, base_seed, device);
  const allowCoin = new Set(spec.coins.map(c => `${c.rx},${c.ry},${c.x},${c.y}`));
  const allowPow  = new Set(spec.powerups.map(c => `${c.rx},${c.ry},${c.x},${c.y}`));

  // --- validazione contro SPEC ---
  let coins = 0, powerups = 0, drops = 0;
  const seenCoin = new Set<string>();
  const seenPow  = new Set<string>();

  let t0: string | null = null;
  let t1: string | null = null;

  for (const e of events) {
    const t = e.t as string | null;
    if (!t0) t0 = t;
    t1 = t ?? t1;

    if (e.kind === "coin") {
      const rx = Number(e?.v?.rx), ry = Number(e?.v?.ry);
      const x  = Number(e?.v?.x),  y  = Number(e?.v?.y);
      if ([rx,ry,x,y].every(Number.isFinite)) {
        const key = `${rx},${ry},${x},${y}`;
        if (allowCoin.has(key) && !seenCoin.has(key)) {
          seenCoin.add(key);
          coins++;
        }
      }
    } else if (e.kind === "powerup") {
      const rx = Number(e?.v?.rx), ry = Number(e?.v?.ry);
      const x  = Number(e?.v?.x),  y  = Number(e?.v?.y);
      if ([rx,ry,x,y].every(Number.isFinite)) {
        const key = `${rx},${ry},${x},${y}`;
        if (allowPow.has(key) && !seenPow.has(key)) {
          seenPow.add(key);
          powerups++;
        }
      }
    } else if (e.kind === "drop") {
      drops++;
    }
  }

  // --- durata robusta ---
  const firstTS = (t0 ?? r0.data.started_at) as string | null;
  const lastTS  = t1 as string | null;
  const durSec = (firstTS && lastTS)
    ? Math.max(0, Math.floor((+new Date(lastTS) - +new Date(firstTS)) / 1000))
    : 0;

  // --- anti-cheat base ---
// --- anti-cheat: tempo vs pickup + densità eventi ---
// NB: questo blocco va dopo aver calcolato coins/powerups/drops
const totalEvents   = events.length;
const requiredSec    = Math.ceil(Math.max(3, (coins * 0.5) + (powerups * 0.7)));
const requiredEvents = coins + powerups + 3;

if (durSec < requiredSec || totalEvents < requiredEvents) {
  console.log("[finish_run] suspicious run", {
    run_id,
    durSec, requiredSec,
    totalEvents, requiredEvents,
    counts: { coins, powerups, drops },
    t0, t1, started_at: r0.data.started_at,
  });

  return j({
    error: "Suspicious run",
    debug: {
      durSec, requiredSec,
      totalEvents, requiredEvents,
      counts: { coins, powerups, drops },
      t0, t1, started_at: r0.data.started_at,
    }
  }, 400, headers);
}


  // --- HEURISTIC: se lo SPEC non combacia (troppo pochi match), fai FALLBACK DB ---
  // soglia: se hai almeno 3 coin raw ma ne validi < 40%, o 0 validati con >=1 raw → fallback
  const coinMismatch =
    (raw.coins >= 3 && coins < Math.ceil(raw.coins * 0.4)) ||
    (raw.coins >= 1 && coins === 0);

  const powMismatch =
    (raw.powerup >= 2 && powerups < Math.ceil(raw.powerup * 0.5)) ||
    (raw.powerup >= 1 && powerups === 0);

  let usedStrategy: "SPEC" | "FALLBACK" = "SPEC";

  if (coinMismatch || powMismatch) {
    console.log("[finish_run] SPEC mismatch → fallback", {
      base_seed, device, maxLvl,
      raw, validated: { coins, powerups, drops }
    });

    // 1) prova RPC aggregata
    const agg = await authed.rpc("treasure_run_aggregate", { p_run_id: run_id });
    if (!agg.error && agg.data) {
      const row = Array.isArray(agg.data) ? agg.data[0] : agg.data;
      coins    = Number(row?.coins ?? 0);
      powerups = Number(row?.powerups ?? 0);
      drops    = Number(row?.drops ?? 0);
      usedStrategy = "FALLBACK";
    } else {
      if (agg.error) console.log("[finish_run] aggregate RPC error, fallback q:", agg.error.message);
      // 2) fallback con query conteggi
      const cQ = await authed.from("treasure_events").select("*", { count:"exact", head:true })
        .eq("run_id", run_id).eq("kind","coin");
      const pQ = await authed.from("treasure_events").select("*", { count:"exact", head:true })
        .eq("run_id", run_id).eq("kind","powerup");
      const dQ = await authed.from("treasure_events").select("*", { count:"exact", head:true })
        .eq("run_id", run_id).eq("kind","drop");
      coins = cQ.count ?? 0;
      powerups = pQ.count ?? 0;
      drops = dQ.count ?? 0;
      usedStrategy = "FALLBACK";
    }
  }

  const score = (coins|0) + (powerups|0)*12 + (drops|0)*5;

  // --- chiusura idempotente ---
  const upd = await service
    .from("treasure_runs")
    .update({
      status: "finished",
      ended_at: new Date().toISOString(),
      coins, powerups, drops,
      level: maxLvl,
      score,
      duration_s: durSec,
      reason,
      base_seed,
      device,
    })
    .eq("id", run_id)
    .eq("status", "open")
    .select("id,status")
    .maybeSingle();

  if (upd.error) {
    console.log("[finish_run] update error:", upd.error.message);
    return j({ error: upd.error.message }, 400, headers);
  }

  const already_closed = !upd.data;

  // --- premi (idempotente) ---
  const rew = await service.rpc("treasure_apply_rewards", { p_run_id: run_id });
  if (rew.error) console.log("[finish_run] rewards error:", rew.error.message);

  const summary = { coins, powerups, drops, level: maxLvl, score, duration_s: durSec };

  return j({
    ok: true,
    already_closed,
    summary,
    rewards: rew.error ? { awarded: false, error: rew.error.message } : (rew.data ?? { awarded: false }),
    debug: {
      strategy: usedStrategy,
      raw,
      validated: { coins, powerups, drops },
      spec: { allowCoin: allowCoin.size, allowPow: allowPow.size, base_seed, device, maxLvl },
      durSec,
      totalEvents: events.length,
    },
  }, 200, headers);
});







/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/treasure_finish_run' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
