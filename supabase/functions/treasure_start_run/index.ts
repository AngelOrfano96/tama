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

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
  );

  // ---- auth ----
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return j({ error: "Unauthorized" }, 401, headers);

  // ---- payload ----
  const body = await req.json().catch(() => ({} as any));
  const device: "mobile" | "desktop" = body?.device === "mobile" ? "mobile" : "desktop";
  const room_w = device === "mobile" ? 7 : 9;
  const room_h = 8;

  // seed compatibile con int4 (se usi BIGINT puoi usare seed32)
  const seed32 = (crypto.getRandomValues(new Uint32Array(1))[0]) >>> 0;
  const seed31 = (seed32 & 0x7fffffff);

  // ---- 1) prova a RIUSARE una run 'open' ----
  const open = await sb
    .from("treasure_runs")
    .select("id, seed, room_w, room_h, device, status")
    .eq("user_id", user.id)
    .eq("status", "open")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!open.error && open.data) {
    // opzionale: allinea dimensioni/device se cambiano (policy: "runs upd own open")
    const needsUpdate =
      (open.data.room_w ?? room_w) !== room_w ||
      (open.data.room_h ?? room_h) !== room_h ||
      (open.data.device ?? device) !== device;

    if (needsUpdate) {
      const upd = await sb
        .from("treasure_runs")
        .update({ room_w, room_h, device })
        .eq("id", open.data.id)
        .eq("user_id", user.id)
        .eq("status", "open")
        .select("id, seed, room_w, room_h")
        .maybeSingle();

      if (!upd.error && upd.data) {
        return j(
          { run_id: upd.data.id, seed: Number(upd.data.seed), room_w: upd.data.room_w, room_h: upd.data.room_h },
          200, headers
        );
      }
      // se l'update fallisce (RLS ecc.), riusa comunque la run esistente
    }

    return j(
      { run_id: open.data.id, seed: Number(open.data.seed), room_w: open.data.room_w ?? room_w, room_h: open.data.room_h ?? room_h },
      200, headers
    );
  }

  // ---- 2) crea una nuova run 'open' ----
  const ins = await sb
    .from("treasure_runs")
    .insert({
      user_id: user.id,
      seed: seed31,        // se la colonna è BIGINT puoi usare seed32
      device,
      room_w,
      room_h,
      status: "open",
      started_at: new Date().toISOString(),
    })
    .select("id, seed, room_w, room_h")
    .single();

  // ---- 2b) race sull'indice unico → rileggi e restituisci la 'open' ----
  if (ins.error?.code === "23505") {
    const again = await sb
      .from("treasure_runs")
      .select("id, seed, room_w, room_h")
      .eq("user_id", user.id)
      .eq("status", "open")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!again.error && again.data) {
      return j(
        { run_id: again.data.id, seed: Number(again.data.seed), room_w: again.data.room_w, room_h: again.data.room_h },
        200, headers
      );
    }
  }

  if (ins.error) {
    return j({ error: ins.error.message, code: ins.error.code }, 400, headers);
  }

  return j(
    { run_id: ins.data.id, seed: Number(ins.data.seed), room_w: ins.data.room_w, room_h: ins.data.room_h },
    200, headers
  );
});




/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/treasure_start_run' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
