// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
// supabase/functions/treasure_finish_run/index.ts
// deno-lint-ignore-file no-explicit-any
// supabase/functions/treasure_finish_run/index.ts
// deno-lint-ignore-file no-explicit-any
// supabase/functions/treasure_finish_run/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ============================
   PRNG + world generation (server authoritative)
   ============================ */
function mulberry32(a: number){
  return function(){
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash32(a: number, b: number){
  a = (a ^ 0x9e3779b9) >>> 0;
  a = (a ^ ((a << 6) >>> 0) ^ ((a >>> 2) >>> 0)) >>> 0;
  a = (a + b + 0x7f4a7c15) >>> 0;
  a ^= a << 13; a ^= a >>> 17; a ^= a << 5;
  return a >>> 0;
}
function seedForLevel(baseSeed: number, level: number){ return hash32(baseSeed >>> 0, level >>> 0); }

type Device = "mobile" | "desktop";
type Cell = { rx:number, ry:number, x:number, y:number };
type LevelSpec = {
  exitRoom: {rx:number, ry:number},
  exitTile: {x:number, y:number},
  coins: Cell[],
  powerups: Cell[],
};

const GRID_POOL_DESKTOP: Array<[number,number]> = [[2,2],[3,2],[2,3],[3,3],[4,3],[3,4]];
const GRID_POOL_MOBILE : Array<[number,number]> = [[2,2],[3,2],[2,3],[3,3]];

function pickGridForLevel(level: number, dev: Device, rand: ()=>number){
  const pool = (dev === "mobile") ? GRID_POOL_MOBILE : GRID_POOL_DESKTOP;
  const band = Math.min(pool.length - 1, Math.floor((level - 1) / 3));
  const j = Math.max(0, band - 1);
  const k = Math.min(pool.length - 1, band + 1);
  const idx = j + Math.floor(rand() * (k - j + 1));
  const [w,h] = pool[idx];
  return { gridW: w, gridH: h };
}

function roomWH(dev: Device){
  const w = (dev === "mobile") ? 7 : 9;
  const h = 8;
  return { roomW: w, roomH: h };
}
function getDoorSpan(dev: Device){ return (dev === "mobile") ? 2 : 3; }
function doorIndices(mid: number, span: number, min: number, max: number){
  const k = Math.floor(span / 2);
  let start: number, end: number;
  if (span % 2){ start = mid - k; end = mid + k; }
  else { start = mid - (k - 1); end = mid + k; }
  start = Math.max(min, start); end = Math.min(max, end);
  const arr: number[] = []; for (let i = start; i <= end; i++) arr.push(i); return arr;
}

function generateLevelSpec(level: number, baseSeed: number, dev: Device): LevelSpec {
  const rand = mulberry32(seedForLevel(baseSeed, level));
  const { gridW, gridH } = pickGridForLevel(level, dev, rand);
  const { roomW, roomH } = roomWH(dev);
  const span = getDoorSpan(dev);
  const midRow = Math.floor(roomH/2), midCol = Math.floor(roomW/2);
  const ys = doorIndices(midRow, span, 1, roomH-2);
  const xs = doorIndices(midCol, span, 1, roomW-2);

  const openings = new Map<string, { left:number[], right:number[], top:number[], bottom:number[] }>();
  const openKey = (rx:number,ry:number) => `${rx},${ry}`;
  for (let ry=0; ry<gridH; ry++){
    for (let rx=0; rx<gridW; rx++){
      const left:number[] = [], right:number[] = [], top:number[] = [], bottom:number[] = [];
      if (rx < gridW-1){ for (const y of ys){ right.push(y); } }
      if (rx > 0){       for (const y of ys){ left.push(y); } }
      if (ry < gridH-1){ for (const x of xs){ bottom.push(x); } }
      if (ry > 0){       for (const x of xs){ top.push(x); } }
      openings.set(openKey(rx,ry), {left,right,top,bottom});
    }
  }

  function isOpening(rx:number, ry:number, tx:number, ty:number){
    const op = openings.get(openKey(rx,ry))!;
    if (tx === 0        && op.left.includes(ty))   return true;
    if (tx === roomW-1  && op.right.includes(ty))  return true;
    if (ty === 0        && op.top.includes(tx))    return true;
    if (ty === roomH-1  && op.bottom.includes(tx)) return true;
    return false;
  }
  function isWall(rx:number, ry:number, tx:number, ty:number){
    const onEdge = (tx===0 || ty===0 || tx===roomW-1 || ty===roomH-1);
    if (!onEdge) return false;
    return !isOpening(rx,ry,tx,ty);
  }

  let exitRX: number, exitRY: number;
  do {
    exitRX = Math.floor(rand()*gridW);
    exitRY = Math.floor(rand()*gridH);
  } while (exitRX === Math.floor(gridW/2) && exitRY === Math.floor(gridH/2));
  const exitTile = { x: roomW-2, y: roomH-2 };

  const coins: Cell[] = [];
  const powerups: Cell[] = [];

  for (let ry=0; ry<gridH; ry++){
    for (let rx=0; rx<gridW; rx++){
      const isExitRoom = (rx===exitRX && ry===exitRY);
      const nCoins = isExitRoom ? 1 : (2 + Math.floor(rand()*2)); // 2..3
      const used = new Set<string>();
      const key = (x:number,y:number)=> `${x},${y}`;
      let tries = 0;
      while ((used.size < nCoins) && tries++ < 200){
        const x = 1 + Math.floor(rand()*(roomW-2));
        const y = 1 + Math.floor(rand()*(roomH-2));
        if (isWall(rx,ry,x,y)) continue;
        if (isExitRoom && x===exitTile.x && y===exitTile.y) continue;
        const k = key(x,y);
        if (used.has(k)) continue;
        used.add(k);
      }
      for (const k of used){
        const [x,y] = k.split(",").map(Number);
        coins.push({ rx, ry, x, y });
      }

      if (rand() < 0.35){
        let px=0, py=0, t=0, placed=false;
        while (t++<50 && !placed){
          px = 1 + Math.floor(rand()*(roomW-2));
          py = 1 + Math.floor(rand()*(roomH-2));
          if (isWall(rx,ry,px,py)) continue;
          if (isExitRoom && px===exitTile.x && py===exitTile.y) continue;
          if (coins.some(c => c.rx===rx && c.ry===ry && c.x===px && c.y===py)) continue;
          powerups.push({ rx, ry, x:px, y:py });
          placed = true;
        }
      }
    }
  }

  return {
    exitRoom: { rx:exitRX, ry:exitRY },
    exitTile,
    coins,
    powerups,
  };
}

/* ============================
   HTTP handler
   ============================ */

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

  // --- verifica run (tua) ---
  const r0 = await authed
    .from("treasure_runs")
    .select("id,user_id,status,started_at,coins,powerups,drops,level,score,duration_s")
    .eq("id", run_id)
    .single();

  if (r0.error) return j({ error: `Run lookup failed: ${r0.error.message}` }, 400, headers);
  if (!r0.data || r0.data.user_id !== user.id) return j({ error: "Run not yours" }, 400, headers);

  // --- se già chiusa: solo premi (idempotenti) ---
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
      rewards: rew.error ? { awarded:false, error: rew.error.message } : (rew.data ?? { awarded:false })
    }, 200, headers);
  }

  // --- aggregazioni eventi (RPC preferita) ---
  let coins = 0, powerups = 0, drops = 0, lvl = 1, t0: string | null = null, t1: string | null = null, total = 0;

  const agg = await authed.rpc("treasure_run_aggregate", { p_run_id: run_id });
  if (!agg.error && agg.data) {
    const row = Array.isArray(agg.data) ? agg.data[0] : agg.data;
    coins    = Number(row?.coins ?? 0);
    powerups = Number(row?.powerups ?? 0);
    drops    = Number(row?.drops ?? 0);
    lvl      = Number(row?.lvl ?? 1) || 1;
    t0       = (row?.t0 ?? null) as string | null;
    t1       = (row?.t1 ?? null) as string | null;
    total    = Number(row?.total ?? 0);
  } else {
    if (agg.error) console.log("[finish_run] aggregate RPC error, fallback:", agg.error.message);
    const coinsQ = await authed.from("treasure_events").select("*", { count:"exact", head:true }).eq("run_id", run_id).eq("kind","coin");
    coins = coinsQ.count ?? 0;
    const pwoQ   = await authed.from("treasure_events").select("*", { count:"exact", head:true }).eq("run_id", run_id).eq("kind","powerup");
    powerups = pwoQ.count ?? 0;
    const dropQ  = await authed.from("treasure_events").select("*", { count:"exact", head:true }).eq("run_id", run_id).eq("kind","drop");
    drops = dropQ.count ?? 0;

    const lvlQ = await authed.from("treasure_events").select("v->>lvl").eq("run_id", run_id).eq("kind","hb");
    const lvls = (lvlQ.data ?? []).map((r: any) => Number(r["v->>lvl"]) || 1);
    lvl = Math.max(1, ...lvls, 1);

    const tMin = await authed.from("treasure_events").select("t").eq("run_id", run_id).order("t",{ascending:true}).limit(1).maybeSingle();
    const tMax = await authed.from("treasure_events").select("t").eq("run_id", run_id).order("t",{ascending:false}).limit(1).maybeSingle();
    t0 = tMin.data?.t ?? null;
    t1 = tMax.data?.t ?? null;

    const totQ = await authed.from("treasure_events").select("*", { count:"exact", head:true }).eq("run_id", run_id);
    total = totQ.count ?? 0;
  }

  // --- durata (fallback a started_at) ---
  const firstTS = (t0 ?? r0.data.started_at) as string | null;
  const lastTS  = t1 as string | null;
  const durSec = (firstTS && lastTS)
    ? Math.max(0, Math.floor((+new Date(lastTS) - +new Date(firstTS)) / 1000))
    : 0;

  // --- validazione mappa server-side (seed+device richiesti per convalida piena) ---
  let validated = false;
  try {
    const meta = await authed.from("treasure_runs").select("seed, device").eq("id", run_id).single();
    if (!meta.error && meta.data?.seed != null) {
      const baseSeed = Number(meta.data.seed) >>> 0;
      const device   = (meta.data.device === "mobile") ? "mobile" : "desktop";

      const validCoin = new Set<string>();
      const validPow  = new Set<string>();
      for (let L=1; L<=Math.max(1, lvl|0); L++){
        const spec = generateLevelSpec(L, baseSeed, device);
        for (const c of spec.coins)   validCoin.add(`${c.rx},${c.ry},${c.x},${c.y}`);
        for (const p of spec.powerups) validPow.add(`${p.rx},${p.ry},${p.x},${p.y}`);
      }

      const evQ = await authed
        .from("treasure_events")
        .select("kind, v")
        .eq("run_id", run_id)
        .in("kind", ["coin","powerup","drop"]);

      if (!evQ.error && evQ.data){
        let vCoins=0, vPows=0, vDrops=0;
        // (le unique index già evitano doppioni; qui comunque contiamo “validi”)
        for (const r of evQ.data as any[]){
          const v = r.v || {};
          const key = `${Number(v.rx)||0},${Number(v.ry)||0},${Number(v.x)||0},${Number(v.y)||0}`;
          if (r.kind === "coin") {
            if (validCoin.has(key)) vCoins++;
          } else if (r.kind === "powerup") {
            if (validPow.has(key)) vPows++;
          } else if (r.kind === "drop") {
            vDrops++; // opzionale: validare anche i drop se li generi da seed
          }
        }
        coins    = vCoins;
        powerups = vPows;
        drops    = vDrops;
        validated = true;
      }
    }
  } catch (e) {
    console.log("[finish_run] validation error:", (e as Error)?.message || e);
  }

  // --- anti-cheat base ---
  if (durSec < 1 && total < 5) {
    return j({ error: "Too fast", debug:{ durSec, total, t0, t1, started_at: r0.data.started_at, validated } }, 400, headers);
  }

  // --- punteggio server-side (su conteggi validati se disponibili) ---
  const score = (coins|0) + (powerups|0)*12 + (drops|0)*5;

  // --- chiusura idempotente ---
  const upd = await service
    .from("treasure_runs")
    .update({
      status: "finished",
      ended_at: new Date().toISOString(),
      coins, powerups, drops,
      level: Math.max(1, lvl|0),
      score,
      duration_s: durSec,
      reason,
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

  // --- premi (idempotenti) ---
  const rew = await service.rpc("treasure_apply_rewards", { p_run_id: run_id });
  if (rew.error) console.log("[finish_run] rewards error:", rew.error.message);

  const summary = { coins, powerups, drops, level: Math.max(1, lvl|0), score, duration_s: durSec };

  return j({
    ok: true,
    already_closed,
    summary,
    rewards: rew.error ? { awarded:false, error: rew.error.message } : (rew.data ?? { awarded:false }),
    debug: { durSec, totalEvents: total, validated }
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
