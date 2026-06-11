import { useEffect, useState } from "react";
import { Activity, CheckCircle2, XCircle, Loader2, RefreshCw, X, Zap } from "lucide-react";
import { runDiagnostics, type DiagnosticsResult } from "@/lib/orion-api";
import { sfx } from "@/lib/sounds";

const LABELS: Record<string, string> = {
  openai: "OpenAI API (principal · gpt-4o-mini)",
  lovable: "Lovable AI Gateway (fallback)",
  database: "Base de datos",
};

const ENV_LABELS: Record<string, string> = {
  OPENAI_API_KEY: "Clave OpenAI",
  LOVABLE_API_KEY: "Clave Lovable AI",
  SUPABASE_URL: "URL del backend",
  SUPABASE_SERVICE_ROLE_KEY: "Clave de servicio",
};

export function DiagnosticsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DiagnosticsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    sfx.tap();
    try {
      const d = await runDiagnostics();
      setData(d);
      sfx.receive();
    } catch (e: any) {
      setError(e.message || String(e));
      sfx.error();
    }
    setLoading(false);
  }

  useEffect(() => { if (open && !data) run(); /* eslint-disable-next-line */ }, [open]);

  if (!open) return null;

  const entries = data ? Object.entries(data.results) : [];
  const allOk = entries.length > 0 && entries.every(([, r]) => r.ok);
  const someDown = entries.some(([, r]) => !r.ok);

  return (
    <div className="fixed inset-0 z-[62] bg-background animate-panel-in flex flex-col">
      <header className="glass border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={onClose} className="tap p-2 rounded-lg hover:bg-accent"><X className="w-5 h-5" /></button>
        <div className="w-9 h-9 rounded-xl gradient-orion flex items-center justify-center shadow-glow">
          <Activity className="w-5 h-5 text-primary-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold tracking-tight">Diagnóstico del chat</div>
          <div className="text-[11px] text-muted-foreground">Estado en vivo de los proveedores de IA y el backend</div>
        </div>
        <button onClick={run} disabled={loading} className="tap btn-glass p-2 rounded-xl disabled:opacity-50" title="Volver a probar">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-2xl mx-auto space-y-4 animate-soft-rise">
          {/* Overview */}
          <div className={`glass-strong rounded-2xl p-5 border ${allOk ? "border-emerald-500/40" : someDown ? "border-amber-500/40" : "border-border"}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${allOk ? "bg-emerald-500/15 text-emerald-500" : "bg-amber-500/15 text-amber-500"}`}>
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : allOk ? <CheckCircle2 className="w-5 h-5" /> : <Zap className="w-5 h-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">
                  {loading ? "Probando servicios…" : allOk ? "Todo operativo" : someDown ? "Hay servicios degradados" : "Sin datos"}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {data ? `Última prueba: ${new Date(data.timestamp).toLocaleTimeString()}` : "Pulsa actualizar para probar"}
                </div>
              </div>
            </div>
            {error && <div className="mt-3 text-xs text-destructive">No se pudo conectar al backend: {error}</div>}
          </div>

          {/* Providers */}
          {data && (
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-1">Proveedores</div>
              {entries.map(([key, r]) => (
                <div key={key} className="liquid-glass rounded-xl p-4 flex items-start gap-3">
                  <div className="shrink-0 mt-0.5">
                    {r.ok
                      ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      : <XCircle className="w-5 h-5 text-destructive" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-sm">{LABELS[key] || key}</div>
                      <div className={`text-[11px] tabular-nums ${r.ms > 3000 ? "text-amber-500" : "text-muted-foreground"}`}>{r.ms} ms</div>
                    </div>
                    {r.ok ? (
                      r.sample && <div className="text-xs text-muted-foreground mt-1 truncate">Respuesta: <span className="text-foreground/80">"{r.sample}"</span></div>
                    ) : (
                      <div className="text-xs text-destructive mt-1 break-words">{r.error || "Sin respuesta"}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Env */}
          {data && (
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-1">Configuración</div>
              <div className="liquid-glass rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
                {Object.entries(data.env).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2 text-xs">
                    {v ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <XCircle className="w-3.5 h-3.5 text-destructive" />}
                    <span className="truncate">{ENV_LABELS[k] || k}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hint */}
          <div className="text-[11px] text-muted-foreground px-1 leading-relaxed">
            El chat espera la respuesta de la API el tiempo que haga falta, sin cortes ni tiempos límite.
          </div>
        </div>
      </main>
    </div>
  );
}
