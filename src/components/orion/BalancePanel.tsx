import { useEffect, useRef, useState } from "react";
import { ybUsage, type YbUsage, YB_MODEL } from "@/lib/yb";
import { Activity, RefreshCw, Wallet } from "lucide-react";

function fmtUsd(n: number) {
  return `$${n.toFixed(3)}`;
}

function fmtTime(hours: number | null) {
  if (hours == null || !Number.isFinite(hours)) return "—";
  if (hours > 24 * 30) return "> 1 mes";
  if (hours >= 24) return `${Math.floor(hours / 24)} d ${Math.round(hours % 24)} h`;
  if (hours >= 1) return `${Math.floor(hours)} h ${Math.round((hours % 1) * 60)} min`;
  return `${Math.max(1, Math.round(hours * 60))} min`;
}

export function BalancePanel() {
  const [data, setData] = useState<YbUsage | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      setData(await ybUsage());
      setErr(null);
    } catch {
      setErr("No se pudo leer el saldo del proveedor.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    timer.current = setInterval(refresh, 10000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const initial = 5; // referencia visual para la barra
  const pct = data ? Math.max(0, Math.min(100, (data.balanceUsd / initial) * 100)) : 0;
  const low = data ? data.balanceUsd < 0.5 : false;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <Activity className="w-3.5 h-3.5" /> Yielding Bear · {YB_MODEL} · actualiza cada 10 s
        </div>
        <button onClick={refresh} className="tap p-2 rounded-lg hover:bg-accent" aria-label="Actualizar">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {err && <div className="text-sm text-destructive">{err}</div>}

      <div className="rounded-2xl bg-card border border-border p-5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Wallet className="w-3.5 h-3.5" /> Saldo disponible
        </div>
        <div className={`text-4xl font-semibold mt-1 ${low ? "text-destructive" : ""}`}>
          {data ? `$${data.balanceUsd.toFixed(3)}` : "—"}
        </div>
        <div className="h-2 rounded-full bg-muted mt-3 overflow-hidden">
          <div
            className={`h-full transition-all duration-700 ${low ? "bg-destructive" : "gradient-orion"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="text-xs text-muted-foreground mt-2">
          Se acaba en aprox. <span className="text-foreground font-medium">{fmtTime(data?.hoursLeft ?? null)}</span>
          {data && data.usdPerHour > 0 ? ` · ${fmtUsd(data.usdPerHour)}/h de consumo` : " · sin consumo reciente"}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          ["Gastado", data ? fmtUsd(data.spentUsd) : "—"],
          ["Llamadas", data ? String(data.calls) : "—"],
          ["Tokens", data ? data.totalTokens.toLocaleString() : "—"],
        ].map(([l, v]) => (
          <div key={l} className="rounded-xl bg-card border border-border p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{l}</div>
            <div className="text-sm font-semibold mt-0.5">{v}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-card border border-border p-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Últimas llamadas</div>
        <div className="space-y-1.5">
          {(data?.recent || []).map((u, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="truncate mr-2">{u.model}</span>
              <span className="text-muted-foreground shrink-0">
                {u.tokens} tok · {u.latencyMs} ms · {fmtUsd(u.costUsd)}
              </span>
            </div>
          ))}
          {(!data || data.recent.length === 0) && (
            <div className="text-xs text-muted-foreground py-3 text-center">Sin actividad reciente</div>
          )}
        </div>
      </div>

      {data?.email && <div className="text-[10px] text-muted-foreground text-center">Cuenta: {data.email}</div>}
    </div>
  );
}
