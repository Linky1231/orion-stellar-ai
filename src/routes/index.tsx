import { createFileRoute } from "@tanstack/react-router";
import { ChatApp } from "@/components/orion/ChatApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Orión Estellar v5.0 — Asistente de IA" },
      { name: "description", content: "Orión Estellar: el asistente de IA con personalidad propia para creadores de videojuegos. Programación, arte y diseño de niveles." },
    ],
  }),
  component: () => <ChatApp />,
});
