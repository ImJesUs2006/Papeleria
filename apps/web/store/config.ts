"use client";

import { create } from "zustand";
import type { BusinessConfig } from "@/lib/business-types";
import { DEFAULT_FEATURE_FLAGS } from "@/lib/business-types";
import { isConfigSignatureValidClient } from "@/lib/config-signing-client";

// ============================================================
// Store de Feature Flags (cliente).
//
// - El servidor entrega { config, firma, sessionKey } (sessionKey
//   en memoria, fuera de React persist). EN NINGÚN CASO se guarda
//   sessionKey en localStorage/IndexedDB.
// - En disco solo persiste { config, firma } (zona "offline-cache").
// - Al hidratar, la firma se verifica contra la sessionKey EN
//   MEMORIA. Si no hay sessionKey (arranque en frío offline) o la
//   firma no cuadra → estado "NO_VERIFICADA": se aplican flags en
//   false salvo módulos de caja/cobro, y se muestra una alerta.
// ============================================================

export type ConfigTrustState =
  | "PENDIENTE"
  | "VERIFICADA"
  | "NO_VERIFICADA"
  | "ERROR";

type PersistedCache = {
  config: BusinessConfig;
  firma: string;
  guardadaEn: string;
};

const CACHE_KEY = "papeleria-config-cache";

interface ConfigState {
  trust: ConfigTrustState;
  config: BusinessConfig | null;
  lastError: string | null;
  hydrate: () => Promise<void>;
  isFeatureEnabled: (flag: keyof BusinessConfig["featureFlags"]) => boolean;
  refresh: (config: BusinessConfig, firma: string, sessionKey: string) => boolean;
  invalidate: () => void;
}

function applyVerified(config: BusinessConfig) {
  const cache: PersistedCache = { config, firma: "", guardadaEn: new Date().toISOString() };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* almacenamiento no disponible */
  }
}

function safeFlags(): BusinessConfig["featureFlags"] {
  return { ...DEFAULT_FEATURE_FLAGS };
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  trust: "PENDIENTE",
  config: null,
  lastError: null,

  hydrate: async () => {
    try {
      const res = await fetch("/api/configuracion/negocio/cache", { cache: "no-store" });
      if (!res.ok) throw new Error(`cache ${res.status}`);
      const data = await res.json();
      // sessionKey llega en memoria: verificamos al vuelo y NO la persistimos.
      const ok = await isConfigSignatureValidClient(data.config, data.firma, data.sessionKey);
      if (ok) {
        const config: BusinessConfig = data.config;
        set({ config, trust: "VERIFICADA", lastError: null });
        applyVerified(config);
      } else {
        set({ config: data.config, trust: "NO_VERIFICADA", lastError: "Firma de configuración inválida" });
      }
    } catch {
      // Sin red: usar cache local si existe, pero sin llave → NO_VERIFICADA.
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) {
          const cached: PersistedCache = JSON.parse(raw);
          set({ config: cached.config, trust: "NO_VERIFICADA", lastError: "Sin conexión: configuración no verificable" });
        } else {
          set({ trust: "ERROR", lastError: "Sin conexión y sin caché de configuración" });
        }
      } catch {
        set({ trust: "ERROR", lastError: "Sin conexión y sin caché de configuración" });
      }
    }
  },

  refresh: (config, firma, sessionKey) => {
    // Mantiene verificable la config tras una actualización del admin.
    const verified = sessionKey.length > 0;
    set({
      config,
      trust: verified ? "VERIFICADA" : "NO_VERIFICADA",
      lastError: verified ? null : "Config sin verificación de llave",
    });
    if (verified) applyVerified(config);
    return verified;
  },

  invalidate: () => set({ trust: "NO_VERIFICADA" }),

  isFeatureEnabled: (flag) => {
    // SOLO se honran flags de un blob con firma verificada (trust VERIFICADA).
    // No verificado o con firma inválida → módulos no críticos apagados;
    // caja/cobro siguen dependiendo de la autoridad del servidor.
    if (get().trust !== "VERIFICADA") return false;
    return get().config?.featureFlags[flag] === true;
  },
}));

/** Útil para sketches: flags seguras por defecto. */
export { safeFlags };
export type { PersistedCache };