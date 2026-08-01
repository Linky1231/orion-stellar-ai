// Motor de IA 100% local en el navegador (WebLLM + WebGPU).
// No usa créditos ni servidores: el modelo se descarga una vez y corre en la GPU del usuario.

import type { MLCEngine } from "@mlc-ai/web-llm";

export type LocalStatus = {
  phase: "idle" | "loading" | "ready" | "unsupported" | "error";
  progress: number; // 0..1
  text: string;
};

// Modelos ligeros y fiables (orden de intento: del más ligero al más capaz).
export const LOCAL_MODEL = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";
export const LOCAL_MODEL_SMALL = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";

const MODEL_CHAIN = [
  "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
  "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
  "Llama-3.2-1B-Instruct-q4f32_1-MLC",
];

let status: LocalStatus = { phase: "idle", progress: 0, text: "Modelo local no cargado" };
const listeners = new Set<(s: LocalStatus) => void>();

function setStatus(s: Partial<LocalStatus>) {
  status = { ...status, ...s };
  listeners.forEach((l) => l(status));
}

export function getLocalStatus() {
  return status;
}

export function subscribeLocalStatus(fn: (s: LocalStatus) => void) {
  listeners.add(fn);
  fn(status);
  return () => listeners.delete(fn);
}

export function isWebGPUSupported() {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

let enginePromise: Promise<MLCEngine> | null = null;

export function loadLocalEngine(): Promise<MLCEngine> {
  if (enginePromise) return enginePromise;

  enginePromise = (async () => {
    if (!isWebGPUSupported()) {
      setStatus({ phase: "unsupported", text: "Este navegador no soporta WebGPU (usa Chrome o Edge de escritorio)." });
      throw new Error("Tu navegador no soporta WebGPU. Usa Chrome o Edge en computadora para el modo local.");
    }
    setStatus({ phase: "loading", progress: 0, text: "Preparando modelo local…" });
    const { CreateMLCEngine } = await import("@mlc-ai/web-llm");

    let lastError: unknown = null;
    for (const model of MODEL_CHAIN) {
      try {
        const engine = await CreateMLCEngine(model, {
          initProgressCallback: (p) => {
            setStatus({ phase: "loading", progress: p.progress ?? 0, text: p.text || "Descargando modelo local…" });
          },
        });
        setStatus({ phase: "ready", progress: 1, text: `Modelo local listo (${model.split("-Instruct")[0]})` });
        return engine;
      } catch (e) {
        lastError = e;
        console.warn(`WebLLM: falló ${model}, probando el siguiente…`, e);
        setStatus({ phase: "loading", progress: 0, text: "Reintentando con otro modelo más ligero…" });
      }
    }

    enginePromise = null;
    const msg = (lastError as any)?.message || "No se pudo cargar el modelo local";
    setStatus({ phase: "error", text: msg });
    throw new Error(msg);
  })();

  return enginePromise;
}


export type LocalMsg = { role: "user" | "assistant" | "system"; content: any };

function flatten(content: any): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p: any) => (p?.type === "text" ? p.text : p?.type === "image_url" ? "[imagen adjunta]" : ""))
      .filter(Boolean)
      .join("\n");
  }
  return String(content ?? "");
}

export async function localChatStream(
  messages: LocalMsg[],
  onDelta: (s: string) => void,
  opts: { system?: string; maxTokens?: number; temperature?: number; signal?: AbortSignal } = {},
) {
  const engine = await loadLocalEngine();
  const sys =
    opts.system ??
    "Eres Orión, una asistente de IA en español. Responde de forma clara, útil y breve (máximo 600 caracteres).";

  const payload = [
    { role: "system" as const, content: sys },
    ...messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: flatten(m.content) })),
  ];

  const stream = await engine.chat.completions.create({
    messages: payload as any,
    stream: true,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 300,
  });

  for await (const chunk of stream as any) {
    if (opts.signal?.aborted) {
      try { await engine.interruptGenerate(); } catch { /* noop */ }
      break;
    }
    const delta = chunk?.choices?.[0]?.delta?.content;
    if (delta) onDelta(String(delta));
  }
}

export async function localChatText(
  messages: LocalMsg[],
  opts: { system?: string; maxTokens?: number; temperature?: number } = {},
) {
  let out = "";
  await localChatStream(messages, (d) => { out += d; }, opts);
  return out;
}
