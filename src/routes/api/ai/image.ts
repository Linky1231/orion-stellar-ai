import { createFileRoute } from "@tanstack/react-router";

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

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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

        const json: any = await upstream.json().catch(() => null);
        if (!upstream.ok) {
          return Response.json(
            { error: json?.error?.message || `Error del generador (${upstream.status})` },
            { status: upstream.status },
          );
        }

        const url = json?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        if (!url) return Response.json({ error: "El generador no devolvió ninguna imagen." }, { status: 502 });
        return Response.json({ url });
      },
    },
  },
});
