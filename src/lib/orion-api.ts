import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "@/lib/device";
import { localChatStream, localChatText } from "@/lib/webllm";


const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/orion-chat`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export type ChatMsg = { role: "user" | "assistant" | "system"; content: any };

const HEADERS = { "content-type": "application/json", apikey: ANON, authorization: `Bearer ${ANON}` };

async function streamFromBody(body: Record<string, unknown>, onDelta: (s: string) => void, signal?: AbortSignal) {
  const r = await fetch(FN_URL, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body),
    signal,
  });
  const contentType = r.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const d = await r.json().catch(() => null);
    const message = d?.message || d?.error;
    if (message) onDelta(String(message));
    if (!r.ok && !message) throw new Error(`HTTP ${r.status}`);
    return;
  }
  if (!r.ok || !r.body) {
    const t = await r.text().catch(() => "");
    if (r.status === 402) throw new Error("El proveedor público no aceptó la petición ahora mismo. Intenta de nuevo en unos segundos.");
    if (r.status === 429) throw new Error("Demasiadas peticiones. Espera unos segundos e intenta de nuevo.");
    throw new Error(t || `HTTP ${r.status}`);
  }
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let done = false;
  const readContent = (p: any) => p?.choices?.[0]?.delta?.content || p?.choices?.[0]?.message?.content || p?.message || p?.response || p?.text || "";
  const processLine = (rawLine: string) => {
    let line = rawLine;
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (!line.startsWith("data: ")) return false;
    const json = line.slice(6).trim();
    if (json === "[DONE]") return true;
    try {
      const p = JSON.parse(json);
      const c = readContent(p);
      if (c) onDelta(String(c));
    } catch {
      buf = line + "\n" + buf;
      return true;
    }
    return false;
  };
  while (!done) {
    const { value, done: d } = await reader.read();
    if (d) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      done = processLine(line);
      if (done) break;
    }
  }
  buf += decoder.decode();
  if (buf.trim() && !done) processLine(buf.trim());
}

// ---- Texto: 100% local en el navegador (WebLLM). No usa créditos. ----
export async function streamChat(messages: ChatMsg[], onDelta: (s: string) => void, signal?: AbortSignal) {
  return localChatStream(messages, onDelta, { signal });
}

export async function streamSearch(query: string, messages: ChatMsg[], onDelta: (s: string) => void, signal?: AbortSignal) {
  return localChatStream(messages, onDelta, {
    signal,
    system:
      "Eres Orión, una asistente de IA local en español. No tienes acceso a internet: responde con tu conocimiento interno y avisa si el dato puede estar desactualizado. Máximo 600 caracteres.",
  });
}

export async function streamDebugVisual(imageUrl: string, notes: string, onDelta: (s: string) => void, signal?: AbortSignal) {
  return streamFromBody({ mode: "debug-visual", imageUrl, notes, deviceId: getDeviceId() }, onDelta, signal);
}



export async function generateImage(prompt: string): Promise<string> {
  const r = await fetch(FN_URL, { method: "POST", headers: HEADERS, body: JSON.stringify({ mode: "image", prompt, deviceId: getDeviceId() }) });
  const text = await r.text();
  let d: any = {};
  try { d = JSON.parse(text); } catch { throw new Error("El generador devolvió una respuesta inválida. Intenta de nuevo."); }
  if (!r.ok) throw new Error(d.message || d.error || `HTTP ${r.status}`);
  if (!d.imageUrl) throw new Error(d.message || d.error || "El proveedor público no pudo generar la imagen ahora mismo.");
  return d.imageUrl;
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("No se pudo leer la imagen"));
    reader.readAsDataURL(file);
  });
}

export async function uploadAttachment(file: File, bucket = "chat-attachments"): Promise<string> {
  const path = `${crypto.randomUUID()}-${file.name}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

function parseJsonLoose(raw: string): any {
  const s = raw.indexOf("{");
  const e = raw.lastIndexOf("}");
  if (s === -1 || e <= s) return {};
  try { return JSON.parse(raw.slice(s, e + 1)); } catch { return {}; }
}

// Memoria: extrae hechos con el modelo local y los guarda
export async function extractAndStoreMemory(text: string) {
  if (!text || text.length < 8) return;
  try {
    const out = await localChatText(
      [{ role: "user", content: text }],
      {
        system:
          'Extrae hechos duraderos sobre el usuario del mensaje. Responde SOLO JSON: {"facts":[{"content":"...","kind":"fact"}]}. Si no hay hechos, {"facts":[]}.',
        maxTokens: 200,
        temperature: 0.1,
      },
    );
    const facts = parseJsonLoose(out).facts;
    if (!Array.isArray(facts) || facts.length === 0) return;
    const did = getDeviceId();
    await supabase.from("user_memory" as any).insert(
      facts.filter((f: any) => f?.content).map((f: any) => ({ device_id: did, content: String(f.content), kind: f.kind || "fact" })),
    );
  } catch (e) { console.warn("memory extract failed", e); }
}

export async function classifyNote(title: string, content: string) {
  const out = await localChatText(
    [{ role: "user", content: `Título: ${title}\n\nContenido:\n${content}` }],
    {
      system:
        'Clasifica la nota. Responde SOLO JSON: {"category":"","status":"","section":"","summary":""}. El resumen en español, máximo 200 caracteres.',
      maxTokens: 250,
      temperature: 0.2,
    },
  );
  return parseJsonLoose(out);
}

export async function analyzeProject(notes: any[]): Promise<string> {
  const resumen = notes
    .map((n: any, i: number) => `${i + 1}. ${n.title || "(sin título)"} — ${(n.content || "").slice(0, 300)}`)
    .join("\n");
  return localChatText(
    [{ role: "user", content: `Notas del proyecto:\n${resumen}` }],
    {
      system:
        "Eres Orión. Analiza el proyecto a partir de las notas: estado, riesgos y próximos pasos. Español, claro y conciso (máximo 600 caracteres).",
      maxTokens: 320,
      temperature: 0.5,
    },
  );
}


export type DiagnosticsResult = {
  timestamp: string;
  env: Record<string, boolean>;
  results: Record<string, { ok: boolean; ms: number; sample: string; error: string | null }>;
};

export async function runDiagnostics(): Promise<DiagnosticsResult> {
  const t0 = performance.now();
  const r = await fetch(FN_URL, { method: "POST", headers: HEADERS, body: JSON.stringify({ mode: "diagnose" }) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  (data as any).roundTripMs = Math.round(performance.now() - t0);
  return data;
}

