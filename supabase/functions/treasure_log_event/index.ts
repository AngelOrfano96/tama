// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
// supabase/functions/treasure_log_event/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
  );
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { run_id, kind, v } = await req.json().catch(()=> ({}));
  const okKind = ["hb","room","coin","powerup","drop"];
  if (!run_id || !okKind.includes(kind)) return new Response("Bad request", { status: 400 });

  // run valida e aperta
  const { data: run } = await supa.from("treasure_runs")
    .select("id,user_id,status,events").eq("id", run_id).single();
  if (!run || run.user_id !== user.id || run.status !== "open")
    return new Response("Run not open", { status: 400 });

  // rate limit semplice: max 120 ev/min
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await supa.from("treasure_events")
    .select("*", { count: "exact", head: true })
    .eq("run_id", run_id).gte("t", since);
  if ((count ?? 0) >= 120) return new Response("Rate limited", { status: 429 });

  const ins = await supa.from("treasure_events").insert({
    run_id, user_id: user.id, kind, v: v ?? {}
  });
  if (ins.error) return new Response(ins.error.message, { status: 400 });

  await supa.from("treasure_runs")
    .update({ events: (run.events ?? 0) + 1 })
    .eq("id", run_id);

  return new Response("ok");
});


/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/treasure_log_event' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
