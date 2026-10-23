import { create } from "zustand";
import type { Alerta } from "@/lib/alertas";
import { notificar } from "./notificaciones";

// ============================================================
// Alertas del negocio (campana del menú y panel del Dashboard).
// Se consultan al entrar, cada 5 minutos y al abrir el panel.
// ============================================================

interface Estado {
  alertas: Alerta[];
  cargando: boolean;
  cargadoEn: number | null;
  cargar: (opciones?: { silencioso?: boolean }) => Promise<void>;
  descartar: (clave: string) => Promise<void>;
}

// "Una vez por sesión" sobrevive a recargas de la página (sessionStorage).
const CLAVE_AVISO = "papeleria-alertas-avisado";
const yaAvisado = () => {
  try {
    return sessionStorage.getItem(CLAVE_AVISO) === "1";
  } catch {
    return false;
  }
};
const marcarAvisado = () => {
  try {
    sessionStorage.setItem(CLAVE_AVISO, "1");
  } catch {
    /* sin almacenamiento: puede repetirse, no es grave */
  }
};

export const useAlertas = create<Estado>((set, get) => ({
  alertas: [],
  cargando: false,
  cargadoEn: null,
  cargar: async ({ silencioso = false } = {}) => {
    if (get().cargando) return;
    set({ cargando: true });
    try {
      const res = await fetch("/api/alertas", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const alertas: Alerta[] = data.alertas ?? [];
      set({ alertas, cargadoEn: Date.now() });
      // Una sola vez por sesión: si hay algo crítico, se avisa al entrar.
      const criticas = alertas.filter((a) => a.nivel === "critica").length;
      if (!silencioso && criticas > 0 && !yaAvisado()) {
        marcarAvisado();
        notificar.aviso(
          criticas === 1 ? "Tienes 1 alerta importante" : `Tienes ${criticas} alertas importantes`,
          "Revísalas en la campana del menú."
        );
      }
    } catch {
      // Sin red: se conservan las últimas alertas conocidas.
    } finally {
      set({ cargando: false });
    }
  },
  descartar: async (clave) => {
    const previas = get().alertas;
    set({ alertas: previas.filter((a) => a.clave !== clave) });
    try {
      const res = await fetch("/api/alertas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave }),
      });
      if (!res.ok) throw new Error();
    } catch {
      set({ alertas: previas });
      notificar.error("No se pudo ocultar la alerta");
    }
  },
}));
