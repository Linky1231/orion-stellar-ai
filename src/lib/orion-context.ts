import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "@/lib/device";

const CHAR_LIMIT = 600;

let cache: { scope: string; at: number; prompt: string } | null = null;
const TTL = 60_000;

/** Construye el prompt de sistema con: configuración, base de conocimiento y memoria persistente. */
export async function buildSystemPrompt(): Promise<string> {
  const scope = getDeviceId();
  if (cache && cache.scope === scope && Date.now() - cache.at < TTL) return cache.prompt;

  const [cfgRes, kbRes, memRes] = await Promise.all([
    supabase.from("orion_config" as any).select("personality, behavior, context, extra_params").eq("id", 1).maybeSingle(),
    supabase.from("orion_knowledge" as any).select("title, content").order("updated_at", { ascending: false }).limit(40),
    supabase
      .from("user_memory" as any)
      .select("content, kind, created_at")
      .eq("device_id", scope)
      .order("created_at", { ascending: false })
      .limit(60),
  ]);

  const cfg: any = cfgRes.data || {};
  const kb: any[] = (kbRes.data as any[]) || [];
  const mem: any[] = (memRes.data as any[]) || [];

  const parts: string[] = [];
  parts.push(
    cfg.context ||
      "Eres Orión Estellar, una asistente con personalidad propia. Hablas en español por defecto.",
  );
  if (cfg.personality) parts.push(`PERSONALIDAD:\n${cfg.personality}`);
  if (cfg.behavior) parts.push(`COMPORTAMIENTO:\n${cfg.behavior}`);

  if (kb.length) {
    const docs = kb
      .map((k) => `### ${k.title}\n${String(k.content || "").slice(0, 1500)}`)
      .join("\n\n")
      .slice(0, 18000);
    parts.push(
      `BASE DE CONOCIMIENTO (documentación oficial del proyecto — consúltala SIEMPRE antes de responder y úsala como fuente de verdad):\n${docs}`,
    );
  }

  if (mem.length) {
    const facts = Array.from(new Set(mem.map((m) => String(m.content || "").trim()).filter(Boolean)))
      .map((c) => `- ${c}`)
      .join("\n")
      .slice(0, 6000);
    parts.push(
      `MEMORIA PERSISTENTE DEL USUARIO (compartida entre todos los chats — tenla en cuenta y no la contradigas):\n${facts}`,
    );
  }

  parts.push(`Responde con un máximo de ${CHAR_LIMIT} caracteres.`);

  const prompt = parts.join("\n\n");
  cache = { scope, at: Date.now(), prompt };
  return prompt;
}

export function invalidateOrionContext() {
  cache = null;
}
