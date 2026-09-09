import { createFileRoute } from "@tanstack/react-router";

const IMAGE_ENDPOINT = "https://prexzyapis.com/ai/aiwriter-image";
const FALLBACK_ENDPOINT = "https://prexzyapis.com/ai/aiserv";

function pickUrl(json: any): string {
  const r = json?.result ?? json;
  const cand =
    r?.url ||
    r?.image ||
    r?.image_url ||
    (Array.isArray(r?.images) ? r.images[0]?.url || r.images[0] : "") ||
    (Array.isArray(r?.data) ? r.data[0]?.url || r.data[0] : "") ||
    (typeof r?.text === "string" && r.text.startsWith("http") ? r.text : "") ||
    (Array.isArray(r?.text) && String(r.text[0] || "").startsWith("http") ? r.text[0] : "");
  return typeof cand === "string" ? cand : "";
}

export const Route = createFileRoute("/api/ai/image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { prompt, size } = (await request.json().catch(() => ({}))) as { prompt?: string; size?: string };
        if (!prompt) return Response.json({ error: "Falta la descripción de la imagen." }, { status: 400 });

        const token = process.env["PREXZY_TOKEN"];

        const primary = new URL(IMAGE_ENDPOINT);
        primary.searchParams.set("prompt", prompt);
        primary.searchParams.set("size", size || "1024x1024");
        if (token) primary.searchParams.set("token", token);

        const fallback = new URL(FALLBACK_ENDPOINT);
        fallback.searchParams.set("prompt", prompt);
        fallback.searchParams.set("mode", "image");
        fallback.searchParams.set("isPro", "true");
        if (token) fallback.searchParams.set("token", token);

        let lastError = "El generador no devolvió ninguna imagen.";

        for (const target of [primary, fallback]) {
          try {
            const res = await fetch(target.toString());
            const ct = res.headers.get("content-type") || "";
            if (ct.startsWith("image/")) {
              const buf = new Uint8Array(await res.arrayBuffer());
              let bin = "";
              for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
              return Response.json({ url: `data:${ct};base64,${btoa(bin)}` });
            }
            const raw = await res.text();
            let json: any = null;
            try {
              json = JSON.parse(raw);
            } catch {
              if (raw.trim().startsWith("http")) return Response.json({ url: raw.trim() });
            }
            const url = pickUrl(json);
            if (url) return Response.json({ url });
            lastError = json?.result?.message || json?.message || lastError;
          } catch {
            lastError = "No se pudo conectar con el generador.";
          }
        }

        return Response.json({ error: lastError }, { status: 502 });
      },
    },
  },
});
