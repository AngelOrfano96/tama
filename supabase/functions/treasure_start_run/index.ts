// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
// supabase/functions/treasure_start_run/index.ts
// supabase/functions/treasure_start_run/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateLevelSpec, hashSpec, type Device } from "../_shared/treasure_gen.ts";

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
  if ((ch && /\?1/.test(ch)) || ch === "?1") return "mobile";
  const ua = (req.headers.get("user-agent") ?? "").toLowerCase();
  return ua.includes("mobi") ? "mobile" : "desktop";
}

serve(async (req) => {
  const headers = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST")    return j({ error: "Method Not Allowed" }, 405, headers);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;

  const sb = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }
  });

  // ---- auth ----
  const { data: { user }, error: auErr } = await sb.auth.getUser();
  if (auErr) console.log("[start_run] getUser error:", auErr.message);
  if (!user) return j({ error: "Unauthorized" }, 401, headers);

  // ---- payload ----
  const body = await req.json().catch(() => ({} as any));
  const reqDevice = body?.device === "mobile" || body?.device === "desktop" ? (body.device as Device) : undefined;
  const device: Device = reqDevice ?? detectDevice(req);
  const room_w = device === "mobile" ? 7 : 9;
  const room_h = 8;

  // seed compatibile int4 (positivo, 31 bit)
  const seed32 = (crypto.getRandomValues(new Uint32Array(1))[0]) >>> 0;
  const seed31 = (seed32 & 0x7fffffff);

  // ---- 1) prova a RIUSARE una run 'open' ----
  const open = await sb
    .from("treasure_runs")
    .select("id, seed, device, room_w, room_h, status, spec1_hash")
    .eq("user_id", user.id)
    .eq("status", "open")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!open.error && open.data) {
    const currentSeed   = Number(open.data.seed);
    const currentDevice = (open.data.device === "mobile" || open.data.device === "desktop") ? open.data.device as Device : device;

    // se cambiano dimensioni/device, aggiorna
    const needsUpdate =
      (open.data.room_w ?? room_w) !== room_w ||
      (open.data.room_h ?? room_h) !== room_h ||
      (open.data.device ?? currentDevice) !== device;

    // calcola/ricava spec1_hash (server-side, livello 1)
    const spec1 = generateLevelSpec(1, currentSeed, device);
    const spec1_hash = hashSpec(spec1);

    if (needsUpdate || !open.data.spec1_hash) {
      const upd = await sb
        .from("treasure_runs")
        .update({ room_w, room_h, device, spec1_hash })
        .eq("id", open.data.id)
        .eq("user_id", user.id)
        .eq("status", "open")
        .select("id");
      if (upd.error) console.log("[start_run] reuse update error:", upd.error.message);
    }

    return j(
      {
        run_id: open.data.id,
        seed: currentSeed,
        device,
        room_w,
        room_h,
        spec1_hash,
      },
      200, headers
    );
  }

  // ---- 2) crea una nuova run 'open' ----
  const spec1 = generateLevelSpec(1, seed31, device);
  const spec1_hash = hashSpec(spec1);

  const ins = await sb
    .from("treasure_runs")
    .insert({
      user_id: user.id,
      seed: seed31,
      device,
      room_w,
      room_h,
      status: "open",
      started_at: new Date().toISOString(),
      spec1_hash,
    })
    .select("id, seed, room_w, room_h")
    .single();

  // ---- 2b) race sull'indice unico (una sola OPEN per utente) → rileggi ----
  if (ins.error?.code === "23505") {
    const again = await sb
      .from("treasure_runs")
      .select("id, seed, device, room_w, room_h, spec1_hash")
      .eq("user_id", user.id)
      .eq("status", "open")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!again.error && again.data) {
      // ricalcola hash se assente
      const aSeed = Number(again.data.seed);
      const aDev  = (again.data.device === "mobile" || again.data.device === "desktop") ? again.data.device as Device : device;
      const aHash = again.data.spec1_hash ?? hashSpec(generateLevelSpec(1, aSeed, aDev));
      if (!again.data.spec1_hash) {
        await sb.from("treasure_runs")
          .update({ spec1_hash: aHash })
          .eq("id", again.data.id)
          .eq("user_id", user.id)
          .eq("status", "open");
      }
      return j(
        {
          run_id: again.data.id,
          seed: aSeed,
          device: aDev,
          room_w: again.data.room_w ?? room_w,
          room_h: again.data.room_h ?? room_h,
          spec1_hash: aHash,
        },
        200, headers
      );
    }
  }

  if (ins.error) {
    return j({ error: ins.error.message, code: ins.error.code }, 400, headers);
  }

  return j(
    {
      run_id: ins.data.id,
      seed: Number(ins.data.seed),
      device,
      room_w: ins.data.room_w,
      room_h: ins.data.room_h,
      spec1_hash,
    },
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

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/treasure_start_run' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
