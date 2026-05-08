// Edge function: Orión Estellar - chat + image + memory + notes intelligence
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

async function aiJSON(messages: any[], schema: any, name: string, model = "google/gemini-2.5-flash") {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${LOVABLE_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      tools: [{ type: "function", function: { name, description: "Return structured data", parameters: schema } }],
      tool_choice: { type: "function", function: { name } },
    }),
  });
  const d = await r.json();
  const args = d.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  try { return JSON.parse(args || "{}"); } catch { return {}; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { mode, messages, prompt, deviceId, text, notes } = body as any;

    // Image generation
    if (mode === "image") {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${LOVABLE_API_KEY}`, "content-type": "application/json" },
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

    // Extract memory facts from a user message
    if (mode === "extract-memory") {
      const out = await aiJSON(
        [
          { role: "system", content: "Extrae hechos personales, preferencias, proyectos, decisiones técnicas o info útil del usuario que valga la pena recordar a futuro. Si no hay nada relevante, devuelve array vacío. Sé conciso (1 frase por hecho), en español." },
          { role: "user", content: text || "" },
        ],
        {
          type: "object",
          properties: {
            facts: {
              type: "array",
              items: { type: "object", properties: { content: { type: "string" }, kind: { type: "string", enum: ["fact", "preference", "project", "decision"] } }, required: ["content", "kind"] },
            },
          },
          required: ["facts"],
        },
        "save_facts",
        "google/gemini-2.5-flash-lite",
      );
      return new Response(JSON.stringify(out), { headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    // Classify a single note
    if (mode === "classify-note") {
      const out = await aiJSON(
        [
          { role: "system", content: "Clasifica una nota de desarrollo de videojuegos. Devuelve categoría, resumen breve (1 frase), estado sugerido y sección. Categorías válidas: gameplay, lore, ui, multiplayer, economia, audio, bugs, arte, programacion, otros. Estado: stable, development, problematic, abandoned. Sección: main (ideas/diseño) o dev (tareas/bugs/programación)." },
          { role: "user", content: `Título: ${body.title || ""}\n\nContenido: ${body.content || ""}` },
        ],
        {
          type: "object",
          properties: {
            category: { type: "string" },
            summary: { type: "string" },
            status: { type: "string" },
            section: { type: "string" },
          },
          required: ["category", "summary", "status", "section"],
        },
        "classify",
      );
      return new Response(JSON.stringify(out), { headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    // Analyze project across notes
    if (mode === "analyze-project") {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${LOVABLE_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: "openai/gpt-5-mini",
          messages: [
            { role: "system", content: "Eres Orión, analista de proyectos indie. Analiza las notas y detecta: tareas abandonadas, sistemas incompletos, scope creep, contradicciones, prioridades rotas. Sé directo, claro, en español, con bullets y emojis. Da consejos accionables y personalizados." },
            { role: "user", content: `Notas del proyecto:\n\n${(notes || []).map((n: any) => `### [${n.status}] ${n.category || "?"} — ${n.title}\n${n.content}\n(Última actividad: ${n.last_activity})`).join("\n\n")}` },
          ],
        }),
      });
      const d = await r.json();
      return new Response(JSON.stringify({ analysis: d.choices?.[0]?.message?.content || "" }), { headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    // CHAT mode — load config, knowledge, refs, AND personal context
    const [cfgRes, kbRes, refRes, memRes, notesRes] = await Promise.all([
      sb("orion_config?id=eq.1&select=*"),
      sb("orion_knowledge?select=title,content&order=created_at.desc&limit=200"),
      sb("orion_reference_images?select=name,url,description&order=created_at.desc&limit=50"),
      deviceId ? sb(`user_memory?device_id=eq.${encodeURIComponent(deviceId)}&select=content,kind&order=created_at.desc&limit=80`) : Promise.resolve(new Response("[]")),
      deviceId ? sb(`notes?device_id=eq.${encodeURIComponent(deviceId)}&select=title,category,status,section,ai_summary,content&order=updated_at.desc&limit=40`) : Promise.resolve(new Response("[]")),
    ]);
    const cfg = (await cfgRes.json())[0] || {};
    const kb = await kbRes.json();
    const refs = await refRes.json();
    const mem = await memRes.json();
    const userNotes = await notesRes.json();

    const kbText = kb.length ? `\n\n## Base de conocimiento de Orión:\n${kb.map((k: any) => `### ${k.title}\n${k.content}`).join("\n\n")}` : "";
    const refText = refs.length ? `\n\n## Imágenes de referencia disponibles:\n${refs.map((r: any) => `- ${r.name}: ${r.description || ""} (${r.url})`).join("\n")}` : "";
    const memText = mem.length ? `\n\n## Contexto personal del usuario (memoria a largo plazo):\n${mem.map((m: any) => `- [${m.kind}] ${m.content}`).join("\n")}` : "";
    const notesText = userNotes.length ? `\n\n## Notas del proyecto del usuario:\n${userNotes.map((n: any) => `- (${n.section}/${n.status}/${n.category || "?"}) ${n.title}: ${n.ai_summary || n.content?.slice(0, 200)}`).join("\n")}` : "";

    const systemPrompt = `${cfg.context || ""}\n\nPersonalidad: ${cfg.personality || ""}\n\nComportamiento: ${cfg.behavior || ""}${kbText}${refText}${memText}${notesText}\n\nUsa el contexto personal y las notas para personalizar tus respuestas. Cuando sea relevante, haz referencia a lo que sabes del usuario y su proyecto.`;

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${LOVABLE_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: systemPrompt }, ...(messages || [])],
        stream: true,
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      return new Response(JSON.stringify({ error: t }), { status: r.status, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    return new Response(r.body, { headers: { ...corsHeaders, "content-type": "text/event-stream" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});
