import { createFileRoute } from "@tanstack/react-router";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

async function gptImage(key: string, prompt: string): Promise<string | null> {
  const res = await fetch(`${GATEWAY}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({ model: "openai/gpt-image-2", prompt, n: 1, size: "1024x1024" }),
  });
  const json: any = await res.json().catch(() => null);
  if (!res.ok) return null;
  const item = json?.data?.[0];
  if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
  if (item?.url) return String(item.url);
  return null;
}

async function geminiImage(key: string, prompt: string): Promise<{ url?: string; error?: string; status: number }> {
  const res = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "google/gemini-3-pro-image",
      modalities: ["image", "text"],
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const json: any = await res.json().catch(() => null);
  if (!res.ok) return { error: json?.error?.message || `Error del generador (${res.status})`, status: res.status };
  const url = json?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  return url ? { url: String(url), status: 200 } : { error: "El generador no devolvió ninguna imagen.", status: 502 };
}

export const Route = createFileRoute("/api/ai/image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const { prompt } = (await request.json().catch(() => ({}))) as { prompt?: string };
        if (!prompt) {
          return Response.json({ error: "Falta la descripción de la imagen." }, { status: 400 });
        }

        try {
          const gpt = await gptImage(key, prompt);
          if (gpt) return Response.json({ url: gpt, model: "openai/gpt-image-2" });
        } catch {
          /* cae al modelo de respaldo */
        }

        const fallback = await geminiImage(key, prompt);
        if (fallback.url) return Response.json({ url: fallback.url, model: "google/gemini-3-pro-image" });
        return Response.json({ error: fallback.error }, { status: fallback.status });
      },
    },
  },
});
