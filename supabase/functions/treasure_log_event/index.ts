// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
// supabase/functions/treasure_log_event/index.ts
// supabase/functions/treasure_log_event/index.ts
// supabase/functions/treasure_log_event/index.ts
// supabase/functions/treasure_log_event/index.ts
// supabase/functions/treasure_log_event/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS + JSON helper
const cors = (req: Request) => ({
  "Access-Control-Allow-Origin": req.headers.get("origin") ?? "*",
  "Vary": "Origin",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "Content-Type": "application/json"
});
const j = (o: unknown, s = 200, h?: HeadersInit) =>
  new Response(JSON.stringify(o), { status: s, headers: h });

serve(async (req) => {
  const headers = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST")    return j({ error: "Method Not Allowed" }, 405, headers);

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
  );

  // ---- auth ----
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return j({ error: "Unauthorized" }, 401, headers);

  // ---- payload ----
  const body = await req.json().catch(() => ({} as any));
  const run_id = body?.run_id as string | undefined;
  const kind   = body?.kind   as string | undefined;
  const v      = (typeof body?.v === "object" && body?.v) ? (body.v as Record<string, unknown>) : {};

  const allowed = new Set(["hb","room","coin","powerup","drop","finish"]);
  if (!run_id || !kind || !allowed.has(kind)) {
    return j({ error: "Bad request: missing/invalid run_id or kind" }, 400, headers);
  }

  // ---- run must be yours & open ----
  const { data: run, error: rerr } = await supa
    .from("treasure_runs")
    .select("id,user_id,status,room_w,room_h")
    .eq("id", run_id)
    .single();

  if (rerr) return j({ error: `Run lookup failed: ${rerr.message}` }, 400, headers);
  if (!run || run.user_id !== user.id || run.status !== "open") {
    return j({ error: "Run not open or not yours" }, 400, headers);
  }

  // ---- simple rate limit (120/min per run) ----
  const oneMinAgo = new Date(Date.now() - 60_000).toISOString();
  const { count: recent } = await supa
    .from("treasure_events")
    .select("*", { count: "exact", head: true })
    .eq("run_id", run_id)
    .gte("t", oneMinAgo);
  if ((recent ?? 0) > 120) return j({ error: "Rate limited" }, 429, headers);

  // ---- helpers ----
  const needInts = (o: Record<string, unknown>, ks: string[]) =>
    ks.every(k => Number.isFinite(Number(o[k])));

  // Bounds fallback (se la run non ha room_w/h)
  // 1) prova v.w/v.h (se li mandi dal client)
  // 2) run.room_w/room_h
  // 3) default 9x8
  const roomW =
    Number(v["w"]) || Number(run?.room_w) || 9;
  const roomH =
    Number(v["h"]) || Number(run?.room_h) || 8;

  // ---- room presence proof + bounds for coin/drop/powerup ----
  const needsRoomProof = (k: string) => (k === "coin" || k === "drop" || k === "powerup");
  if (needsRoomProof(kind)) {
    if (!needInts(v, ["rx","ry","x","y"])) {
      return j({ error: "Bad payload: rx,ry,x,y must be integers" }, 400, headers);
    }
    const rx = Number(v["rx"]), ry = Number(v["ry"]);
    const x  = Number(v["x"]),  y  = Number(v["y"]);

    // check celle interne (niente bordo)
    if (!(x >= 1 && x <= roomW - 2 && y >= 1 && y <= roomH - 2)) {
      return j({ error: "Out-of-bounds", roomW, roomH, x, y }, 400, headers);
    }

    // prova presenza nella stanza negli ultimi 5s (hb o room)
    const fiveSecAgo = new Date(Date.now() - 5_000).toISOString();
    const { count: seen } = await supa
      .from("treasure_events")
      .select("*", { count: "exact", head: true })
      .eq("run_id", run_id)
      .gte("t", fiveSecAgo)
      .or("kind.eq.hb,kind.eq.room")
      .filter("v->>rx","eq", String(rx))
      .filter("v->>ry","eq", String(ry));

    if ((seen ?? 0) === 0) {
      return j({ error: "No recent presence in room" }, 400, headers);
    }
  }

  // ---- base payload ----
  const payload = { run_id, user_id: user.id, kind, v };

  // ---- upsert with conflict handling (dedup coin/drop) ----
  async function upsert(conflictCols: string) {
    const r = await supa.from("treasure_events")
      .upsert(payload, { onConflict: conflictCols, ignoreDuplicates: true, returning: "minimal" });
    if (r.error) {
      // se manca l'indice/constraint o PostgREST non gestisce bene onConflict,
      // fallback ad INSERT "semplice"
      if (/on conflict|index|constraint/i.test(r.error.message)) {
        const ins = await supa.from("treasure_events")
          .insert(payload, { returning: "minimal" });
        return ins;
      }
    }
    return r;
  }

  // route con dedup lato DB
  if (kind === "coin") {
    const r = await upsert("run_id,coin_key");
    if (r.error) {
      const code = r.error.code === "23505" ? 409 : 400;
      return j({ error: r.error.message, code: r.error.code }, code, headers);
    }
    return j({ ok: true }, 200, headers);
  }

  if (kind === "drop") {
    const r = await upsert("run_id,drop_key");
    if (r.error) {
      const code = r.error.code === "23505" ? 409 : 400;
      return j({ error: r.error.message, code: r.error.code }, code, headers);
    }
    return j({ ok: true }, 200, headers);
  }

  // "finish" lo accettiamo ma la chiusura reale avviene nella RPC treasure_finish_run
  // tutto il resto: insert semplice
  const ins = await supa.from("treasure_events")
    .insert(payload, { returning: "minimal" });

  if (ins.error) {
    const code = ins.error.code === "23505" ? 409 : 400;
    return j({ error: ins.error.message, code: ins.error.code }, code, headers);
  }

  return j({ ok: true }, 200, headers);
});





/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/treasure_log_event' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
