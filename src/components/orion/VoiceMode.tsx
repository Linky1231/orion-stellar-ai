import { useEffect, useRef, useState, useCallback } from "react";
import { X, Mic, Loader2 } from "lucide-react";
import { OrionLogo } from "./OrionLogo";
import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "@/lib/device";
import { streamChat, type ChatMsg } from "@/lib/orion-api";

type Props = {
  open: boolean;
  onClose: () => void;
  convId: string | null;
  ensureConv: (text: string) => Promise<string>;
  onMessagesChanged?: () => void;
};

type State = "idle" | "listening" | "thinking" | "speaking";

// Pick a Google Spanish voice if available
function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const es = voices.filter((v) => v.lang?.toLowerCase().startsWith("es"));
  const google = es.find((v) => /google/i.test(v.name));
  return google || es[0] || voices[0] || null;
}

export function VoiceMode({ open, onClose, convId, ensureConv, onMessagesChanged }: Props) {
  const [state, setState] = useState<State>("idle");
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recogRef = useRef<any>(null);
  const stateRef = useRef<State>("idle");
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const historyRef = useRef<ChatMsg[]>([]);
  const convRef = useRef<string | null>(convId);
  const finalBufRef = useRef("");
  const silenceTimerRef = useRef<number | null>(null);

  useEffect(() => { convRef.current = convId; }, [convId]);
  useEffect(() => { stateRef.current = state; }, [state]);

  // Load voices
  useEffect(() => {
    if (!open) return;
    const load = () => { voiceRef.current = pickVoice(); };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null as any; };
  }, [open]);

  // Load existing conversation history when opening
  useEffect(() => {
    if (!open || !convId) { historyRef.current = []; return; }
    (async () => {
      const { data } = await supabase
        .from("messages").select("role,content").eq("conversation_id", convId).order("created_at");
      historyRef.current = (data || []).map((m: any) => ({ role: m.role, content: m.content }));
    })();
  }, [open, convId]);

  const startListening = useCallback(() => {
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setError("Reconocimiento de voz no soportado en este navegador."); return; }
    try { recogRef.current?.stop(); } catch {}
    const r = new SR();
    r.lang = "es-ES";
    r.continuous = true;
    r.interimResults = true;
    finalBufRef.current = "";
    setTranscript("");
    r.onresult = (ev: any) => {
      // If Orion is speaking and user talks → interrupt
      if (stateRef.current === "speaking") {
        window.speechSynthesis.cancel();
        setReply("");
        setState("listening");
      }
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        if (res.isFinal) finalBufRef.current += res[0].transcript + " ";
        else interim += res[0].transcript;
      }
      setTranscript((finalBufRef.current + interim).trim());
      // Reset silence timer
      if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
      const text = (finalBufRef.current + interim).trim();
      if (text.length > 0) {
        silenceTimerRef.current = window.setTimeout(() => {
          const final = finalBufRef.current.trim() || text;
          if (final.length >= 2) handleUserUtterance(final);
        }, 1400);
      }
    };
    r.onerror = (e: any) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("Permiso de micrófono denegado.");
        setState("idle");
      } else if (e.error === "no-speech") {
        // ignore
      }
    };
    r.onend = () => {
      // Auto-restart while in voice mode and not thinking
      if (open && (stateRef.current === "listening" || stateRef.current === "speaking")) {
        try { r.start(); } catch {}
      }
    };
    recogRef.current = r;
    try { r.start(); setState("listening"); } catch {}
  }, [open]);

  const stopListening = useCallback(() => {
    try { recogRef.current?.stop(); } catch {}
    recogRef.current = null;
    if (silenceTimerRef.current) { window.clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
  }, []);

  const speak = useCallback((text: string, onDone: () => void) => {
    window.speechSynthesis.cancel();
    if (!text.trim()) { onDone(); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "es-ES";
    if (voiceRef.current) u.voice = voiceRef.current;
    u.rate = 1.0;
    u.pitch = 1.0;
    u.onend = onDone;
    u.onerror = onDone;
    setState("speaking");
    window.speechSynthesis.speak(u);
  }, []);

  const handleUserUtterance = useCallback(async (text: string) => {
    finalBufRef.current = "";
    setTranscript(text);
    setState("thinking");
    try {
      const id = await ensureConv(text);
      convRef.current = id;
      // Save user message
      await supabase.from("messages").insert({
        conversation_id: id, role: "user", content: text, attachments: [],
      });
      onMessagesChanged?.();
      historyRef.current = [...historyRef.current, { role: "user", content: text }];

      let acc = "";
      await streamChat(historyRef.current, (delta) => {
        acc += delta;
        setReply(acc);
      });
      historyRef.current = [...historyRef.current, { role: "assistant", content: acc }];
      await supabase.from("messages").insert({
        conversation_id: id, role: "assistant", content: acc, attachments: [],
      });
      await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", id);
      onMessagesChanged?.();

      speak(acc, () => {
        setReply("");
        setState("listening");
      });
    } catch (e: any) {
      setError(e.message || "Error");
      setState("listening");
    }
  }, [ensureConv, onMessagesChanged, speak]);

  // Start/stop on open
  useEffect(() => {
    if (open) {
      setError(null);
      setReply("");
      setTranscript("");
      startListening();
    } else {
      stopListening();
      window.speechSynthesis.cancel();
      setState("idle");
    }
    return () => {
      stopListening();
      window.speechSynthesis.cancel();
    };
  }, [open, startListening, stopListening]);

  if (!open) return null;

  const label =
    state === "listening" ? "Escuchando…" :
    state === "thinking" ? "Pensando…" :
    state === "speaking" ? "Hablando…" : "Iniciando…";

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="text-sm font-medium">Modo voz</div>
        <button onClick={onClose} className="tap p-2 rounded-lg hover:bg-accent" aria-label="Cerrar">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6 text-center">
        <div className={`relative ${state === "speaking" ? "animate-pulse" : ""}`}>
          <div
            className={`absolute inset-0 rounded-full blur-2xl transition-opacity ${
              state === "listening" ? "bg-primary/40 opacity-100 animate-pulse" :
              state === "speaking" ? "bg-primary/60 opacity-100" :
              state === "thinking" ? "bg-primary/30 opacity-100" : "opacity-0"
            }`}
          />
          <div className="relative">
            <OrionLogo size={140} glow />
          </div>
        </div>

        <div className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          {state === "thinking" && <Loader2 className="w-3 h-3 animate-spin" />}
          {state === "listening" && <Mic className="w-3 h-3 text-primary" />}
          {label}
        </div>

        <div className="min-h-[80px] max-w-md w-full">
          {state === "speaking" && reply && (
            <div className="text-base text-foreground leading-relaxed line-clamp-6">{reply}</div>
          )}
          {state !== "speaking" && transcript && (
            <div className="text-base text-muted-foreground italic leading-relaxed line-clamp-4">"{transcript}"</div>
          )}
        </div>

        {error && (
          <div className="text-sm text-destructive max-w-md">{error}</div>
        )}

        <div className="text-[11px] text-muted-foreground max-w-xs">
          Habla con normalidad. Puedes interrumpir a Orión en cualquier momento.
        </div>
      </div>
    </div>
  );
}

export function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Mac/.test(ua) && (navigator as any).maxTouchPoints > 1);
}
