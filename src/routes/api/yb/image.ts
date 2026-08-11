import { createFileRoute } from "@tanstack/react-router";

const BASE = "https://api.yieldingbear.com/api/v1";

export const Route = createFileRoute("/api/yb/image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["YIELDINGBEAR_API_KEY"];
        if (!key) return new Response("Missing YIELDINGBEAR_API_KEY", { status: 500 });

        const body = await request.text();
        const upstream = await fetch(`${BASE}/images`, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body,
        });

        return new Response(await upstream.text(), {
          status: upstream.status,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
