import { createFileRoute } from "@tanstack/react-router";

const ENDPOINT = "https://prexzyapis.com/ai/aiserv";

type Msg = { role: string; content: any };

function flatten(content: any): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p: any) => {
        if (typeof p === "string") return p;
        if (p?.type === "text") return p.text;
        if (p?.type === "image_url") return `[imagen: ${p.image_url?.url}]`;
        if (p?.type === "video_url") return `[video: ${p.video_url?.url}]`;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return String(content ?? "");
}

export const Route = createFileRoute("/api/ai/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as {
          messages?: Msg[];
          model?: string;
          mode?: string;
        };
        const messages = body.messages || [];

        // Todo el conocimiento/memoria (system) va como preámbulo del prompt.
        const systems = messages.filter((m) => m.role === "system").map((m) => flatten(m.content));
        const convo = messages.filter((m) => m.role !== "system");
        const last = convo[convo.length - 1];
        const history = convo
          .slice(0, -1)
          .map((m) => `${m.role === "assistant" ? "Orión" : "Usuario"}: ${flatten(m.content)}`)
          .join("\n");

        const prompt = [systems.join("\n\n"), last ? flatten(last.content) : ""].filter(Boolean).join("\n\n");

        const url = new URL(ENDPOINT);
        url.searchParams.set("prompt", prompt);
        url.searchParams.set("model", body.model || "gpt-4o");
        url.searchParams.set("isPro", "true");
        if (body.mode) url.searchParams.set("mode", body.mode);
        if (history) url.searchParams.set("history", history);
        const token = process.env["PREXZY_TOKEN"];
        if (token) url.searchParams.set("token", token);

        let text = "";
        try {
          const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
          const raw = await res.text();
          if (!res.ok) {
            return Response.json({ error: `Error del proveedor (${res.status})` }, { status: res.status });
          }
          try {
            const json: any = JSON.parse(raw);
            text =
              json?.result ??
              json?.response ??
              json?.data?.response ??
              json?.data?.result ??
              json?.message ??
              json?.answer ??
              (typeof json?.data === "string" ? json.data : "") ??
              "";
            if (!text && typeof json === "string") text = json;
          } catch {
            text = raw;
          }
        } catch (e) {
          return Response.json({ error: "No se pudo conectar con el proveedor." }, { status: 502 });
        }

        if (!text) return Response.json({ error: "El proveedor no devolvió respuesta." }, { status: 502 });

        // Se entrega como SSE para mantener el streaming del cliente.
        const stream = new ReadableStream({
          start(controller) {
            const enc = new TextEncoder();
            const chunk = { choices: [{ delta: { content: String(text) } }] };
            controller.enqueue(enc.encode(`data: ${JSON.stringify(chunk)}\n\n`));
            controller.enqueue(enc.encode("data: [DONE]\n\n"));
            controller.close();
          },
        });

        return new Response(stream, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        });
      },
    },
  },
});
