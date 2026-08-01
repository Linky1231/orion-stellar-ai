import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getLocalDeviceId, setAccountScope } from "@/lib/device";

export type Profile = { id: string; display_name: string; avatar_url: string | null };

type AuthValue = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const Ctx = createContext<AuthValue>({
  user: null, session: null, profile: null, loading: true,
  signOut: async () => {}, refreshProfile: async () => {},
});

/** Traspasa los chats/notas guardados por dispositivo a la cuenta recién iniciada. */
async function migrateDeviceData(userId: string) {
  const did = getLocalDeviceId();
  if (!did || did === userId || did === "ssr") return;
  const done = localStorage.getItem(`orion_migrated_${userId}`);
  if (done) return;
  const patch = { device_id: userId, user_id: userId } as any;
  await Promise.all([
    supabase.from("conversations").update(patch).eq("device_id", did),
    supabase.from("notes").update(patch).eq("device_id", did),
    supabase.from("note_folders" as any).update(patch).eq("device_id", did),
    supabase.from("user_memory" as any).update(patch).eq("device_id", did),
  ]);
  localStorage.setItem(`orion_migrated_${userId}`, "1");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const user = session?.user ?? null;

  const loadProfile = useCallback(async (uid: string) => {
    const { data } = await supabase.from("profiles" as any).select("id,display_name,avatar_url").eq("id", uid).maybeSingle();
    if (data) setProfile(data as unknown as Profile);
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setAccountScope(s?.user?.id ?? null);
      if (s?.user) {
        const uid = s.user.id;
        setTimeout(() => { void migrateDeviceData(uid).then(() => loadProfile(uid)); }, 0);
      } else {
        setProfile(null);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAccountScope(data.session?.user?.id ?? null);
      if (data.session?.user) {
        const uid = data.session.user.id;
        void migrateDeviceData(uid).then(() => loadProfile(uid));
      }
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setAccountScope(null);
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user.id);
  }, [user, loadProfile]);

  return (
    <Ctx.Provider value={{ user, session, profile, loading, signOut, refreshProfile }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  return useContext(Ctx);
}
