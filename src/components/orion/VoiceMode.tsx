import { useEffect, useRef, useState, useCallback } from "react";
import { X, Mic, Loader2, Square } from "lucide-react";
import { OrionLogo } from "./OrionLogo";
import { supabase } from "@/integrations/supabase/client";
import { streamChat, type ChatMsg } from "@/lib/orion-api";

type Props = {
  open: boolean;
  onClose: () => void;
  convId: string | null;
  ensureConv: (text: string) => Promise<string>;
  onMessagesChanged?: () => void;
};

type State = "idle" | "listening" | "thinking" | "speaking";

const VOICE_SYSTEM: ChatMsg = {
  role: "system",
  content:
    "Estás en MODO VOZ. Responde SIEMPRE en español, de forma muy breve y conversacional (1-2 frases, máximo 40 palabras). Sin listas, sin markdown, sin emojis, sin código. Habla como una persona en una conversación natural.",
};

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
  const processingRef = useRef(false);
  const shouldListenRef = useRef(false);
  const micStartedRef = useRef(false);

  useEffect(() => { convRef.current = convId; }, [convId]);
  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    if (!open) return;
    const load = () => { voiceRef.current = pickVoice(); };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null as any; };
  }, [open]);

  useEffect(() => {
    if (!open || !convId) { historyRef.current = []; return; }
    (async () => {
      const { data } = await supabase
        .from("messages").select("role,content").eq("conversation_id", convId).order("created_at");
      historyRef.current = (data || []).map((m: any) => ({ role: m.role, content: m.content }));
    })();
  }, [open, convId]);

  // Dedup consecutive repeated words (e.g. "hola hola hola" → "hola")
  const dedupWords = (s: string) => {
    const parts = s.trim().split(/\s+/);
    const out: string[] = [];
    for (const w of parts) {
      const norm = w.toLowerCase().replace(/[.,!?;:]/g, "");
      const last = out[out.length - 1]?.toLowerCase().replace(/[.,!?;:]/g, "");
      if (norm !== last) out.push(w);
    }
    return out.join(" ");
  };

  const inactivityTimerRef = useRef<number | null>(null);
  const INACTIVITY_MS = 17000;

  const clearInactivity = () => {
    if (inactivityTimerRef.current) {
      window.clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  };
  const armInactivity = () => {
    clearInactivity();
    inactivityTimerRef.current = window.setTimeout(() => {
      shouldListenRef.current = false;
      const r = recogRef.current;
      recogRef.current = null;
      micStartedRef.current = false;
      try { r?.abort?.(); } catch {}
      window.speechSynthesis.cancel();
      setError("Sin actividad durante 17s. Modo voz pausado.");
      setState("idle");
    }, INACTIVITY_MS);
  };

  const startRecognition = useCallback(() => {
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setError("Reconocimiento de voz no soportado en este navegador."); return; }
    // Una ventana de escucha = una sola activación de micrófono durante 17s.
    if (micStartedRef.current || recogRef.current) return;
    const r = new SR();
    r.lang = "es-ES";
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    finalBufRef.current = "";
    setTranscript("");

    r.onresult = (ev: any) => {
      if (stateRef.current === "speaking") {
        window.speechSynthesis.cancel();
        setReply("");
        setState("listening");
      }
      if (processingRef.current || stateRef.current === "thinking") return;

      let interim = "";
      let gotFinal = false;
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        const t = res[0].transcript;
        if (res.isFinal) { finalBufRef.current = dedupWords((finalBufRef.current + " " + t).trim()); gotFinal = true; }
        else interim += t + " ";
      }
      const combined = dedupWords((finalBufRef.current + " " + interim).trim());
      setTranscript(combined);

      if (combined.length > 0 || gotFinal) armInactivity();

      if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
      if (combined.length > 0) {
        silenceTimerRef.current = window.setTimeout(() => {
          const final = dedupWords((finalBufRef.current || combined).trim());
          if (final.length >= 2 && !processingRef.current) handleUserUtterance(final);
        }, 1300);
      }
    };
    r.onerror = (e: any) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("Permiso de micrófono denegado.");
        shouldListenRef.current = false;
        if (recogRef.current === r) recogRef.current = null;
        micStartedRef.current = false;
        clearInactivity();
        setState("idle");
      }
    };
    r.onend = () => {
      if (recogRef.current === r) {
        recogRef.current = null;
        micStartedRef.current = false;
      }
    };
    recogRef.current = r;
    try {
      micStartedRef.current = true;
      r.start();
      setState("listening");
      armInactivity();
    } catch {
      recogRef.current = null;
      micStartedRef.current = false;
    }
  }, []);

  const stopRecognition = useCallback(() => {
    shouldListenRef.current = false;
    const r = recogRef.current;
    recogRef.current = null;
    micStartedRef.current = false;
    try { r?.abort?.(); } catch {}
    try { r?.stop?.(); } catch {}
    if (silenceTimerRef.current) { window.clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    clearInactivity();
  }, []);

  const resumeListening = useCallback(() => {
    finalBufRef.current = "";
    setTranscript("");
    shouldListenRef.current = true;
    processingRef.current = false;
    setState("listening");
    startRecognition();
  }, [startRecognition]);

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
    processingRef.current = true;
    // Pause recognition while we process + speak
    const r = recogRef.current;
    recogRef.current = null;
    micStartedRef.current = false;
    try { r?.stop?.(); } catch {}
    if (silenceTimerRef.current) { window.clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }

    finalBufRef.current = "";
    setTranscript(text);
    setState("thinking");
    try {
      const id = await ensureConv(text);
      convRef.current = id;
      await supabase.from("messages").insert({
        conversation_id: id, role: "user", content: text, attachments: [],
      });
      onMessagesChanged?.();
      historyRef.current = [...historyRef.current, { role: "user", content: text }];

      let acc = "";
      await streamChat([VOICE_SYSTEM, ...historyRef.current], (delta) => {
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
        resumeListening();
      });
    } catch (e: any) {
      setError(e.message || "Error");
      resumeListening();
    }
  }, [ensureConv, onMessagesChanged, speak, resumeListening]);

  const handleStopSpeaking = useCallback(() => {
    if (stateRef.current === "speaking") {
      window.speechSynthesis.cancel();
      setReply("");
      resumeListening();
    }
  }, [resumeListening]);

  useEffect(() => {
    if (open) {
      setError(null);
      setReply("");
      setTranscript("");
      processingRef.current = false;
      shouldListenRef.current = true;
      startRecognition();
    } else {
      stopRecognition();
      window.speechSynthesis.cancel();
      setState("idle");
    }
    return () => {
      stopRecognition();
      window.speechSynthesis.cancel();
    };
  }, [open, startRecognition, stopRecognition]);

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

        <div className="min-h-[100px] max-w-md w-full space-y-2">
          {state === "speaking" && reply && (
            <div className="text-base text-foreground leading-relaxed line-clamp-6">{reply}</div>
          )}
          {state !== "speaking" && (
            <div className="rounded-2xl border border-border bg-card/40 px-4 py-3 min-h-[64px] flex items-center justify-center">
              {transcript ? (
                <div className="text-base text-foreground leading-relaxed line-clamp-4">
                  <span className="text-muted-foreground">»</span> {transcript}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground italic">
                  {state === "listening" ? "Te estoy escuchando…" : state === "thinking" ? "Procesando…" : "Esperando…"}
                </div>
              )}
            </div>
          )}
        </div>

        {state === "speaking" && (
          <button
            onClick={handleStopSpeaking}
            className="tap flex items-center gap-2 px-5 py-2.5 rounded-full bg-destructive text-destructive-foreground shadow-soft hover:opacity-90"
          >
            <Square className="w-4 h-4 fill-current" />
            <span className="text-sm font-medium">Interrumpir</span>
          </button>
        )}

        {error && (
          <div className="text-sm text-destructive max-w-md">{error}</div>
        )}

        <div className="text-[11px] text-muted-foreground max-w-xs">
          Habla con normalidad. Puedes interrumpir a Orión hablando o con el botón.
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
