let scopeOverride: string | null = null;

/** Cuando hay sesión iniciada usamos el id de la cuenta como "device id",
 *  así los datos siguen a la persona entre dispositivos. */
export function setAccountScope(userId: string | null) {
  scopeOverride = userId;
}

export function getLocalDeviceId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = localStorage.getItem("orion_device_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("orion_device_id", id);
  }
  return id;
}

export function getDeviceId(): string {
  if (scopeOverride) return scopeOverride;
  return getLocalDeviceId();
}
