import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { OrionLogo } from "./OrionLogo";
import { Loader2 } from "lucide-react";

export function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setMsg(null); setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: name.trim() },
          },
        });
        if (error) throw error;
        if (!data.session) setMsg("Revisa tu correo para confirmar la cuenta.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (e: any) {
      const m = String(e?.message || e);
      setErr(
        m.includes("Invalid login") ? "Correo o contraseña incorrectos."
        : m.includes("already registered") ? "Ese correo ya tiene cuenta. Inicia sesión."
        : m,
      );
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setErr(null); setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) { setErr("No se pudo iniciar sesión con Google."); setBusy(false); return; }
    if (result.redirected) return;
    setBusy(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm liquid-glass rounded-3xl p-7 space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <OrionLogo size={56} glow />
          <div>
            <h1 className="text-xl font-semibold">Orión Estellar</h1>
            <p className="text-xs text-muted-foreground mt-1">
              {mode === "login" ? "Inicia sesión para continuar" : "Crea tu cuenta"}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={google}
          disabled={busy}
          className="w-full h-11 rounded-xl liquid-glass flex items-center justify-center gap-2 text-sm font-medium transition-transform active:scale-[0.97] hover:brightness-110 disabled:opacity-60"
        >
          <svg className="w-4 h-4" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.3 17.6 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.1 5.3-4.6 7l7.1 5.5c4.2-3.9 6.6-9.6 6.6-16.9z" />
            <path fill="#FBBC05" d="M10.4 28.7a14.6 14.6 0 0 1 0-9.4l-7.8-6.1a24 24 0 0 0 0 21.6l7.8-6.1z" />
            <path fill="#34A853" d="M24 48c6.2 0 11.5-2 15.3-5.5l-7.1-5.5c-2 1.4-4.6 2.2-8.2 2.2-6.4 0-11.7-3.8-13.6-9.8l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
          </svg>
          Continuar con Google
        </button>

        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> o <span className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tu nombre"
              maxLength={60}
              className="w-full h-11 rounded-xl bg-muted/40 border border-border/60 px-3 text-sm outline-none focus:border-primary/60"
            />
          )}
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="correo@ejemplo.com"
            maxLength={255}
            className="w-full h-11 rounded-xl bg-muted/40 border border-border/60 px-3 text-sm outline-none focus:border-primary/60"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña (mín. 6)"
            className="w-full h-11 rounded-xl bg-muted/40 border border-border/60 px-3 text-sm outline-none focus:border-primary/60"
          />

          {err && <p className="text-xs text-destructive">{err}</p>}
          {msg && <p className="text-xs text-primary">{msg}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 transition-transform active:scale-[0.97] hover:brightness-110 disabled:opacity-60"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === "login" ? "Entrar" : "Crear cuenta"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => { setMode(mode === "login" ? "signup" : "login"); setErr(null); setMsg(null); }}
          className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {mode === "login" ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión"}
        </button>
      </div>
    </div>
  );
}
