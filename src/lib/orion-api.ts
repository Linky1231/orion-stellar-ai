import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "@/lib/device";

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
    if (r.status === 402) throw new Error("Sin créditos en Lovable AI. Añade saldo en Settings → Workspace → Cloud & AI balance.");
    if (r.status === 429) throw new Error("Demasiadas peticiones. Espera unos segundos e intenta de nuevo.");
    throw new Error(t || `HTTP ${r.status}`);
  }
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let done = false;
  while (!done) {
    const { value, done: d } = await reader.read();
    if (d) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n")) !== -1) {
      let line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (json === "[DONE]") { done = true; break; }
      try {
        const p = JSON.parse(json);
        const c = p.choices?.[0]?.delta?.content;
        if (c) onDelta(c);
      } catch {
        buf = line + "\n" + buf;
        break;
      }
    }
  }
}

export async function streamChat(messages: ChatMsg[], onDelta: (s: string) => void, signal?: AbortSignal) {
  return streamFromBody({ mode: "chat", messages, deviceId: getDeviceId() }, onDelta, signal);
}

export async function streamSearch(query: string, messages: ChatMsg[], onDelta: (s: string) => void, signal?: AbortSignal) {
  return streamFromBody({ mode: "web-search", query, messages, deviceId: getDeviceId() }, onDelta, signal);
}

export async function streamDebugVisual(imageUrl: string, notes: string, onDelta: (s: string) => void, signal?: AbortSignal) {
  return streamFromBody({ mode: "debug-visual", imageUrl, notes, deviceId: getDeviceId() }, onDelta, signal);
}

export async function streamCode(prompt: string, language: string, messages: ChatMsg[], onDelta: (s: string) => void, signal?: AbortSignal) {
  return streamFromBody({ mode: "code", prompt, language, messages, deviceId: getDeviceId() }, onDelta, signal);

export async function generateImage(prompt: string): Promise<string> {
  const r = await fetch(FN_URL, { method: "POST", headers: HEADERS, body: JSON.stringify({ mode: "image", prompt, deviceId: getDeviceId() }) });
  const text = await r.text();
  let d: any = {};
  try { d = JSON.parse(text); } catch { throw new Error("El generador devolvió una respuesta inválida. Intenta de nuevo."); }
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  if (!d.imageUrl) throw new Error("No image returned");
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

// Memory: extract facts from a user message and store them
export async function extractAndStoreMemory(text: string) {
  if (!text || text.length < 8) return;
  try {
    const r = await fetch(FN_URL, { method: "POST", headers: HEADERS, body: JSON.stringify({ mode: "extract-memory", text }) });
    const { facts } = await r.json();
    if (!Array.isArray(facts) || facts.length === 0) return;
    const did = getDeviceId();
    await supabase.from("user_memory" as any).insert(facts.map((f: any) => ({ device_id: did, content: f.content, kind: f.kind || "fact" })));
  } catch (e) { console.warn("memory extract failed", e); }
}

export async function classifyNote(title: string, content: string) {
  const r = await fetch(FN_URL, { method: "POST", headers: HEADERS, body: JSON.stringify({ mode: "classify-note", title, content }) });
  return r.json();
}

export async function analyzeProject(notes: any[]): Promise<string> {
  const r = await fetch(FN_URL, { method: "POST", headers: HEADERS, body: JSON.stringify({ mode: "analyze-project", notes }) });
  const d = await r.json();
  return d.analysis || "";
}
