"use client";

import { Loader2, ShieldCheck, ShieldAlert, WifiOff, Info } from "lucide-react";
import { useConfigStore } from "@/store/config";
import { cn } from "@/lib/utils";

// ============================================================
// Indicador del modo de verificación de la configuración.
//   VERIFICADA   → la firma criptográfica se validó (https/localhost).
//   CONFIANZA    → LAN por http sin WebCrypto; se confía en la réplica
//                  autenticada del servidor (autoridad final en cada API).
//   NO_VERIFICADA→ blob sin llave/firma inválida (módulos apagados).
//   PENDIENTE    → aun hidratando.
//   ERROR        → sin conexión y sin caché local.
// ============================================================

export function TrustBadge() {
  const trust = useConfigStore((s) => s.trust);
  const lastError = useConfigStore((s) => s.lastError);

  const estado: Record<string, { etiqueta: string; hint: string; cls: string; icon: React.ReactNode }> = {
    VERIFICADA: {
      etiqueta: "Firma verificada",
      hint: "La configuración fue firmada por el servidor y verificada localmente con WebCrypto (https/localhost).",
      cls: "bg-acento/10 border-acento/40 text-acento",
      icon: <ShieldCheck className="h-3.5 w-3.5" />,
    },
    CONFIANZA: {
      etiqueta: "Modo confianza LAN",
      hint: "Acceso por http (sin WebCrypto): no hay firma local, pero la configuración proviene del servidor autenticado, que revalida los permisos en cada API.",
      cls: "bg-warning/10 border-warning/40 text-warning",
      icon: <Info className="h-3.5 w-3.5" />,
    },
    NO_VERIFICADA: {
      etiqueta: "Configuración no verificada",
      hint: lastError ?? "La firma de configuración no pudo validarse. Los módulos opcionales quedan desactivados.",
      cls: "bg-neon-red/10 border-neon-red/40 text-neon-red",
      icon: <ShieldAlert className="h-3.5 w-3.5" />,
    },
    PENDIENTE: {
      etiqueta: "Verificando…",
      hint: "El navegador está solicitando la configuración firmada.",
      cls: "bg-surface-700 border-surface-500 text-muted",
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    },
    ERROR: {
      etiqueta: "Sin conexión ni caché",
      hint: lastError ?? "No se pudo cargar la configuración local.",
      cls: "bg-neon-red/10 border-neon-red/40 text-neon-red",
      icon: <WifiOff className="h-3.5 w-3.5" />,
    },
  };

  const e = estado[trust] ?? estado.PENDIENTE;

  return (
    <div
      title={e.hint}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-help",
        e.cls
      )}
    >
      {e.icon}
      {e.etiqueta}
    </div>
  );
}