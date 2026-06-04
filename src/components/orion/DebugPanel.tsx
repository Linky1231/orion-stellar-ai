import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Bug, ImageIcon, Loader2, Maximize2, Upload, X } from "lucide-react";
import { fileToDataUrl, streamDebugVisual, uploadAttachment } from "@/lib/orion-api";
import { sfx } from "@/lib/sounds";
import { OrionLogo } from "./OrionLogo";

export function DebugPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState("");
  const [viewerOpen, setViewerOpen] = useState(false);

  if (!open) return null;

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) return alert("Sube una imagen válida.");
    setResult("");
    setRemoteUrl(null);
    setPreview(await fileToDataUrl(file));
    setUploading(true);
    try {
      const url = await uploadAttachment(file);
      setRemoteUrl(url);
      sfx.tap();
    } catch (e: any) {
      sfx.error();
      setResult("No se pudo subir la imagen: " + e.message);
    }
    setUploading(false);
  }

  async function analyze() {
    if (!remoteUrl || analyzing) return;
    setAnalyzing(true);
    setResult("");
    sfx.send();
    try {
      let acc = "";
      await streamDebugVisual(remoteUrl, notes, (delta) => {
        acc += delta;
        setResult(acc);
      });
      sfx.receive();
    } catch (e: any) {
      sfx.error();
      setResult("Error: " + e.message);
    }
    setAnalyzing(false);
  }

  function reset() {
    setPreview(null);
    setRemoteUrl(null);
    setResult("");
    setNotes("");
    setViewerOpen(false);
  }

  return (
    <div className="fixed inset-0 z-[62] bg-background animate-panel-in flex flex-col">
      <header className="glass border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={onClose} className="tap p-2 rounded-lg hover:bg-accent"><X className="w-5 h-5" /></button>
        <div className="w-9 h-9 rounded-xl gradient-orion flex items-center justify-center shadow-glow">
          <Bug className="w-5 h-5 text-primary-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold tracking-tight">Modo Debug</div>
          <div className="text-[11px] text-muted-foreground">Análisis visual profesional de capturas de juego</div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-5xl mx-auto grid lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)] gap-4 animate-soft-rise">
          <section className="space-y-3">
            {!preview ? (
              <label className="block cursor-pointer">
                <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
                <div className="min-h-[320px] border-2 border-dashed border-border rounded-2xl p-8 flex flex-col items-center justify-center text-center hover:border-primary hover:bg-accent/30 transition-smooth">
                  <Upload className="w-10 h-10 text-primary mb-3" />
                  <div className="font-semibold">Sube una captura de tu juego</div>
                  <div className="text-xs text-muted-foreground mt-1">La vista previa aparecerá al instante.</div>
                </div>
              </label>
            ) : (
              <div className="space-y-3 animate-soft-rise">
                <div className="relative rounded-2xl overflow-hidden border border-border bg-card shadow-soft">
                  <button onClick={() => setViewerOpen(true)} className="block w-full bg-muted">
                    <img src={preview} alt="Captura del juego" className="w-full max-h-[62vh] object-contain" />
                  </button>
                  <div className="absolute top-2 right-2 flex gap-2">
                    <button onClick={() => setViewerOpen(true)} className="tap p-2 rounded-lg bg-background/85 backdrop-blur hover:bg-background" title="Ver grande"><Maximize2 className="w-4 h-4" /></button>
                    <button onClick={reset} className="tap p-2 rounded-lg bg-background/85 backdrop-blur hover:bg-background" title="Quitar"><X className="w-4 h-4" /></button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={analyze} disabled={!remoteUrl || uploading || analyzing} className="tap flex-1 px-4 py-2.5 rounded-xl gradient-orion text-primary-foreground font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50 shadow-glow">
                    {analyzing ? <><Loader2 className="w-4 h-4 animate-spin" /> Analizando…</> : uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Preparando…</> : <><Bug className="w-4 h-4" /> Analizar captura</>}
                  </button>
                  <label className="tap px-4 py-2.5 rounded-xl bg-secondary text-secondary-foreground text-sm flex items-center gap-2 cursor-pointer">
                    <ImageIcon className="w-4 h-4" /> Cambiar
                    <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
                  </label>
                </div>
              </div>
            )}
          </section>

          <aside className="space-y-3">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Contexto opcional: género, plataforma, qué quieres mejorar…" rows={5} className="w-full bg-card border border-border rounded-xl p-3 text-sm outline-none resize-none focus:border-primary transition-smooth" />
            <div className="glass-strong rounded-2xl p-5 border border-border min-h-[260px] animate-soft-rise">
              <div className="flex items-center gap-2 mb-3">
                <OrionLogo size={28} glow={analyzing} />
                <div className="font-semibold text-sm">Análisis de Orión</div>
              </div>
              {result ? (
                <div className="text-sm leading-relaxed prose prose-sm max-w-none dark:prose-invert prose-p:my-1.5 prose-li:my-1">
                  <ReactMarkdown>{result}</ReactMarkdown>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  {analyzing ? <><Loader2 className="w-4 h-4 animate-spin" /> Analizando la captura…</> : "Sube una imagen para iniciar el diagnóstico visual."}
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>

      {viewerOpen && preview && (
        <div className="fixed inset-0 z-[70] bg-foreground/85 backdrop-blur-sm p-3 flex items-center justify-center animate-fade-up" onClick={() => setViewerOpen(false)}>
          <button className="absolute top-4 right-4 p-2 rounded-full bg-background text-foreground"><X className="w-5 h-5" /></button>
          <img src={preview} alt="Captura ampliada" className="max-w-full max-h-full object-contain rounded-xl shadow-glow" />
        </div>
      )}
    </div>
  );
}