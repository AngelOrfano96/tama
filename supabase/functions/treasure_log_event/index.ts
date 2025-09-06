// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
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
  "Content-Type": "application/json" 
});

serve(async (req) => {
  const headers = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405, headers });

  const authed = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
  );

  const { data: { user } } = await authed.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });

  const { run_id, kind, v } = await req.json().catch(() => ({}));
  const allowed = new Set(["hb","room","coin","powerup","drop"]);
  if (!run_id || !allowed.has(kind)) {
    return new Response(JSON.stringify({ error: "Bad request: missing/invalid run_id or kind" }), { status: 400, headers });
  }

  // run deve esistere, essere tua e "open"
  const { data: run, error: runErr } = await authed
    .from("treasure_runs")
    .select("id,user_id,status,started_at")
    .eq("id", run_id)
    .single();
  if (runErr) return new Response(JSON.stringify({ error: runErr.message }), { status: 400, headers });
  if (!run || run.user_id !== user.id || run.status !== "open") {
    return new Response(JSON.stringify({ error: "Run not open or not yours" }), { status: 400, headers });
  }

  // rate limit semplice
  const oneMinAgo = new Date(Date.now() - 60_000).toISOString();
  const { count } = await authed
    .from("treasure_events")
    .select("*", { count: "exact", head: true })
    .eq("run_id", run_id)
    .gte("t", oneMinAgo);
  if ((count ?? 0) > 120) {
    return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers });
  }

  // INSERT evento (passa RLS perché user_id = auth.uid())
  const ins = await authed.from("treasure_events").insert({
    run_id, user_id: user.id, kind, v: v ?? {}
  });
  if (ins.error) {
    return new Response(JSON.stringify({ error: ins.error.message }), { status: 400, headers });
  }

  // 🔴 RIMOSSO: niente UPDATE a treasure_runs qui (RLS lo blocca)
  // (faremo il conteggio eventi in finish, o vedi opzione service-role sotto)

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
});




/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/treasure_log_event' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
