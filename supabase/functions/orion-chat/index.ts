// Edge function: Orión Estellar - chat + image + memory + notes intelligence
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const FREE_AI_URL = "https://text.pollinations.ai/openai";
const FREE_TEXT_MODEL = "openai-fast";

function supabaseAdminHeaders(extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { apikey: SUPABASE_SERVICE_ROLE_KEY, ...extra };
  if (SUPABASE_SERVICE_ROLE_KEY.split(".").length === 3) headers.authorization = `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
  return headers;
}

const DEBUG_PROMPT = `Estás en MODO DEBUG VISUAL. Analiza la captura real del videojuego indie con precisión profesional como directora de arte + UX lead.

Detecta problemas visibles de UI/UX, HUD, contraste, alineación, márgenes, gameplay visual, pulido, arte, cámara, combate, menús, rendimiento aparente, diseño de niveles, profesionalismo y placeholders.

FORMATO OBLIGATORIO markdown:
# Diagnóstico visual
1-2 frases sobre lo que se ve y la sensación general.

# Problemas detectados
Lista priorizada, máximo 6. Cada item: **[Categoría] Problema concreto** — por qué afecta al jugador.

# Cómo arreglarlo
Soluciones específicas y accionables para cada problema.

# Veredicto
Profesional / semi-pulido / prototipo + el cambio #1 que más subiría la calidad percibida.

Reglas: directo, técnico, honesto. No inventes problemas no visibles. Si no es un videojuego, dilo.`;

function extractJsonObject(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return {};
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return {}; }
}

async function freeAI(messages: any[], stream = false, jsonMode = false): Promise<Response> {
  // Retry with backoff on 429 (Pollinations queue full), then fall back to Lovable AI
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(FREE_AI_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: FREE_TEXT_MODEL,
        messages,
        stream,
        ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (r.status !== 429) return r;
    try { await r.body?.cancel(); } catch { /* ignore */ }
    await new Promise((res) => setTimeout(res, 800 * (attempt + 1)));
  }
  // Fallback: Lovable AI Gateway
  if (LOVABLE_API_KEY) {
    return fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        stream,
        ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
    });
  }
  // Last resort: return the 429 so caller surfaces a clean error
  return fetch(FREE_AI_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: FREE_TEXT_MODEL, messages, stream }),
  });
}

async function freeVisionAI(messages: any[], stream = false): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(FREE_AI_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "openai", messages, stream }),
    });
    if (r.status !== 429) return r;
    try { await r.body?.cancel(); } catch { /* ignore */ }
    await new Promise((res) => setTimeout(res, 800 * (attempt + 1)));
  }
  return lovableAI(messages, stream, "google/gemini-2.5-flash");
}

async function lovableAI(messages: any[], stream = false, model = "google/gemini-2.5-flash") {
  if (!LOVABLE_API_KEY) return freeAI(messages, stream);
  return fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
    body: JSON.stringify({ model, messages, stream }),
  });
}

function normalizeAiErrorText(text: string) {
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed?.message === "string") return parsed.message;
    if (typeof parsed?.error === "string") return normalizeAiErrorText(parsed.error);
  } catch {
    // Keep the original text when the upstream response is not JSON.
  }
  return text || "El servicio de IA no respondió correctamente.";
}

function aiErrorResponse(status: number, text: string, stream = false) {
  const message = normalizeAiErrorText(text);
  if (status === 429 || message.toLowerCase().includes("queue full") || message.toLowerCase().includes("rate limit")) {
    const safeMessage = "El servicio gratuito está saturado ahora mismo. Espera unos segundos e inténtalo de nuevo.";
    if (stream) {
      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: safeMessage } }] })}\n\n`));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          },
        }),
        { status: 200, headers: { ...corsHeaders, "content-type": "text/event-stream" } },
      );
    }
    return new Response(JSON.stringify({ error: "RATE_LIMITED", message: safeMessage, fallback: false }), {
      status: 200,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
  if (status === 402 || message.toLowerCase().includes("not enough credits") || message.toLowerCase().includes("payment_required")) {
    const safeMessage = "No hay créditos suficientes para completar esta acción. Añade saldo en Settings → Workspace → Cloud & AI balance.";
    if (stream) {
      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: safeMessage } }] })}\n\n`));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          },
        }),
        { status: 200, headers: { ...corsHeaders, "content-type": "text/event-stream" } },
      );
    }
    return new Response(JSON.stringify({ error: "PAYMENT_REQUIRED", message: safeMessage, fallback: false }), {
      status: 200,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ error: message }), { status, headers: { ...corsHeaders, "content-type": "application/json" } });
}

function compactNotesForPrompt(userNotes: any[]) {
  if (!Array.isArray(userNotes) || userNotes.length === 0) return "";
  return userNotes.slice(0, 12).map((n: any) => `${n.title}: ${n.ai_summary || String(n.content || "").slice(0, 180)}`).join(" | ");
}

async function getUserNotes(deviceId?: string) {
  if (!deviceId) return [];
  const res = await sb(`notes?device_id=eq.${encodeURIComponent(deviceId)}&select=title,category,status,section,ai_summary,content&order=updated_at.desc&limit=30`);
  try { return await res.json(); } catch { return []; }
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
    headers: supabaseAdminHeaders({
      "content-type": "application/json",
      ...(init.headers || {}),
    } as Record<string, string>),
  });
}

async function safeJson(r: Response) {
  const text = await r.text();
  try { return JSON.parse(text); } catch { return null; }
}

function base64ToBytes(b64: string) {
  const bin = atob(b64.includes(",") ? b64.split(",").pop() || "" : b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function findImageBase64(value: any): string | null {
  if (!value || typeof value !== "object") return null;
  if (typeof value.b64_json === "string" && value.b64_json.length > 100) return value.b64_json;
  if (typeof value.image?.data === "string" && value.image.data.length > 100) return value.image.data;
  if (typeof value.data === "string" && value.data.length > 100 && value.extra_content?.google?.mime_type?.startsWith("image/")) return value.data;
  if (typeof value.image_url?.url === "string" && value.image_url.url.startsWith("data:image/")) return value.image_url.url;
  if (typeof value.url === "string" && value.url.startsWith("data:image/")) return value.url;
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = findImageBase64(item);
        if (found) return found;
      }
    } else if (child && typeof child === "object") {
      const found = findImageBase64(child);
      if (found) return found;
    }
  }
  return null;
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
      const userNotes = await getUserNotes(deviceId);
      const noteContext = compactNotesForPrompt(userNotes);
      const enrichedPrompt = noteContext
        ? `${String(prompt || "imagen creativa")}. Contexto del proyecto indie del usuario: ${noteContext}. Mantén coherencia con esas notas.`
        : String(prompt || "imagen creativa");
      const cleanPrompt = encodeURIComponent(enrichedPrompt.slice(0, 1800));

      let imgBytes: Uint8Array | null = null;
      let contentType = "image/png";
      let lastErr = "";
      const lovableKey = Deno.env.get("LOVABLE_API_KEY");
      const finalPrompt = enrichedPrompt.slice(0, 1800);

      // Primary: Lovable AI Gateway. Gemini image models return images through
      // chat completions; image-only models use the images endpoint.
      const attempts: Array<{ model: string; endpoint: "chat" | "images"; body: any }> = lovableKey ? [
        {
          model: "google/gemini-3-pro-image-preview",
          endpoint: "chat",
          body: {
            model: "google/gemini-3-pro-image-preview",
            messages: [{ role: "user", content: finalPrompt }],
            modalities: ["image", "text"],
          },
        },
        {
          model: "google/gemini-2.5-flash-image",
          endpoint: "chat",
          body: {
            model: "google/gemini-2.5-flash-image",
            messages: [{ role: "user", content: finalPrompt }],
            modalities: ["image", "text"],
          },
        },
        {
          model: "openai/gpt-image-2",
          endpoint: "images",
          body: {
            model: "openai/gpt-image-2",
            prompt: finalPrompt,
            quality: "medium",
            size: "1024x1024",
            n: 1,
            response_format: "b64_json",
          },
        },
        {
          model: "google/imagen-4.0-generate-001",
          endpoint: "images",
          body: {
            model: "google/imagen-4.0-generate-001",
            prompt: finalPrompt,
            aspect_ratio: "1:1",
            n: 1,
            response_format: "b64_json",
          },
        },
      ] : [];

      for (const att of attempts) {
        try {
          const gw = await fetch(`https://ai.gateway.lovable.dev/v1/${att.endpoint === "chat" ? "chat/completions" : "images/generations"}`, {
            method: "POST",
            headers: { "content-type": "application/json", "Lovable-API-Key": lovableKey! },
            body: JSON.stringify(att.body),
          });
          if (gw.ok) {
            const j = await gw.json();
            const b64 = findImageBase64(j);
            if (b64) { imgBytes = base64ToBytes(b64); contentType = "image/png"; break; }
            lastErr += ` | ${att.model}: sin imagen`;
          } else {
            const gwText = await gw.text().catch(() => "");
            lastErr += ` | ${att.model} HTTP ${gw.status}${gwText ? `: ${gwText.slice(0, 200)}` : ""}`;
            // 402 (no credits) — no point trying more
            if (gw.status === 402) break;
          }
        } catch (e) { lastErr += ` | ${att.model} error: ${String(e)}`; }
      }

      // Fallback: Pollinations (free, no key).
      if (!imgBytes) {
        const polToken = Deno.env.get("POLLINATIONS_TOKEN") || "";
        const polRef = polToken ? `&token=${encodeURIComponent(polToken)}` : "&referrer=orion-estellar.lovable.app";
        const polUrl = `https://image.pollinations.ai/prompt/${cleanPrompt}?width=1024&height=1024&model=flux&nologo=true&enhance=true&seed=${Date.now()}${polRef}`;
        try {
          const r = await fetch(polUrl, { headers: { accept: "image/*", referer: "https://orion-estellar.lovable.app" } });
          if (r.ok) {
            const ct = r.headers.get("content-type") || "";
            if (!ct.includes("text/html") && !ct.includes("application/json")) {
              contentType = ct || "image/jpeg";
              imgBytes = new Uint8Array(await r.arrayBuffer());
            } else { lastErr += ` | pollinations tipo inválido (${ct})`; }
          } else { lastErr += ` | pollinations HTTP ${r.status}`; }
        } catch (e) { lastErr += ` | pollinations error: ${String(e)}`; }
      }

      if (!imgBytes) {
        return new Response(JSON.stringify({
          error: "IMAGE_GENERATION_UNAVAILABLE",
          message: lastErr.includes("402")
            ? "El proveedor gratuito de imágenes rechazó la petición y el generador alternativo no devolvió una imagen. Intenta de nuevo con una descripción más concreta o espera unos minutos."
            : `No se pudo generar la imagen: ${lastErr}`,
          fallback: true,
        }), { status: 200, headers: { ...corsHeaders, "content-type": "application/json" } });
      }
      const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
      const path = `generated/${crypto.randomUUID()}.${ext}`;
      const up = await fetch(`${SUPABASE_URL}/storage/v1/object/chat-attachments/${path}`, {
        method: "POST",
        headers: supabaseAdminHeaders({
          "content-type": contentType,
          "x-upsert": "false",
        }),
        body: imgBytes,
      });
      if (!up.ok) {
        const t = await up.text();
        return new Response(JSON.stringify({ error: `No se pudo guardar la imagen: ${t}` }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
      }
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/chat-attachments/${path}`;
      return new Response(JSON.stringify({ imageUrl: publicUrl }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    if (mode === "debug-visual") {
      const { imageUrl } = body as any;
      if (!imageUrl) return new Response(JSON.stringify({ error: "Falta imagen para analizar." }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });

      // Fetch image and convert to base64 data URL so the vision model can read it reliably
      let dataUrl = imageUrl;
      try {
        if (!String(imageUrl).startsWith("data:")) {
          const imgRes = await fetch(imageUrl);
          if (!imgRes.ok) throw new Error(`No se pudo descargar la imagen (${imgRes.status})`);
          const ct = imgRes.headers.get("content-type") || "image/png";
          const buf = new Uint8Array(await imgRes.arrayBuffer());
          let bin = "";
          for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
          const b64 = btoa(bin);
          dataUrl = `data:${ct};base64,${b64}`;
        }
      } catch (e) {
        return new Response(JSON.stringify({ error: `No pude leer la imagen: ${String(e)}` }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });
      }

      const visionMessages = [
        { role: "system", content: DEBUG_PROMPT },
        { role: "user", content: [
          { type: "text", text: `Contexto extra del dev: ${body.notes || "Sin contexto extra"}` },
          { type: "image_url", image_url: { url: dataUrl } },
        ] },
      ];
      let r = await freeVisionAI(visionMessages, false);
      if (!r.ok) {
        const t = await r.text();
        return aiErrorResponse(r.status, t, true);
      }
      const firstText = await r.text();
      const firstJson = (() => { try { return JSON.parse(firstText); } catch { return null; } })();
      const firstContent = String(firstJson?.choices?.[0]?.message?.content || "");
      const missedImage = /no (veo|puedo ver)|can't (view|see)|cannot (view|see)|unable to (view|see)|no image|ninguna captura/i.test(firstContent);
      if (!missedImage && firstContent.trim()) {
        const encoder = new TextEncoder();
        return new Response(new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: firstContent } }] })}\n\n`));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          },
        }), { headers: { ...corsHeaders, "content-type": "text/event-stream" } });
      }

      r = await lovableAI(visionMessages, true, "google/gemini-2.5-flash");
      if (!r.ok) {
        const t = await r.text();
        return aiErrorResponse(r.status, t, true);
      }
      return new Response(stripReasoningStream(r.body), { headers: { ...corsHeaders, "content-type": "text/event-stream" } });
    }

    if (mode === "code") {
      const language = String(body.language || "auto");
      const userPrompt = String(body.prompt || "").slice(0, 8000);
      if (!userPrompt) return new Response(JSON.stringify({ error: "Falta la descripción del código." }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });

      let buildaContext = "";
      if (language === "builda") {
        try {
          const r = await sb("orion_builda_scripts?select=title,description,code&order=created_at.desc&limit=100");
          const scripts = await r.json();
          if (Array.isArray(scripts) && scripts.length) {
            buildaContext = `\n\n## Referencia oficial del lenguaje Builda (úsala como única fuente de verdad para sintaxis y patrones):\n${scripts.map((s: any) => `### ${s.title}\n${s.description ? s.description + "\n" : ""}\`\`\`\n${s.code}\n\`\`\``).join("\n\n")}`;
          } else {
            buildaContext = "\n\nNo hay scripts de Builda registrados todavía. Pide al usuario que añada referencias en el panel admin antes de generar código Builda.";
          }
        } catch (_e) { /* ignore */ }
      }

      const langLabel = language === "builda" ? "Builda (lenguaje propio del usuario)" : language === "auto" ? "el lenguaje más apropiado" : language;
      const sys = `Estás en MODO CODE. Eres un ingeniero senior. Genera código limpio, idiomático y comentado en ${langLabel}.${buildaContext}

FORMATO OBLIGATORIO markdown:
# Solución
1-2 frases describiendo el enfoque.

# Código
\`\`\`${language === "auto" ? "" : language}
// código aquí
\`\`\`

# Uso
Ejemplo de uso y notas importantes (dependencias, edge cases).

Reglas: directo, sin paja. Si la petición es ambigua, asume valores sensatos y dilo. Nunca pongas placeholders tipo "TODO" salvo que sea esencial.${language === "builda" ? " Para Builda: respeta SIEMPRE la sintaxis exacta de los scripts de referencia, no inventes funciones ni keywords que no aparezcan en ellos." : ""}`;
      const r = await freeAI([
        { role: "system", content: sys },
        ...(messages || []),
        { role: "user", content: userPrompt },
      ], true);
      if (!r.ok) {
        const t = await r.text();
        return aiErrorResponse(r.status, t, true);
      }
      return new Response(stripReasoningStream(r.body), { headers: { ...corsHeaders, "content-type": "text/event-stream" } });
    }

    if (mode === "web-search") {
      const query = String(body.query || messages?.at?.(-1)?.content || "").slice(0, 400);
      const searchUrl = `https://r.jina.ai/http://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
      const searchText = await fetch(searchUrl).then((r) => r.text()).catch(() => "");
      const r = await freeAI([
        { role: "system", content: "Responde en español con información encontrada en internet. Sé claro, directo y cita las fuentes o URLs visibles. Si los resultados son pobres, dilo." },
        ...(messages || []),
        { role: "user", content: `Consulta: ${query}\n\nResultados web recuperados:\n${searchText.slice(0, 12000)}` },
      ], true);
      if (!r.ok) {
        const t = await r.text();
        return aiErrorResponse(r.status, t, true);
      }
      return new Response(stripReasoningStream(r.body), { headers: { ...corsHeaders, "content-type": "text/event-stream" } });
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
        return aiErrorResponse(r.status, t);
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
      return aiErrorResponse(r.status, t, true);
    }

    return new Response(stripReasoningStream(r.body), { headers: { ...corsHeaders, "content-type": "text/event-stream" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});
