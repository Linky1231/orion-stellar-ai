export const YB_MODEL = "anthropic/claude-3-5-sonnet-latest";
export const YB_IMAGE_MODEL = "black-forest-labs/flux-1.1-pro";

export type YbMessage = { role: "user" | "assistant" | "system"; content: any };

export async function ybStream(
  messages: YbMessage[],
  onDelta: (s: string) => void,
  signal?: AbortSignal,
  opts: { model?: string; max_tokens?: number } = {},
) {
  const res = await fetch("/api/yb/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model || YB_MODEL,
      stream: true,
      max_tokens: opts.max_tokens ?? 1024,
      messages,
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

export async function ybText(
  messages: YbMessage[],
  opts: { model?: string; max_tokens?: number } = {},
): Promise<string> {
  let out = "";
  await ybStream(messages, (d) => (out += d), undefined, opts);
  return out;
}

export async function ybImage(prompt: string, model = YB_IMAGE_MODEL): Promise<string> {
  const res = await fetch("/api/yb/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt }),
  });
  const json: any = await res.json().catch(() => null);
  const url = json?.data?.[0]?.url || json?.data?.[0]?.b64_json;
  if (!res.ok || !url) throw new Error("El generador no devolvió ninguna imagen. Intenta de nuevo.");
  return String(url).startsWith("data:") || String(url).startsWith("http")
    ? String(url)
    : `data:image/png;base64,${url}`;
}

export type YbUsage = {
  email: string | null;
  balanceUsd: number;
  spentUsd: number;
  calls: number;
  totalTokens: number;
  byModel: { model: string; calls: number; tokens: number; cost_usd: number }[];
  usdPerHour: number;
  hoursLeft: number | null;
  recent: { model: string; costUsd: number; tokens: number; latencyMs: number; createdAt: string }[];
  checkedAt: string;
};

export async function ybUsage(): Promise<YbUsage> {
  const res = await fetch("/api/yb/usage", { cache: "no-store" });
  if (!res.ok) throw new Error("No se pudo leer el saldo");
  return res.json();
}
