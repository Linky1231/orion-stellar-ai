import { supabase } from "@/integrations/supabase/client";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/orion-chat`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export type ChatMsg = { role: "user" | "assistant" | "system"; content: any };

export async function streamChat(
  messages: ChatMsg[],
  onDelta: (s: string) => void,
  signal?: AbortSignal,
) {
  const r = await fetch(FN_URL, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON, authorization: `Bearer ${ANON}` },
    body: JSON.stringify({ mode: "chat", messages }),
    signal,
  });
  if (!r.ok || !r.body) {
    const t = await r.text().catch(() => "");
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

export async function generateImage(prompt: string): Promise<string> {
  const r = await fetch(FN_URL, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON, authorization: `Bearer ${ANON}` },
    body: JSON.stringify({ mode: "image", prompt }),
  });
  const d = await r.json();
  if (!d.imageUrl) throw new Error("No image returned");
  return d.imageUrl;
}

export async function uploadAttachment(file: File, bucket = "chat-attachments"): Promise<string> {
  const path = `${crypto.randomUUID()}-${file.name}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
