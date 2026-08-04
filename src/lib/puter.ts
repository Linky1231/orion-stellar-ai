// Puter.js — IA gratis e ilimitada (modelo "user-pays", sin claves ni backend)
// https://developer.puter.com/tutorials/free-unlimited-ai-api/

const SDK_URL = "https://js.puter.com/v2/";

export const PUTER_MODELS = {
  chat: "openai/gpt-5.5",
  fast: "google/gemini-3.6-flash",
  vision: "openai/gpt-5.5",
} as const;

let loading: Promise<any> | null = null;

export function loadPuter(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("Puter solo funciona en el navegador"));
  const w = window as any;
  if (w.puter?.ai) return Promise.resolve(w.puter);
  if (loading) return loading;

  loading = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_URL}"]`);
    const script = existing ?? document.createElement("script");
    const onLoad = () => {
      if ((window as any).puter?.ai) resolve((window as any).puter);
      else reject(new Error("Puter.js se cargó pero no está disponible"));
    };
    script.addEventListener("load", onLoad);
    script.addEventListener("error", () => reject(new Error("No se pudo cargar Puter.js")));
    if (!existing) {
      script.src = SDK_URL;
      script.async = true;
      document.head.appendChild(script);
    }
  });
  loading.catch(() => { loading = null; });
  return loading;
}

export async function puterChat(prompt: any, options: Record<string, unknown> = {}): Promise<any> {
  const puter = await loadPuter();
  return puter.ai.chat(prompt, { model: PUTER_MODELS.chat, ...options });
}

export function readPuterText(response: any): string {
  if (!response) return "";
  if (typeof response === "string") return response;
  if (typeof response.text === "string") return response.text;
  const content = response?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c: any) => c?.text || "").join("");
  return String(response?.result || "");
}
