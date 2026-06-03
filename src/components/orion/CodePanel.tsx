import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Code2, Copy, Loader2, Send, X } from "lucide-react";
import { streamCode } from "@/lib/orion-api";
import { sfx } from "@/lib/sounds";
import { OrionLogo } from "./OrionLogo";

const LANGS = ["auto", "builda", "typescript", "javascript", "python", "go", "rust", "c#", "c++", "java", "swift", "kotlin", "php", "ruby", "sql", "bash", "html", "css", "gdscript"];

export function CodePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [language, setLanguage] = useState("auto");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState("");

  if (!open) return null;

  async function run() {
    if (!prompt.trim() || running) return;
    setRunning(true);
    setResult("");
    sfx.send();
    try {
      let acc = "";
      await streamCode(prompt.trim(), language, [], (delta) => {
        acc += delta;
        setResult(acc);
      });
      sfx.receive();
    } catch (e: any) {
      sfx.error();
      setResult("⚠️ " + e.message);
    }
    setRunning(false);
  }

  return (
    <div className="fixed inset-0 z-[62] bg-background animate-panel-in flex flex-col">
      <header className="glass border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={onClose} className="tap p-2 rounded-lg hover:bg-accent"><X className="w-5 h-5" /></button>
        <div className="w-9 h-9 rounded-xl gradient-orion flex items-center justify-center shadow-glow">
          <Code2 className="w-5 h-5 text-primary-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold tracking-tight">Modo Code</div>
          <div className="text-[11px] text-muted-foreground">Genera código listo para usar en cualquier lenguaje</div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-4xl mx-auto space-y-4 animate-soft-rise">
          <div className="glass-strong rounded-2xl border border-border p-3 space-y-3 shadow-soft">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Lenguaje:</span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="bg-card border border-border rounded-lg px-2 py-1 text-xs outline-none focus:border-primary"
              >
                {LANGS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); run(); } }}
              placeholder="Describe el código que quieres generar… (Ej: función que valide un email en TypeScript)"
              rows={4}
              className="w-full bg-card border border-border rounded-xl p-3 text-sm outline-none resize-none focus:border-primary transition-smooth"
            />
            <button
              onClick={run}
              disabled={!prompt.trim() || running}
              className="tap w-full px-4 py-2.5 rounded-xl gradient-orion text-primary-foreground font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50 shadow-glow"
            >
              {running ? <><Loader2 className="w-4 h-4 animate-spin" /> Generando…</> : <><Send className="w-4 h-4" /> Generar código</>}
            </button>
          </div>

          <div className="glass-strong rounded-2xl p-5 border border-border min-h-[280px]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <OrionLogo size={28} glow={running} />
                <div className="font-semibold text-sm">Código de Orión</div>
              </div>
              {result && !running && (
                <button
                  onClick={() => { navigator.clipboard.writeText(result); sfx.tap(); }}
                  className="tap text-xs px-2 py-1 rounded-lg bg-card hover:bg-accent border border-border flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" /> Copiar todo
                </button>
              )}
            </div>
            {result ? (
              <div className="text-sm leading-relaxed prose prose-sm max-w-none dark:prose-invert prose-p:my-1.5 prose-pre:bg-muted prose-pre:text-foreground prose-pre:rounded-xl prose-pre:p-3 prose-code:text-foreground">
                <ReactMarkdown>{result}</ReactMarkdown>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                {running ? <><Loader2 className="w-4 h-4 animate-spin" /> Escribiendo código…</> : "Describe lo que quieres construir y Orión generará el código."}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
