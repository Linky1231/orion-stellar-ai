// Edge function: Orión Estellar - chat + image generation
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

async function sb(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { mode, messages, prompt, imageUrl } = body as {
      mode: "chat" | "image" | "edit-image";
      messages?: Array<{ role: string; content: any }>;
      prompt?: string;
      imageUrl?: string;
    };

    // Image generation
    if (mode === "image") {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${LOVABLE_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3.1-flash-image-preview",
          messages: [{ role: "user", content: prompt }],
          modalities: ["image", "text"],
        }),
      });
      const data = await r.json();
      const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      return new Response(JSON.stringify({ imageUrl: url }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    // Load global config + knowledge + reference images
    const [cfgRes, kbRes, refRes] = await Promise.all([
      sb("orion_config?id=eq.1&select=*"),
      sb("orion_knowledge?select=title,content&order=created_at.desc&limit=200"),
      sb("orion_reference_images?select=name,url,description&order=created_at.desc&limit=50"),
    ]);
    const cfg = (await cfgRes.json())[0] || {};
    const kb = await kbRes.json();
    const refs = await refRes.json();

    const kbText = kb.length
      ? `\n\n## Base de conocimiento exclusivo de Orión:\n${kb.map((k: any) => `### ${k.title}\n${k.content}`).join("\n\n")}`
      : "";
    const refText = refs.length
      ? `\n\n## Imágenes de referencia disponibles:\n${refs.map((r: any) => `- ${r.name}: ${r.description || ""} (${r.url})`).join("\n")}`
      : "";

    const systemPrompt = `${cfg.context || ""}\n\nPersonalidad: ${cfg.personality || ""}\n\nComportamiento: ${cfg.behavior || ""}${kbText}${refText}`;

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${LOVABLE_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5",
        messages: [{ role: "system", content: systemPrompt }, ...(messages || [])],
        stream: true,
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      return new Response(JSON.stringify({ error: t }), {
        status: r.status,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    return new Response(r.body, {
      headers: { ...corsHeaders, "content-type": "text/event-stream" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
