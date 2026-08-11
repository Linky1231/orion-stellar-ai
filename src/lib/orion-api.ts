import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "@/lib/device";
import { ybStream, ybText, ybImage, ybUsage, YB_MODEL } from "@/lib/yb";

export type ChatMsg = { role: "user" | "assistant" | "system"; content: any };

// ---- Texto ----
export async function streamChat(messages: ChatMsg[], onDelta: (s: string) => void, signal?: AbortSignal) {
  return ybStream(messages, onDelta, signal);
}

export async function streamSearch(query: string, messages: ChatMsg[], onDelta: (s: string) => void, signal?: AbortSignal) {
  const msgs: ChatMsg[] = [
    {
      role: "system",
      content:
        "Responde como buscador web: da información actual, concreta y verificable sobre la consulta del usuario. Si no estás seguro de un dato reciente, dilo con claridad.",
    },
    ...messages,
    { role: "user", content: `Busca y resume información sobre: ${query}` },
  ];
  return ybStream(msgs, onDelta, signal);
}

export async function streamDebugVisual(imageUrl: string, notes: string, onDelta: (s: string) => void, signal?: AbortSignal) {
  const msgs: ChatMsg[] = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Analiza esta captura de pantalla y detecta errores o problemas de interfaz. Notas del usuario: ${notes || "(sin notas)"}`,
        },
        { type: "image_url", image_url: { url: imageUrl } },
      ],
    },
  ];
  return ybStream(msgs, onDelta, signal);
}

// ---- Imágenes ----
export async function generateImage(prompt: string): Promise<string> {
  return ybImage(prompt);
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
  const text = await ybText([{ role: "user", content: prompt }], { max_tokens: 600 });
  return parseJsonLoose(text);
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
  return ybText(
    [
      {
        role: "user",
        content: `Analiza este conjunto de notas de un proyecto y entrega un análisis claro con puntos fuertes, riesgos y próximos pasos.\n\n${resumen}`,
      },
    ],
    { max_tokens: 1500 },
  );
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
    sample = (await ybText([{ role: "user", content: "Responde solo: ok" }], { max_tokens: 20 })).slice(0, 120);
    ok = Boolean(sample);
  } catch (e) {
    error = String(e);
  }

  let saldo = false;
  try {
    saldo = (await ybUsage()).balanceUsd >= 0;
  } catch {
    saldo = false;
  }

  return {
    timestamp: new Date().toISOString(),
    env: { yieldingbear: true, saldo },
    results: { [YB_MODEL]: { ok, ms: Math.round(performance.now() - t0), sample, error } },
  };
}
