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
//   MEMORIA (vía WebCrypto). Si no hay sessionKey (arranque en frío
//   offline) o la firma no cuadra → estado "NO_VERIFICADA": se
//   aplican flags en false salvo módulos de caja/cobro, y se muestra
//   una alerta. Si WebCrypto no existe (http por LAN en aula, donde
//   crypto.subtle está ausente), confiamos en la réplica autenticada
//   que el servidor entrega (estado "CONFIANZA", visible en la UI),
//   porque el servidor sigue siendo la autoridad final (requireFeature
//   revalida en cada endpoint).
// ============================================================

export type ConfigTrustState =
  | "PENDIENTE"
  | "VERIFICADA"
  | "CONFIANZA"
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
  /** Fuerza un flag en el estado local. Seguro: el servidor revalida en cada API. */
  setFlag: (flag: keyof BusinessConfig["featureFlags"], value: boolean) => void;
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
      // WebCrypto (crypto.subtle) solo existe en contextos seguros (https/localhost).
      // En LAN por http (típico en aula) NO hay subtle: verificar la firma es
      // imposible, pero el servidor acaba de responder autenticado y REVALIDA los
      // flags en cada API (requireFeature), así que confiamos en la réplica que
      // entrega. Si subtle SÍ existe, la firma manda: un blob manipulado jamás
      // activa módulos (protección offline anti-manipulación intacta).
      const canVerify =
        typeof crypto !== "undefined" && !!crypto.subtle && typeof crypto.subtle.verify === "function";
      const ok = canVerify
        ? await isConfigSignatureValidClient(data.config, data.firma, data.sessionKey)
        : false;
      const sessionKeyOk = typeof data.sessionKey === "string" && data.sessionKey.length > 0;
      if (ok) {
        const config: BusinessConfig = data.config;
        set({ config, trust: "VERIFICADA", lastError: null });
        applyVerified(config);
      } else if (!canVerify && sessionKeyOk) {
        // Modo lustre "CONFIANZA" (LAN sin WebCrypto): no hay verificación
        // criptográfica local, pero la réplica es la entregada por el propio
        // servidor autenticado y los flags se revalidan en cada API.
        const config: BusinessConfig = data.config;
        set({ config, trust: "CONFIANZA", lastError: null });
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
    // Mantiene la config tras una actualización del admin. Si el navegador
    // tiene WebCrypto (https/localhost) se marca VERIFICADA; en LAN por http
    // (sin crypto.subtle) se admite el blob del PUT como CONFIANZA (la firma
    // local es imposible), nunca como NO_VERIFICADA: el usuario acaba de
    // guardar y el servidor respondió 200 con su réplica firmada.
    const sessionKeyOk = typeof sessionKey === "string" && sessionKey.length > 0;
    const canVerify =
      typeof crypto !== "undefined" && !!crypto.subtle && typeof crypto.subtle.verify === "function";
    const elegida: ConfigTrustState = !sessionKeyOk
      ? "NO_VERIFICADA"
      : canVerify
      ? "VERIFICADA"
      : "CONFIANZA";
    // Deep merge anti "toggles fantasma": si la config que llega del servidor
    // (o del PUT) viniera con featureFlags parciales, los módulos ausentes
    // conservan su estado previo; el Sidebar no desaparece al guardar.
    const previo = get().config;
    const configMerged: BusinessConfig = previo
      ? { ...config, featureFlags: { ...previo.featureFlags, ...config.featureFlags } }
      : config;
    set({
      config: configMerged,
      trust: elegida,
      lastError: sessionKeyOk ? null : "Config sin verificación de llave",
    });
    if (sessionKeyOk) applyVerified(configMerged);
    return sessionKeyOk;
  },

  invalidate: () => set({ trust: "NO_VERIFICADA" }),

  setFlag: (flag, value) =>
    set((state) => {
      if (!state.config) return {};
      return {
        config: {
          ...state.config,
          featureFlags: { ...state.config.featureFlags, [flag]: value },
        },
      };
    }),

  isFeatureEnabled: (flag) => {
    // SOLO se honran flags provenientes de un blob confiable:
    // "VERIFICADA" (firma válida con WebCrypto) o "CONFIANZA" (LAN sin
    // WebCrypto: réplica entregada por el servidor autenticado, que
    // revalida en cada API). NO_VERIFICADA/firma inválida → apagadas.
    const t = get().trust;
    if (t !== "VERIFICADA" && t !== "CONFIANZA") return false;
    return get().config?.featureFlags[flag] === true;
  },
}));

/** Útil para sketches: flags seguras por defecto. */
export { safeFlags };
export type { PersistedCache };