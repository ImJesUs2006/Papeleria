"use client";

import { useCallback, useEffect, useState } from "react";
import { contarVentasPendientes } from "@/lib/offline/idb";
import { sincronizarConReintentos } from "@/lib/offline/sync";

// ============================================================
// Estado de conexión + cola offline.
// Al recuperar la red reintenta el vaciado de la cola con backoff.
// ============================================================

export function useOffline() {
  const [online, setOnline] = useState(true);
  const [pendientes, setPendientes] = useState(0);
  const [sincronizando, setSincronizando] = useState(false);
  const [ultimoResultado, setUltimoResultado] = useState<string | null>(null);

  const refrescarPendientes = useCallback(async () => {
    try {
      setPendientes(await contarVentasPendientes());
    } catch {
      /* IndexedDB no disponible */
    }
  }, []);

  const sincronizar = useCallback(async () => {
    setSincronizando(true);
    try {
      const r = await sincronizarConReintentos();
      setPendientes(r.pendientes);
      if (r.sincronizadas > 0 || r.rechazadas > 0) {
        setUltimoResultado(
          `${r.sincronizadas} sincronizadas${r.rechazadas ? `, ${r.rechazadas} rechazadas` : ""}`
        );
        setTimeout(() => setUltimoResultado(null), 4000);
      }
      return r;
    } finally {
      setSincronizando(false);
    }
  }, []);

  useEffect(() => {
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    refrescarPendientes();

    const alVolverOnline = () => {
      setOnline(true);
      sincronizar();
    };
    const alPerderConexion = () => setOnline(false);

    window.addEventListener("online", alVolverOnline);
    window.addEventListener("offline", alPerderConexion);

    // Reintento periódico si hay pendientes.
    const intervalo = window.setInterval(() => {
      if (navigator.onLine) {
        refrescarPendientes();
        sincronizar();
      }
    }, 60_000);

    return () => {
      window.removeEventListener("online", alVolverOnline);
      window.removeEventListener("offline", alPerderConexion);
      window.clearInterval(intervalo);
    };
  }, [refrescarPendientes, sincronizar]);

  return { online, pendientes, sincronizando, ultimoResultado, sincronizar, refrescarPendientes };
}