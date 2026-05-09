import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "@/lib/device";
import { sfx } from "@/lib/sounds";
import { classifyNote, analyzeProject } from "@/lib/orion-api";
import { OrionLogo } from "./OrionLogo";
import {
  X, Plus, Trash2, Save, Folder, FolderPlus, Sparkles, Brain,
  ChevronRight, ArrowLeft, Wand2, Loader2,
  Heading1, Heading2, Heading3, ListChecks, List, Code,
} from "lucide-react";


type Note = {
  id: string;
  title: string;
  content: string;
  updated_at: string;
  last_activity: string;
  folder_id: string | null;
  section: string;
  category: string | null;
  status: string;
  ai_summary: string | null;
};

type FolderRow = {
  id: string;
  name: string;
  section: string;
  status: string;
  color: string;
};

const SECTIONS = [
  { id: "main", label: "Notas principales", icon: "📒" },
  { id: "dev", label: "Notas de desarrollo", icon: "🛠️" },
];

const STATUS = {
  stable: { label: "Estable", color: "text-green-400", dot: "🟢", bg: "bg-green-500/10" },
  development: { label: "En desarrollo", color: "text-yellow-400", dot: "🟡", bg: "bg-yellow-500/10" },
  problematic: { label: "Problemático", color: "text-red-400", dot: "🔴", bg: "bg-red-500/10" },
  abandoned: { label: "Abandonado", color: "text-zinc-400", dot: "⚫", bg: "bg-zinc-500/10" },
} as const;

const CATEGORY_EMOJI: Record<string, string> = {
  gameplay: "🎮", lore: "📖", ui: "🖼️", multiplayer: "🌐", economia: "💰",
  audio: "🔊", bugs: "🐛", arte: "🎨", programacion: "💻", otros: "📌",
};

export function NotesPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [section, setSection] = useState<"main" | "dev">("main");
  const [activeFolder, setActiveFolder] = useState<FolderRow | null>(null);
  const [active, setActive] = useState<Note | null>(null);
  const [classifying, setClassifying] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  async function load() {
    const did = getDeviceId();
    const [f, n] = await Promise.all([
      supabase.from("note_folders" as any).select("*").eq("device_id", did).order("created_at"),
      supabase.from("notes").select("*").eq("device_id", did).order("updated_at", { ascending: false }),
    ]);
    setFolders((f.data as any) || []);
    setNotes((n.data as any) || []);
  }
  useEffect(() => { if (open) load(); }, [open]);

  const visibleFolders = useMemo(() => folders.filter((f) => f.section === section), [folders, section]);
  const visibleNotes = useMemo(() => {
    if (activeFolder) return notes.filter((n) => n.folder_id === activeFolder.id);
    return notes.filter((n) => n.section === section && !n.folder_id);
  }, [notes, activeFolder, section]);

  async function createFolder() {
    sfx.tap();
    const name = prompt("Nombre de la carpeta:");
    if (!name) return;
    const did = getDeviceId();
    await supabase.from("note_folders" as any).insert({ device_id: did, name, section });
    load();
  }

  async function deleteFolder(id: string) {
    if (!confirm("¿Eliminar carpeta? Las notas dentro quedarán sin carpeta.")) return;
    await supabase.from("note_folders" as any).delete().eq("id", id);
    if (activeFolder?.id === id) setActiveFolder(null);
    load();
  }

  async function setFolderStatus(id: string, status: string) {
    await supabase.from("note_folders" as any).update({ status }).eq("id", id);
    load();
  }

  async function createNote() {
    sfx.tap();
    const did = getDeviceId();
    const { data } = await supabase.from("notes")
      .insert({
        device_id: did,
        title: "Nueva nota",
        content: "",
        section,
        folder_id: activeFolder?.id || null,
      })
      .select().single();
    if (data) { setActive(data as Note); load(); }
  }

  async function save() {
    if (!active) return;
    sfx.tap();
    await supabase.from("notes").update({
      title: active.title,
      content: active.content,
      updated_at: new Date().toISOString(),
      last_activity: new Date().toISOString(),
    }).eq("id", active.id);
    load();
  }

  async function classify() {
    if (!active) return;
    setClassifying(true);
    try {
      const r = await classifyNote(active.title, active.content);
      const updated = {
        ...active,
        category: r.category || active.category,
        status: r.status || active.status,
        section: r.section || active.section,
        ai_summary: r.summary || active.ai_summary,
      };
      await supabase.from("notes").update({
        category: updated.category,
        status: updated.status,
        section: updated.section,
        ai_summary: updated.ai_summary,
        last_activity: new Date().toISOString(),
      }).eq("id", active.id);
      setActive(updated);
      load();
    } catch (e) { console.error(e); }
    setClassifying(false);
  }

  async function runAnalysis() {
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const r = await analyzeProject(notes.slice(0, 30));
      setAnalysis(r);
    } catch (e: any) { setAnalysis("Error: " + e.message); }
    setAnalyzing(false);
  }

  async function remove(id: string) {
    await supabase.from("notes").delete().eq("id", id);
    if (active?.id === id) setActive(null);
    load();
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] bg-background animate-fade-up flex flex-col">
      {/* Header */}
      <header className="glass border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={onClose} className="tap p-2 rounded-lg hover:bg-accent"><X className="w-5 h-5" /></button>
        <OrionLogo size={32} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold tracking-tight">Modo Notas</div>
          <div className="text-[11px] text-muted-foreground">Notas inteligentes con análisis del proyecto</div>
        </div>
        <button
          onClick={runAnalysis}
          disabled={analyzing || notes.length === 0}
          className="tap px-3 py-1.5 rounded-lg gradient-orion text-primary-foreground text-sm flex items-center gap-1.5 disabled:opacity-50 shadow-glow"
        >
          {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
          <span className="hidden sm:inline">Analizar proyecto</span>
        </button>
      </header>

      {/* Section tabs */}
      <div className="border-b border-border px-3 flex gap-1">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => { sfx.tap(); setSection(s.id as any); setActiveFolder(null); setActive(null); }}
            className={`tap px-4 py-2.5 text-sm border-b-2 transition ${section === s.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar: folders + notes — hidden on mobile when a note or analysis is open */}
        <aside className={`${(active || analysis !== null) ? "hidden md:flex" : "flex"} w-full md:w-80 border-r border-border flex-col`}>
          {/* Breadcrumb */}
          <div className="p-3 flex items-center gap-2 border-b border-border">
            {activeFolder ? (
              <>
                <button onClick={() => setActiveFolder(null)} className="tap p-1 rounded hover:bg-accent"><ArrowLeft className="w-4 h-4" /></button>
                <span className="text-sm truncate flex items-center gap-1.5">
                  {STATUS[activeFolder.status as keyof typeof STATUS]?.dot} {activeFolder.name}
                </span>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Carpetas y notas</span>
            )}
            <div className="ml-auto flex gap-1">
              {!activeFolder && (
                <button onClick={createFolder} title="Nueva carpeta" className="tap p-1.5 rounded-lg hover:bg-accent"><FolderPlus className="w-4 h-4" /></button>
              )}
              <button onClick={createNote} title="Nueva nota" className="tap p-1.5 rounded-lg bg-primary text-primary-foreground"><Plus className="w-4 h-4" /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {/* Folders grid */}
            {!activeFolder && visibleFolders.length > 0 && (
              <div className="grid grid-cols-2 gap-2 mb-3">
                {visibleFolders.map((f) => {
                  const st = STATUS[f.status as keyof typeof STATUS] || STATUS.development;
                  const count = notes.filter((n) => n.folder_id === f.id).length;
                  return (
                    <div key={f.id} className={`group relative ${st.bg} border border-border rounded-xl p-3 cursor-pointer hover:scale-[1.02] transition`}
                      onClick={() => { sfx.tap(); setActiveFolder(f); setActive(null); }}>
                      <div className="flex items-center gap-2">
                        <Folder className="w-5 h-5" style={{ color: f.color }} />
                        <span className="text-xs">{st.dot}</span>
                      </div>
                      <div className="text-sm font-medium mt-1.5 truncate">{f.name}</div>
                      <div className="text-[10px] text-muted-foreground">{count} nota{count !== 1 ? "s" : ""}</div>
                      <select
                        value={f.status}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setFolderStatus(f.id, e.target.value)}
                        className="absolute bottom-1 right-1 text-[9px] bg-transparent opacity-0 group-hover:opacity-100"
                      >
                        {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteFolder(f.id); }}
                        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-0.5 text-destructive"
                      ><Trash2 className="w-3 h-3" /></button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Notes list */}
            <div className="space-y-1">
              {visibleNotes.map((n) => {
                const st = STATUS[n.status as keyof typeof STATUS] || STATUS.development;
                return (
                  <div key={n.id}
                    onClick={() => { sfx.tap(); setActive(n); }}
                    className={`group cursor-pointer px-3 py-2 rounded-xl flex items-start gap-2 ${active?.id === n.id ? "bg-accent" : "hover:bg-accent/60"}`}>
                    <span className="text-xs mt-0.5">{st.dot}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate flex items-center gap-1">
                        {n.category && <span>{CATEGORY_EMOJI[n.category] || "📌"}</span>}
                        {n.title}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {n.ai_summary || new Date(n.updated_at).toLocaleDateString()}
                      </div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); remove(n.id); }} className="opacity-0 group-hover:opacity-100 p-1 text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
              {visibleNotes.length === 0 && !activeFolder && visibleFolders.length === 0 && (
                <div className="text-center text-xs text-muted-foreground py-12">
                  Sin notas. Crea una carpeta o nota nueva.
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Editor / analysis */}
        <section className={`${(active || analysis !== null) ? "flex" : "hidden md:flex"} flex-1 flex-col min-w-0`}>
          {analysis !== null ? (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-3xl mx-auto">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <OrionLogo size={36} glow />
                    <div>
                      <div className="font-semibold">Análisis del proyecto</div>
                      <div className="text-xs text-muted-foreground">Detectado por Orión</div>
                    </div>
                  </div>
                  <button onClick={() => setAnalysis(null)} className="tap p-2 rounded-lg hover:bg-accent"><X className="w-4 h-4" /></button>
                </div>
                <div className="glass-strong rounded-2xl p-5 whitespace-pre-wrap text-sm leading-relaxed">
                  {analysis}
                </div>
              </div>
            </div>
          ) : active ? (
            <>
              <div className="p-3 border-b border-border flex items-center gap-2 flex-wrap">
                <button onClick={() => setActive(null)} className="md:hidden tap p-1 rounded-lg hover:bg-accent"><ArrowLeft className="w-4 h-4" /></button>
                <span className="text-xs text-muted-foreground">Estado:</span>
                <select
                  value={active.status}
                  onChange={(e) => setActive({ ...active, status: e.target.value })}
                  className="text-xs bg-card border border-border rounded-lg px-2 py-1"
                >
                  {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.dot} {v.label}</option>)}
                </select>
                {active.category && (
                  <span className="text-xs px-2 py-1 rounded-lg bg-primary/10 text-primary">
                    {CATEGORY_EMOJI[active.category] || "📌"} {active.category}
                  </span>
                )}
                <button
                  onClick={classify}
                  disabled={classifying || !active.content}
                  className="tap ml-auto px-2.5 py-1 rounded-lg bg-secondary text-secondary-foreground text-xs flex items-center gap-1 disabled:opacity-50"
                >
                  {classifying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                  Clasificar
                </button>
                <button onClick={save} className="tap px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-xs flex items-center gap-1">
                  <Save className="w-3 h-3" /> Guardar
                </button>
              </div>
              <div className="flex-1 flex flex-col p-4 gap-3 overflow-y-auto">
                <input
                  value={active.title}
                  onChange={(e) => setActive({ ...active, title: e.target.value })}
                  className="text-2xl font-semibold bg-transparent outline-none border-b border-border pb-2"
                />
                {active.ai_summary && (
                  <div className="text-xs text-muted-foreground italic flex items-start gap-1.5">
                    <Sparkles className="w-3 h-3 mt-0.5 text-primary shrink-0" />
                    {active.ai_summary}
                  </div>
                )}
                <textarea
                  value={active.content}
                  onChange={(e) => setActive({ ...active, content: e.target.value })}
                  placeholder="Escribe tus ideas, mecánicas, bugs, diálogos, sistemas, mapas, tareas, inspiración… Orión detectará el contexto automáticamente."
                  className="flex-1 bg-transparent outline-none resize-none text-sm leading-relaxed min-h-[300px]"
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm gap-3 p-8 text-center">
              <OrionLogo size={64} />
              <div>Selecciona o crea una nota para empezar</div>
              <div className="text-xs max-w-md">
                Las notas se clasifican automáticamente. Usa <strong>Analizar proyecto</strong> para que Orión detecte tareas abandonadas, scope creep y prioridades rotas.
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
