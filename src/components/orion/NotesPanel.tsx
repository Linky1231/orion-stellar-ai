import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "@/lib/device";
import { sfx } from "@/lib/sounds";
import { X, Plus, Trash2, Save } from "lucide-react";

type Note = { id: string; title: string; content: string; updated_at: string };

export function NotesPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [active, setActive] = useState<Note | null>(null);

  async function load() {
    const did = getDeviceId();
    const { data } = await supabase
      .from("notes")
      .select("*")
      .eq("device_id", did)
      .order("updated_at", { ascending: false });
    setNotes((data as Note[]) || []);
  }
  useEffect(() => { if (open) load(); }, [open]);

  async function create() {
    sfx.tap();
    const did = getDeviceId();
    const { data } = await supabase
      .from("notes")
      .insert({ device_id: did, title: "Nueva nota", content: "" })
      .select()
      .single();
    if (data) { setActive(data as Note); load(); }
  }

  async function save() {
    if (!active) return;
    sfx.tap();
    await supabase
      .from("notes")
      .update({ title: active.title, content: active.content, updated_at: new Date().toISOString() })
      .eq("id", active.id);
    load();
  }

  async function remove(id: string) {
    await supabase.from("notes").delete().eq("id", id);
    if (active?.id === id) setActive(null);
    load();
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm animate-fade-up" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="glass-strong w-full max-w-4xl h-[80vh] rounded-3xl shadow-glow border border-border flex overflow-hidden">
        <div className="w-64 border-r border-border flex flex-col">
          <div className="p-4 flex items-center justify-between">
            <div className="font-semibold">Modo Notas</div>
            <button onClick={create} className="tap p-1.5 rounded-lg bg-primary text-primary-foreground"><Plus className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {notes.map((n) => (
              <div
                key={n.id}
                onClick={() => { sfx.tap(); setActive(n); }}
                className={`group cursor-pointer px-3 py-2 rounded-xl mb-1 flex items-center gap-2 ${active?.id === n.id ? "bg-accent" : "hover:bg-accent/60"}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{n.title}</div>
                  <div className="text-[10px] text-muted-foreground">{new Date(n.updated_at).toLocaleDateString()}</div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); remove(n.id); }} className="opacity-0 group-hover:opacity-100 p-1 text-destructive">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {notes.length === 0 && <div className="text-center text-xs text-muted-foreground py-6">Sin notas</div>}
          </div>
        </div>
        <div className="flex-1 flex flex-col">
          <div className="p-4 flex items-center justify-between border-b border-border">
            <div className="text-sm font-semibold">{active ? "Editar nota" : "Selecciona una nota"}</div>
            <div className="flex gap-2">
              {active && (
                <button onClick={save} className="tap px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm flex items-center gap-1">
                  <Save className="w-3.5 h-3.5" /> Guardar
                </button>
              )}
              <button onClick={onClose} className="tap p-1.5 rounded-lg hover:bg-accent"><X className="w-4 h-4" /></button>
            </div>
          </div>
          {active ? (
            <div className="flex-1 flex flex-col p-4 gap-3">
              <input
                value={active.title}
                onChange={(e) => setActive({ ...active, title: e.target.value })}
                className="text-xl font-semibold bg-transparent outline-none border-b border-border pb-2"
              />
              <textarea
                value={active.content}
                onChange={(e) => setActive({ ...active, content: e.target.value })}
                placeholder="Escribe tus apuntes, ideas e información personal…"
                className="flex-1 bg-transparent outline-none resize-none text-sm leading-relaxed"
              />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Crea o selecciona una nota</div>
          )}
        </div>
      </div>
    </div>
  );
}
