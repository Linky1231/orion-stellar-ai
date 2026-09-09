import { createFileRoute } from "@tanstack/react-router";

const ENDPOINT = "https://prexzyapis.com/ai/aiwriter-chat";

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

        const knowledge = systems.join("\n\n");
        const question = last ? flatten(last.content) : "";
        const hist = history ? `HISTORIAL:\n${history}` : "";

        const token = process.env["PREXZY_TOKEN"];

        // El servicio recibe el prompt por URL: se prueban tamaños decrecientes
        // para incluir la mayor cantidad posible de memoria/conocimiento.
        const attempts: string[] = [];
        for (const limit of [12000, 8000, 5000, 2500]) {
          const k = knowledge.length > limit ? knowledge.slice(0, limit) : knowledge;
          const h = hist.slice(0, Math.max(0, Math.floor(limit / 3)));
          attempts.push([k, h, question].filter(Boolean).join("\n\n"));
        }
        attempts.push(question);

        let text = "";
        let lastStatus = 502;
        for (const prompt of attempts) {
          const url = new URL(ENDPOINT);
          url.searchParams.set("prompt", prompt);
          url.searchParams.set("model", body.model || "gpt-4o");
          if (token) url.searchParams.set("token", token);
          try {
            const res = await fetch(url.toString(), {
              headers: {
                Accept: "application/json",
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
              },
            });
            lastStatus = res.status;
            const raw = await res.text();
            if (!res.ok) continue;
            try {
              const json: any = JSON.parse(raw);
              const r = json?.result;
              if (Array.isArray(r?.text)) text = r.text.join("");
              else text = r?.text || r?.response || json?.response || json?.message || "";
            } catch {
              text = raw;
            }
            if (text) break;
          } catch {
            /* siguiente intento */
          }
        }

        if (!text) return Response.json({ error: `El proveedor no respondió (${lastStatus}).` }, { status: 502 });


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
