import { supabase } from "@/lib/localdb";
import { getDeviceId } from "@/lib/device";
import { loadPuter, puterChat, readPuterText, PUTER_MODELS } from "@/lib/puter";

export type ChatMsg = { role: "user" | "assistant" | "system"; content: any };

function toPuterMessages(messages: ChatMsg[]) {
  return messages.map((m) => ({
    role: m.role,
    content: typeof m.content === "string" ? m.content : Array.isArray(m.content) ? m.content : String(m.content ?? ""),
  }));
}

async function streamInto(
  prompt: any,
  options: Record<string, unknown>,
  onDelta: (s: string) => void,
  signal?: AbortSignal,
) {
  const response = await puterChat(prompt, { stream: true, ...options });
  if (response && typeof response[Symbol.asyncIterator] === "function") {
    for await (const part of response as any) {
      if (signal?.aborted) return;
      const t = part?.text ?? part?.message?.content ?? "";
      if (t) onDelta(String(t));
    }
    return;
  }
  const text = readPuterText(response);
  if (text) onDelta(text);
}

// ---- Texto ----
export async function streamChat(messages: ChatMsg[], onDelta: (s: string) => void, signal?: AbortSignal) {
  return streamInto(toPuterMessages(messages), {}, onDelta, signal);
}

export async function streamSearch(query: string, messages: ChatMsg[], onDelta: (s: string) => void, signal?: AbortSignal) {
  const msgs = toPuterMessages(messages);
  msgs.unshift({
    role: "system",
    content:
      "Responde como buscador web: da información actual, concreta y verificable sobre la consulta del usuario. Si no estás seguro de un dato reciente, dilo con claridad.",
  });
  msgs.push({ role: "user", content: `Busca y resume información sobre: ${query}` });
  return streamInto(msgs, {}, onDelta, signal);
}

export async function streamDebugVisual(imageUrl: string, notes: string, onDelta: (s: string) => void, signal?: AbortSignal) {
  const puter = await loadPuter();
  const prompt = `Analiza esta captura de pantalla y detecta errores o problemas de interfaz. Notas del usuario: ${notes || "(sin notas)"}`;
  const response = await puter.ai.chat(prompt, imageUrl, { model: PUTER_MODELS.vision, stream: true });
  if (response && typeof response[Symbol.asyncIterator] === "function") {
    for await (const part of response as any) {
      if (signal?.aborted) return;
      const t = part?.text ?? "";
      if (t) onDelta(String(t));
    }
    return;
  }
  const text = readPuterText(response);
  if (text) onDelta(text);
}

// ---- Imágenes ----
export async function generateImage(prompt: string): Promise<string> {
  const puter = await loadPuter();
  const image: any = await puter.ai.txt2img(prompt);
  const url = typeof image === "string" ? image : image?.src || image?.url;
  if (!url) throw new Error("El generador no devolvió ninguna imagen. Intenta de nuevo.");
  return url;
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
  try {
    return JSON.parse(raw.slice(s, e + 1));
  } catch {
    return {};
  }
}

async function askJson(prompt: string): Promise<any> {
  const response = await puterChat(prompt, { model: PUTER_MODELS.fast });
  return parseJsonLoose(readPuterText(response));
}

// Memoria: extrae hechos con la IA y los guarda
export async function extractAndStoreMemory(text: string) {
  if (!text || text.length < 8) return;
  try {
    const out = await askJson(
      `Extrae hechos duraderos sobre el usuario del siguiente texto. Devuelve SOLO JSON con esta forma: {"facts":[{"content":"...","kind":"fact"}]}. Si no hay hechos, devuelve {"facts":[]}.\n\nTexto:\n${text}`,
    );
    const facts = out?.facts;
    if (!Array.isArray(facts) || facts.length === 0) return;
    const did = getDeviceId();
    await supabase.from("user_memory" as any).insert(
      facts
        .filter((f: any) => f?.content)
        .map((f: any) => ({ device_id: did, content: String(f.content), kind: f.kind || "fact" })),
    );
  } catch (e) {
    console.warn("memory extract failed", e);
  }
}

export async function classifyNote(title: string, content: string) {
  try {
    return await askJson(
      `Clasifica esta nota. Devuelve SOLO JSON: {"category":"...","tags":["..."],"summary":"..."}.\n\nTítulo: ${title}\nContenido: ${content}`,
    );
  } catch {
    return {};
  }
}

export async function analyzeProject(notes: any[]): Promise<string> {
  const resumen = notes
    .map((n: any) => `- ${n?.title || "(sin título)"}: ${String(n?.content || "").slice(0, 400)}`)
    .join("\n")
    .slice(0, 8000);
  const response = await puterChat(
    `Analiza este conjunto de notas de un proyecto y entrega un análisis claro con puntos fuertes, riesgos y próximos pasos.\n\n${resumen}`,
  );
  return readPuterText(response);
}

export type DiagnosticsResult = {
  timestamp: string;
  env: Record<string, boolean>;
  results: Record<string, { ok: boolean; ms: number; sample: string; error: string | null }>;
};

export async function runDiagnostics(): Promise<DiagnosticsResult> {
  const t0 = performance.now();
  let ok = false;
  let sample = "";
  let error: string | null = null;
  try {
    const response = await puterChat("Responde solo: ok", { model: PUTER_MODELS.fast });
    sample = readPuterText(response).slice(0, 120);
    ok = Boolean(sample);
  } catch (e) {
    error = String(e);
  }
  return {
    timestamp: new Date().toISOString(),
    env: { puter: typeof (globalThis as any).puter !== "undefined" },
    results: { puter: { ok, ms: Math.round(performance.now() - t0), sample, error } },
  };
}
