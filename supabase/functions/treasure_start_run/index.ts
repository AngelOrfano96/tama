// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
// supabase/functions/treasure_start_run/index.ts
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
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
  );

  // 🔐 auth
  const { data: { user } } = await authed.auth.getUser();
  if (!user) return j({ error: "Unauthorized" }, 401, headers);

  // 📦 body
  const body   = await req.json().catch(() => ({} as any));
  const device = body?.device === "mobile" ? "mobile" : "desktop";
  const room_w = device === "mobile" ? 7 : 9;
  const room_h = 8;

  // 🎲 seed sicuro (se la colonna è INT4 usa seed31)
  const seed32 = (crypto.getRandomValues(new Uint32Array(1))[0]) >>> 0;
  const seed31 = (seed32 & 0x7fffffff); // compatibile con int4

  // 1) prova a RIUSARE una run ancora 'open' dell'utente
  const open = await authed
    .from("treasure_runs")
    .select("id, seed, room_w, room_h, device, status")
    .eq("user_id", user.id)
    .eq("status", "open")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!open.error && open.data) {
    // se il device / dimensioni stanza sono cambiati, aggiorna (idempotente)
    const mustUpdate =
      (open.data.room_w ?? room_w) !== room_w ||
      (open.data.room_h ?? room_h) !== room_h ||
      (open.data.device ?? device) !== device;

    if (mustUpdate) {
      const upd = await authed
        .from("treasure_runs")
        .update({ room_w, room_h, device })
        .eq("id", open.data.id)
        .eq("user_id", user.id)
        .eq("status", "open")
        .select("id, seed, room_w, room_h")
        .single();

      if (!upd.error && upd.data) {
        return j({ run_id: upd.data.id, seed: Number(upd.data.seed), room_w: upd.data.room_w, room_h: upd.data.room_h }, 200, headers);
      }
      // se l'update fallisce per RLS o altro, riusa comunque la run esistente
    }

    return j({ run_id: open.data.id, seed: Number(open.data.seed), room_w: open.data.room_w ?? room_w, room_h: open.data.room_h ?? room_h }, 200, headers);
  }

  // 2) altrimenti CREA una nuova run 'open'
  const ins = await authed
    .from("treasure_runs")
    .insert({
      user_id: user.id,
      seed: seed31,          // se la colonna è BIGINT puoi usare seed32
      device,
      room_w,
      room_h,
      status: "open",        // deve essere ammesso dal CHECK constraint
      started_at: new Date().toISOString(),
    })
    .select("id, seed, room_w, room_h")
    .single();

  if (ins.error) return j({ error: ins.error.message }, 400, headers);

  return j({
    run_id: ins.data.id,
    seed: Number(ins.data.seed),
    room_w: ins.data.room_w,
    room_h: ins.data.room_h,
  }, 200, headers);
});





/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/treasure_start_run' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
