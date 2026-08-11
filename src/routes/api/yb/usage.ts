import { createFileRoute } from "@tanstack/react-router";

const BASE = "https://api.yieldingbear.com/api/v1";

export const Route = createFileRoute("/api/yb/usage")({
  server: {
    handlers: {
      GET: async () => {
        const key = process.env["YIELDINGBEAR_API_KEY"];
        if (!key) return new Response("Missing YIELDINGBEAR_API_KEY", { status: 500 });

        const upstream = await fetch(`${BASE}/usage`, {
          headers: { Authorization: `Bearer ${key}` },
        });
        const raw = await upstream.json().catch(() => null as any);
        if (!upstream.ok || !raw) {
          return new Response(JSON.stringify({ error: "usage_unavailable" }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
          });
        }

        const balance = Number(raw?.account?.credit_balance_usd ?? 0);
        const totals = raw?.totals ?? {};
        const recent: any[] = Array.isArray(raw?.usage) ? raw.usage : [];

        // Burn-rate estimate from the recent calls window
        const times = recent
          .map((u) => Date.parse(u?.created_at))
          .filter((t) => Number.isFinite(t))
          .sort((a, b) => a - b);
        const spanHours = times.length > 1 ? (times[times.length - 1] - times[0]) / 3_600_000 : 0;
        const recentCost = recent.reduce((s, u) => s + Number(u?.cost_usd || 0), 0);
        const usdPerHour = spanHours > 0.01 ? recentCost / spanHours : 0;
        const hoursLeft = usdPerHour > 0 ? balance / usdPerHour : null;

        return new Response(
          JSON.stringify({
            email: raw?.account?.email ?? null,
            balanceUsd: balance,
            spentUsd: Number(totals?.cost_usd || 0),
            calls: Number(totals?.calls || 0),
            totalTokens: Number(totals?.total_tokens || 0),
            byModel: raw?.by_model ?? [],
            usdPerHour,
            hoursLeft,
            recent: recent.slice(0, 10).map((u) => ({
              model: u?.model,
              costUsd: Number(u?.cost_usd || 0),
              tokens: Number(u?.total_tokens || 0),
              latencyMs: Number(u?.latency_ms || 0),
              createdAt: u?.created_at,
            })),
            checkedAt: new Date().toISOString(),
          }),
          { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
