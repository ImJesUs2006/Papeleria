"use client";

import { useEffect, useState } from "react";
import { MonitorDown } from "lucide-react";
import { notificar } from "@/store/notificaciones";

// ============================================================
// "Instalar aplicación" (PWA): el sistema se abre como un programa, con su
// icono, sin barra del navegador, y sigue cobrando aunque se vaya el
// internet (las ventas quedan en cola). Chrome y Edge avisan cuando se
// puede instalar; en los demás se explica cómo hacerlo a mano.
// ============================================================

interface EventoInstalar extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstalarApp() {
  const [evento, setEvento] = useState<EventoInstalar | null>(null);
  const [instalada, setInstalada] = useState(false);

  useEffect(() => {
    setInstalada(window.matchMedia?.("(display-mode: standalone)").matches === true);
    const antes = (e: Event) => {
      e.preventDefault();
      setEvento(e as EventoInstalar);
    };
    const hecha = () => {
      setInstalada(true);
      setEvento(null);
    };
    window.addEventListener("beforeinstallprompt", antes);
    window.addEventListener("appinstalled", hecha);
    return () => {
      window.removeEventListener("beforeinstallprompt", antes);
      window.removeEventListener("appinstalled", hecha);
    };
  }, []);

  if (instalada) return null;

  const instalar = async () => {
    if (evento) {
      await evento.prompt();
      const r = await evento.userChoice;
      if (r.outcome === "accepted") notificar.exito("Aplicación instalada", "Ábrela desde su icono en el escritorio o el inicio");
      setEvento(null);
      return;
    }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    notificar.info(
      "Cómo instalarla",
      ios
        ? "En Safari toca Compartir → «Agregar a inicio»."
        : "En Chrome o Edge usa el icono de instalar en la barra de direcciones (o Menú → «Instalar aplicación»). Necesita https o localhost."
    );
  };

  return (
    <button
      type="button"
      onClick={instalar}
      data-testid="instalar-app"
      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted hover:text-gray-100 hover:bg-surface-700 transition-all"
    >
      <MonitorDown className="h-4 w-4" />
      <span>Instalar aplicación</span>
    </button>
  );
}
