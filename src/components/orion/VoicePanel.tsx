import { useEffect, useRef, useState, useCallback } from "react";
import { X, Mic, MicOff, Square, Loader2 } from "lucide-react";
import { OrionLogo } from "./OrionLogo";
import { sfx } from "@/lib/sounds";
import { streamChat, type ChatMsg } from "@/lib/orion-api";

type State = "idle" | "listening" | "thinking" | "speaking";

// Pick the most natural Spanish female voice available in the browser.
function pickFemaleSpanishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  const es = voices.filter((v) => /^es(-|_)?/i.test(v.lang));
  const pool = es.length ? es : voices;

  // Preference: known high-quality female names from Google / Apple / Microsoft Natural
  const femaleHints = [
    /elvira/i, /paulina/i, /monica/i, /mónica/i, /lucia/i, /lucía/i, /sabina/i,
    /helena/i, /laura/i, /marisol/i, /esperanza/i, /ximena/i, /camila/i, /sofia/i,
    /female/i, /mujer/i, /natural/i,
  ];
  const qualityHints = [/google/i, /natural/i, /neural/i, /premium/i, /enhanced/i, /siri/i];

  const scored = pool.map((v) => {
    let s = 0;
    for (const r of femaleHints) if (r.test(v.name)) s += 5;
    for (const r of qualityHints) if (r.test(v.name)) s += 3;
    if (/google/i.test(v.name) && /español|spanish|es/i.test(v.name + v.lang)) s += 4;
    if (/es-ES/i.test(v.lang)) s += 2;
    return { v, s };
  });
  scored.sort((a, b) => b.s - a.s);
  return scored[0]?.v || pool[0];
}

export function VoicePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [state, setState] = useState<State>("idle");
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const historyRef = useRef<ChatMsg[]>([]);
  const recogRef = useRef<any>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const activeRef = useRef(false);

  // Load voices
  useEffect(() => {
    if (typeof window === "undefined") return;
    function refresh() {
      const vs = window.speechSynthesis.getVoices();
      voiceRef.current = pickFemaleSpanishVoice(vs);
    }
    refresh();
    window.speechSynthesis.addEventListener?.("voiceschanged", refresh);
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", refresh);
  }, []);

  // Setup SpeechRecognition
  useEffect(() => {
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setSupported(false); return; }
    const r = new SR();
    r.lang = "es-ES";
    r.continuous = false;
    r.interimResults = true;
    recogRef.current = r;
  }, []);

  const stopAll = useCallback(() => {
    activeRef.current = false;
    try { recogRef.current?.abort?.(); } catch {}
    window.speechSynthesis.cancel();
    setState("idle");
  }, []);

  const speak = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "es-ES";
      u.rate = 1.0;
      u.pitch = 1.05;
      if (voiceRef.current) u.voice = voiceRef.current;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    });
  }, []);

  const listen = useCallback((): Promise<string> => {
    return new Promise((resolve, reject) => {
      const r = recogRef.current;
      if (!r) return reject(new Error("Reconocimiento de voz no disponible en este navegador. Usa Chrome en Android o un PC."));
      let finalText = "";
      let interim = "";
      let settled = false;
      const done = (v: string) => { if (!settled) { settled = true; resolve(v); } };
      const fail = (e: Error) => { if (!settled) { settled = true; reject(e); } };
      r.onresult = (e: any) => {
        interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) finalText += res[0].transcript;
          else interim += res[0].transcript;
        }
        setTranscript((finalText + " " + interim).trim());
      };
      r.onerror = (e: any) => {
        const err = e?.error || "";
        if (err === "no-speech" || err === "aborted") return done(finalText.trim());
        if (err === "not-allowed" || err === "service-not-allowed")
          return fail(new Error("El navegador no permite reconocimiento de voz. En iPhone/Safari no está disponible; usa Chrome en Android o un PC."));
        if (err === "audio-capture") return fail(new Error("No se detecta micrófono."));
        if (err === "network") return fail(new Error("Sin conexión para reconocimiento de voz."));
        return fail(new Error("Error de micrófono: " + err));
      };
      r.onend = () => done(finalText.trim());
      try { r.start(); } catch (err: any) {
        fail(new Error("No se pudo iniciar el micrófono: " + (err?.message || "")));
      }
    });
  }, []);

  const loop = useCallback(async () => {
    if (!activeRef.current) return;
    try {
      // 1) Listen
      setState("listening");
      setTranscript("");
      setReply("");
      sfx.tap();
      const userText = await listen();
      if (!activeRef.current) return;
      if (!userText) { // silence -> listen again
        if (activeRef.current) loop();
        return;
      }

      // 2) Think + stream
      setState("thinking");
      historyRef.current.push({ role: "user", content: userText });
      let acc = "";
      await streamChat(historyRef.current, (delta) => {
        acc += delta;
        setReply(acc);
      });
      if (!activeRef.current) return;
      historyRef.current.push({ role: "assistant", content: acc });

      // 3) Speak
      setState("speaking");
      await speak(acc || "No tengo respuesta.");
      if (!activeRef.current) return;

      // 4) Loop
      loop();
    } catch (e: any) {
      setError(e?.message || "Error en conversación");
      setState("idle");
    }
  }, [listen, speak]);

  const start = useCallback(async () => {
    setError(null);
    // Request mic permission explicitly — required on iOS/Safari or
    // SpeechRecognition fails with "service-not-allowed".
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      setError(
        "Permiso de micrófono denegado. En iPhone: Ajustes → Safari → Micrófono → Permitir. Nota: el reconocimiento de voz en iOS Safari es limitado; usa Chrome en Android o un PC para mejor experiencia."
      );
      return;
    }
    activeRef.current = true;
    sfx.open();
    setState("speaking");
    setReply("Hola, soy Orión. ¿En qué puedo ayudarte?");
    speak("Hola, soy Orión. ¿En qué puedo ayudarte?").then(() => {
      if (activeRef.current) loop();
    });
  }, [loop, speak]);

  useEffect(() => {
    if (!open) {
      stopAll();
      historyRef.current = [];
      setTranscript("");
      setReply("");
      setError(null);
    }
  }, [open, stopAll]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-background/95 backdrop-blur-xl flex flex-col animate-fade-up">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <OrionLogo size={28} glow={state === "speaking"} />
          <div>
            <div className="font-semibold tracking-tight text-sm">Modo Voz</div>
            <div className="text-[11px] text-muted-foreground">
              {state === "idle" && "Listo"}
              {state === "listening" && "Escuchando…"}
              {state === "thinking" && "Pensando…"}
              {state === "speaking" && "Hablando…"}
            </div>
          </div>
        </div>
        <button className="tap p-2 rounded-lg hover:bg-accent" onClick={() => { sfx.tap(); onClose(); }}>
          <X className="w-5 h-5" />
        </button>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-8">
        {!supported && (
          <div className="text-sm text-destructive text-center max-w-sm">
            Tu navegador no soporta reconocimiento de voz. Prueba Chrome o Edge.
          </div>
        )}

        {/* Orb */}
        <div className="relative">
          <div
            className={`w-56 h-56 rounded-full gradient-orion shadow-glow transition-transform duration-500
              ${state === "speaking" ? "scale-110 animate-pulse" : state === "listening" ? "scale-105" : "scale-100"}`}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <OrionLogo size={96} glow />
          </div>
        </div>

        {/* Live captions */}
        <div className="w-full max-w-md min-h-[80px] text-center space-y-3">
          {transcript && (
            <div className="text-sm text-muted-foreground italic">"{transcript}"</div>
          )}
          {reply && (
            <div className="text-base leading-relaxed">{reply}</div>
          )}
          {error && <div className="text-sm text-destructive">{error}</div>}
        </div>
      </div>

      {/* Controls */}
      <div className="p-6 flex items-center justify-center gap-4">
        {state === "idle" ? (
          <button
            onClick={start}
            disabled={!supported}
            className="tap px-6 py-4 rounded-full gradient-orion text-primary-foreground shadow-glow flex items-center gap-3 disabled:opacity-50"
          >
            <Mic className="w-5 h-5" /> Iniciar conversación
          </button>
        ) : (
          <>
            {state === "thinking" && (
              <div className="px-4 py-2 rounded-full bg-card border border-border flex items-center gap-2 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Pensando
              </div>
            )}
            <button
              onClick={() => { sfx.tap(); stopAll(); }}
              className="tap px-6 py-4 rounded-full bg-destructive text-destructive-foreground flex items-center gap-3"
            >
              <Square className="w-5 h-5" /> Detener
            </button>
          </>
        )}
      </div>
    </div>
  );
}
