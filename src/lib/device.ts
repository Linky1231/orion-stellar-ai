export function getDeviceId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = localStorage.getItem("orion_device_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("orion_device_id", id);
  }
  return id;
}
