"use client";

import { useEffect } from "react";

// Registra el service worker (Paso 8) solo en producción y en contexto
// seguro (https o localhost); en una red local por http el navegador no
// lo permite y la app sigue funcionando en línea como siempre.
export function RegistroServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (!window.isSecureContext) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* sin service worker: la app funciona en línea */
    });
  }, []);
  return null;
}
