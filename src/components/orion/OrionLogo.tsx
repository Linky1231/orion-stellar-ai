import logo from "@/assets/orion-logo.jpeg";

export function OrionLogo({ size = 36, glow = false }: { size?: number; glow?: boolean }) {
  return (
    <div
      className={`relative rounded-full overflow-hidden ${glow ? "animate-pulse-glow" : ""}`}
      style={{ width: size, height: size }}
    >
      <img src={logo} alt="Orión Estellar" className="w-full h-full object-cover" />
    </div>
  );
}
