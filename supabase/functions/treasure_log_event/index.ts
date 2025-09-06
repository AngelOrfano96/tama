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

// CORS helper
const cors = (req: Request) => ({
  "Access-Control-Allow-Origin": req.headers.get("origin") ?? "*",
  "Vary": "Origin",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
});

// util per risposte JSON
const jres = (obj: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(obj), { status, headers });

serve(async (req) => {
  const headers = cors(req);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return jres({ error: "Method Not Allowed" }, 405, headers);

  // client "authed" propagando l'Authorization dall'utente
  const authed = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
  );

  // autenticazione
  const { data: { user } } = await authed.auth.getUser();
  if (!user) return jres({ error: "Unauthorized" }, 401, headers);

  // input
  const body = await req.json().catch(() => ({}));
  const run_id: string | undefined = body?.run_id;
  const kind: string | undefined   = body?.kind;
  const v: Record<string, unknown> = (typeof body?.v === "object" && body?.v) ? body.v : {};

  const allowed = new Set(["hb", "room", "coin", "powerup", "drop", "finish"]);
  if (!run_id || !kind || !allowed.has(kind)) {
    return jres({ error: "Bad request: missing/invalid run_id or kind" }, 400, headers);
  }

  // run deve esistere ed essere dell'utente
  const { data: run, error: runErr } = await authed
    .from("treasure_runs")
    .select("id, user_id")
    .eq("id", run_id)
    .single();

  if (runErr)   return jres({ error: runErr.message }, 400, headers);
  if (!run || run.user_id !== user.id)
    return jres({ error: "Run not found or not yours" }, 400, headers);

  // rate limit: max 120 eventi/min su quella run
  const oneMinAgo = new Date(Date.now() - 60_000).toISOString();
  const { count } = await authed
    .from("treasure_events")
    .select("*", { count: "exact", head: true })
    .eq("run_id", run_id)
    .gte("t", oneMinAgo);
  if ((count ?? 0) > 120) return jres({ error: "Rate limited" }, 429, headers);

  // validazioni leggere per "coin" e "drop" (giusto per non sporcare i key column)
  if (kind === "coin") {
    const need = ["rx","ry","x","y"];
    const ok = need.every(k => Number.isFinite(Number(v?.[k as keyof typeof v])));
    if (!ok) return jres({ error: "Bad coin payload" }, 400, headers);
  }
  if (kind === "drop") {
    if (typeof v?.["key" as keyof typeof v] !== "string" || String(v["key"]).length === 0) {
      return jres({ error: "Bad drop payload: missing key" }, 400, headers);
    }
  }

  // payload base
  const payload = { run_id, user_id: user.id, kind, v };

  // funzione helper: upsert con dedup + fallback a insert se l'indice non esiste
  async function upsertWithDedup(conflictCols: string) {
    const res = await authed
      .from("treasure_events")
      .upsert(payload, {
        onConflict: conflictCols,             // es. "run_id,coin_key"
        ignoreDuplicates: true,               // niente errore se già presente
        returning: "minimal",                 // meno traffico
      });
    if (res.error) {
      // se l'indice/constrain non esiste ancora, facciamo un semplice insert
      const msg = res.error.message || "";
      if (/constraint|index|on conflict/i.test(msg)) {
        const ins = await authed.from("treasure_events").insert(payload, { returning: "minimal" });
        if (ins.error) return { error: ins.error };
        return { ok: true };
      }
      return { error: res.error };
    }
    return { ok: true };
  }

  // instrada per kind
  if (kind === "coin") {
    const out = await upsertWithDedup("run_id,coin_key");
    if ("error" in out) return jres({ error: out.error.message }, 400, headers);
    return jres({ ok: true }, 200, headers);
  }

  if (kind === "drop") {
    const out = await upsertWithDedup("run_id,drop_key");
    if ("error" in out) return jres({ error: out.error.message }, 400, headers);
    return jres({ ok: true }, 200, headers);
  }

  // altri eventi: insert semplice
  const ins = await authed
    .from("treasure_events")
    .insert(payload, { returning: "minimal" });

  if (ins.error) return jres({ error: ins.error.message }, 400, headers);

  return jres({ ok: true }, 200, headers);
});





/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/treasure_log_event' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
