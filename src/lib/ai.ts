export const AI_MODEL = "google/gemini-3.7-flash";
export const AI_IMAGE_MODEL = "google/gemini-3-pro-image";

export type AiMessage = { role: "user" | "assistant" | "system"; content: any };

export async function aiStream(
  messages: AiMessage[],
  onDelta: (s: string) => void,
  signal?: AbortSignal,
  opts: { model?: string; max_tokens?: number; plugins?: any[] } = {},
) {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model || AI_MODEL,
      stream: true,
      max_tokens: opts.max_tokens ?? 8192,
      messages,
      ...(opts.plugins ? { plugins: opts.plugins } : {}),
    }),
    signal,
  });

  if (!res.ok || !res.body) throw new Error(`Error del proveedor (${res.status})`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (signal?.aborted) return;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload);
        const delta = json?.choices?.[0]?.delta?.content;
        if (delta) onDelta(String(delta));
      } catch {
        /* ignore partial chunk */
      }
    }
  }
}

export async function aiText(
  messages: AiMessage[],
  opts: { model?: string; max_tokens?: number } = {},
): Promise<string> {
  let out = "";
  await aiStream(messages, (d) => (out += d), undefined, opts);
  return out;
}

export async function aiImage(prompt: string): Promise<string> {
  const res = await fetch("/api/ai/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const json: any = await res.json().catch(() => null);
  const url = json?.url;
  if (!res.ok || !url) throw new Error(json?.error || "El generador no devolvió ninguna imagen. Intenta de nuevo.");
  return String(url);
}
