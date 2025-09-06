// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
// supabase/functions/treasure_log_event/index.ts
// supabase/functions/treasure_log_event/index.ts
// supabase/functions/treasure_log_event/index.ts
// supabase/functions/treasure_log_event/index.ts
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
const j = (o: unknown, s=200, h?:HeadersInit)=>new Response(JSON.stringify(o),{status:s,headers:h});

serve(async (req) => {
  const headers = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return j({ error: "Method Not Allowed" }, 405, headers);

  const authed = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
  );

  const { data: { user } } = await authed.auth.getUser();
  if (!user) return j({ error: "Unauthorized" }, 401, headers);

  const body = await req.json().catch(() => ({}));
  const run_id = body?.run_id as string | undefined;
  const kind   = body?.kind   as string | undefined;
  const v      = (typeof body?.v === "object" && body?.v) ? body.v as Record<string,unknown> : {};

  const allowed = new Set(["hb","room","coin","powerup","drop","finish"]);
  if (!run_id || !kind || !allowed.has(kind)) return j({ error: "Bad request" }, 400, headers);

  const { data: run, error: rerr } = await authed
    .from("treasure_runs")
    .select("id,user_id,status,room_w,room_h")
    .eq("id", run_id)
    .single();
  if (rerr) return j({ error: rerr.message }, 400, headers);
  if (!run || run.user_id !== user.id || run.status !== "open") return j({ error: "Run not open or not yours" }, 400, headers);

  // rate limit 120/min
  const oneMinAgo = new Date(Date.now() - 60_000).toISOString();
  const { count } = await authed
    .from("treasure_events")
    .select("*", { count: "exact", head: true })
    .eq("run_id", run_id)
    .gte("t", oneMinAgo);
  if ((count ?? 0) > 120) return j({ error: "Rate limited" }, 429, headers);

  // helper
  const needInts = (o:Record<string,unknown>, ks:string[]) =>
    ks.every(k => Number.isFinite(Number(o[k])));

  // validate coords + proximity proof (recent room/hb) per coin/drop/powerup
  const needsRoomProof = (k:string)=> (k==="coin" || k==="drop" || k==="powerup");
  if (needsRoomProof(kind)) {
    if (!needInts(v, ["rx","ry","x","y"])) return j({ error: "Bad payload coords" }, 400, headers);

    const rx = Number(v["rx"]), ry = Number(v["ry"]);
    const x  = Number(v["x"]),  y  = Number(v["y"]);

    // dentro stanza, NO bordi
    if (!(x>=1 && x<=run.room_w-2 && y>=1 && y<=run.room_h-2)) {
      return j({ error: "Out-of-bounds" }, 400, headers);
    }

    // prova di presenza recente nella stanza (ultimo 5s)
    const fiveSecAgo = new Date(Date.now() - 5_000).toISOString();
    const { count: seen } = await authed
      .from("treasure_events")
      .select("*", { count:"exact", head:true })
      .eq("run_id", run_id)
      .gte("t", fiveSecAgo)
      .or("kind.eq.hb,kind.eq.room")
      .filter("v->>rx","eq", String(rx))
      .filter("v->>ry","eq", String(ry));
    if ((seen ?? 0) === 0) return j({ error: "No recent presence in room" }, 400, headers);
  }

  // payload base
  const payload = { run_id, user_id: user.id, kind, v };

  // upsert dedup helpers
  async function upsert(conflictCols:string){
    const r = await authed.from("treasure_events")
      .upsert(payload, { onConflict: conflictCols, ignoreDuplicates: true, returning: "minimal" });
    if (r.error) {
      // fallback se indice non c'è ancora
      if (/on conflict|index|constraint/i.test(r.error.message)) {
        const ins = await authed.from("treasure_events").insert(payload, { returning: "minimal" });
        if (ins.error) return ins;
        return { data: null, error: null };
      }
    }
    return r;
  }

  // route by kind
  if (kind === "coin")   { const r = await upsert("run_id,coin_key"); if (r.error) return j({ error: r.error.message }, 400, headers); return j({ ok:true }, 200, headers); }
  if (kind === "drop")   { const r = await upsert("run_id,drop_key"); if (r.error) return j({ error: r.error.message }, 400, headers); return j({ ok:true }, 200, headers); }
  if (kind === "finish") { /* accettiamo ma la chiusura vera avviene in treasure_finish_run */ }

  // default insert
  const ins = await authed.from("treasure_events").insert(payload, { returning: "minimal" });
  if (ins.error) return j({ error: ins.error.message }, 400, headers);
  return j({ ok:true }, 200, headers);
});





/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/treasure_log_event' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
