import { createFileRoute } from "@tanstack/react-router";

const ENDPOINT = "https://prexzyapis.com/ai/aiserv";

export const Route = createFileRoute("/api/ai/image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { prompt } = (await request.json().catch(() => ({}))) as { prompt?: string };
        if (!prompt) return Response.json({ error: "Falta la descripción de la imagen." }, { status: 400 });

        const url = new URL(ENDPOINT);
        url.searchParams.set("prompt", prompt);
        url.searchParams.set("mode", "image");
        url.searchParams.set("model", "flux");
        url.searchParams.set("isPro", "true");
        const token = process.env["PREXZY_TOKEN"];
        if (token) url.searchParams.set("token", token);

        try {
          const res = await fetch(url.toString());
          const ct = res.headers.get("content-type") || "";
          if (ct.startsWith("image/")) {
            const buf = await res.arrayBuffer();
            const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
            return Response.json({ url: `data:${ct};base64,${b64}` });
          }
          const raw = await res.text();
          if (!res.ok) return Response.json({ error: `Error del generador (${res.status})` }, { status: res.status });
          let out = "";
          try {
            const json: any = JSON.parse(raw);
            out = json?.url || json?.image || json?.result || json?.data?.url || json?.data?.image || "";
          } catch {
            out = raw.trim().startsWith("http") ? raw.trim() : "";
          }
          if (!out) return Response.json({ error: "El generador no devolvió ninguna imagen." }, { status: 502 });
          return Response.json({ url: out });
        } catch {
          return Response.json({ error: "No se pudo conectar con el generador." }, { status: 502 });
        }
      },
    },
  },
});
