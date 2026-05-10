// Edge function: Orión Estellar - chat + image + memory + notes intelligence
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FREE_AI_URL = "https://text.pollinations.ai/openai";
const FREE_TEXT_MODEL = "openai-fast";

function extractJsonObject(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return {};
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return {}; }
}

async function freeAI(messages: any[], stream = false, jsonMode = false) {
  return fetch(FREE_AI_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: FREE_TEXT_MODEL,
      messages,
      stream,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });
}

function stripReasoningStream(body: ReadableStream<Uint8Array> | null) {
  if (!body) return null;
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line.startsWith("data: ")) {
          if (line === "") controller.enqueue(encoder.encode("\n"));
          continue;
        }
        const json = line.slice(6).trim();
        if (json === "[DONE]") {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          continue;
        }
        try {
          const event = JSON.parse(json);
          const delta = event.choices?.[0]?.delta;
          if (!delta?.content) continue;
          delete delta.reasoning;
          delete delta.reasoning_content;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Drop malformed partial events; the next chunk will contain a complete line.
        }
      }
    },
  }));
}

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

async function safeJson(r: Response) {
  const text = await r.text();
  try { return JSON.parse(text); } catch { return null; }
}

async function aiJSON(messages: any[], schema: any, name: string, _model = FREE_TEXT_MODEL) {
  const r = await freeAI([
    { role: "system", content: `Devuelve únicamente JSON válido para la función ${name}, sin markdown ni explicación. Esquema esperado: ${JSON.stringify(schema)}` },
    ...messages,
  ], false, true);
  const d = await safeJson(r);
  const content = d?.choices?.[0]?.message?.content || "{}";
  try { return JSON.parse(content); } catch { return extractJsonObject(content); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { mode, messages, prompt, deviceId, text, notes } = body as any;

    // Image generation
    if (mode === "image") {
      const cleanPrompt = encodeURIComponent(String(prompt || "imagen creativa"));
      const url = `https://image.pollinations.ai/prompt/${cleanPrompt}?width=1024&height=1024&model=flux&nologo=true&enhance=true&seed=${Date.now()}`;
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
      const r = await freeAI([
        { role: "system", content: `Eres Orión Estellar, asistente especializada en desarrollo de videojuegos indie. Tu función NO es actuar como chatbot genérico ni consultor corporativo. Analizas notas de proyectos de videojuegos de forma clara, útil, estratégica y breve.

REGLAS:
- Prioriza claridad sobre cantidad. Evita relleno motivacional, repeticiones y lenguaje corporativo (NO uses: stakeholders, KPIs, sinergia, pipeline, OKR, scrum empresarial).
- Adapta el análisis a desarrolladores indie pequeños o solitarios.

ANÁLISIS — detecta:
1. Contradicciones. 2. Scope creep. 3. Prioridades incorrectas. 4. Sistemas incompletos. 5. Problemas de gameplay/claridad. 6. Tareas abandonadas o inconsistentes.

RESPUESTA — directa, organizada, corta, accionable.

FORMATO OBLIGATORIO (markdown, exactamente estas secciones):

# Resumen rápido
Máximo 3 problemas importantes.

# Riesgos detectados
Solo riesgos reales y relevantes.

# Próximas acciones
Máximo 3 acciones prioritarias.

# Scope
Indica si el proyecto está controlado, tiene riesgo moderado o tiene scope peligroso.

REGLAS ESTRICTAS:
- NO más de 3 recomendaciones principales. NO ensayos largos. NO actuar como gerente corporativo. NO inventar procesos complejos. NO sugerir herramientas empresariales. NO recomendar features extra si el core gameplay no está terminado.
- Prioriza siempre: 1) gameplay base, 2) estabilidad, 3) claridad, 4) MVP.

ESTILO: inteligente, elegante, analítico, preciso, profesional, directo. Nunca infantil, emocional ni complaciente. Siéntete como una productora AI especializada en videojuegos indie.` },
        { role: "user", content: `Notas del proyecto:\n\n${(notes || []).map((n: any) => `### [${n.status}] ${n.category || "?"} — ${n.title}\n${n.content}\n(Última actividad: ${n.last_activity})`).join("\n\n")}` },
      ]);
      if (!r.ok) {
        const t = await r.text();
        return new Response(JSON.stringify({ analysis: "", error: `AI ${r.status}: ${t.slice(0, 200)}` }), { headers: { ...corsHeaders, "content-type": "application/json" } });
      }
      const d = await safeJson(r);
      return new Response(JSON.stringify({ analysis: d?.choices?.[0]?.message?.content || "" }), { headers: { ...corsHeaders, "content-type": "application/json" } });
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

    const r = await freeAI([{ role: "system", content: systemPrompt }, ...(messages || [])], true);

    if (!r.ok) {
      const t = await r.text();
      return new Response(JSON.stringify({ error: t }), { status: r.status, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    return new Response(stripReasoningStream(r.body), { headers: { ...corsHeaders, "content-type": "text/event-stream" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});
