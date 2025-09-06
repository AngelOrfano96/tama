// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
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
});

serve(async (req) => {
  const headers = cors(req);

  // Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  // Solo POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers,
    });
  }

  // Auth via bearer del client
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers,
    });
  }

  // Body
  const body = await req.json().catch(() => ({}));
  const { run_id, kind, v } = body ?? {};

  const ALLOWED = new Set(["hb", "room", "coin", "powerup", "drop"]);
  if (!run_id || !ALLOWED.has(kind)) {
    return new Response(JSON.stringify({ error: "Bad request" }), {
      status: 400,
      headers,
    });
  }

  // La run deve essere "open" e dell’utente
  const { data: run, error: runErr } = await supabase
    .from("treasure_runs")
    .select("id,user_id,status,events,started_at")
    .eq("id", run_id)
    .single();

  if (runErr || !run || run.user_id !== user.id || run.status !== "open") {
    return new Response(JSON.stringify({ error: "Run not open" }), {
      status: 400,
      headers,
    });
  }

  // Rate limit semplice: max 120 eventi/minuto
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await supabase
    .from("treasure_events")
    .select("*", { count: "exact", head: true })
    .eq("run_id", run_id)
    .gte("t", since);

  if ((count ?? 0) > 120) {
    return new Response(JSON.stringify({ error: "Rate limited" }), {
      status: 429,
      headers,
    });
  }

  // Inserisci evento
  const ins = await supabase.from("treasure_events").insert({
    run_id,
    user_id: user.id,
    kind,
    v: v ?? {},
  });

  if (ins.error) {
    return new Response(JSON.stringify({ error: ins.error.message }), {
      status: 400,
      headers,
    });
  }

  // (facoltativo) incrementa contatore eventi sulla run
  await supabase
    .from("treasure_runs")
    .update({ events: (run.events ?? 0) + 1 })
    .eq("id", run_id)
    .eq("user_id", user.id);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers,
  });
});



/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/treasure_log_event' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
