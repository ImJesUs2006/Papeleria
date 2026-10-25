"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Loader2, PowerOff } from "lucide-react";
import { motion } from "framer-motion";
import { flagDeRuta, Sidebar } from "./sidebar";
import { OfflineIndicator } from "./offline-indicator";
import AuthGuard from "@/components/auth-guard";
import { useConfigStore } from "@/store/config";
import { useAuthStore } from "@/store/auth";
import { MODULOS_INFO, type FeatureFlags } from "@/lib/business-types";
import { NotificacionesHost } from "@/components/notificaciones";
import { DialogoHost } from "@/components/dialogo-host";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const hydrateConfig = useConfigStore((s) => s.hydrate);
  const pathname = usePathname();
  const { trust, isFeatureEnabled } = useConfigStore();
  // Solo con una configuración confiable se bloquea (sin ella todos los flags
  // leen "apagado" y se bloquearía todo); el servidor revalida de todos modos.
  const flag = flagDeRuta(pathname ?? "");
  const apagado = !!flag && (trust === "VERIFICADA" || trust === "CONFIANZA") && !isFeatureEnabled(flag);
  // Mientras llega la configuración, la pantalla de un módulo apagable espera
  // (si no, pediría sus datos y recibiría 403 antes de saber si está apagado).
  const esperando = !!flag && trust === "PENDIENTE";

  useEffect(() => {
    hydrateConfig();
  }, [hydrateConfig]);

  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-app">
          <OfflineIndicator />
          {/* Solo entrada (sin esperar la salida de la página anterior): el
              módulo nuevo aparece en cuanto está listo. */}
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            {esperando ? (
              <div className="flex min-h-[60vh] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted" />
              </div>
            ) : apagado ? (
              <ModuloApagado flag={flag!} />
            ) : (
              children
            )}
          </motion.div>
        </main>
      </div>
      <NotificacionesHost />
      <DialogoHost />
    </AuthGuard>
  );
}

function ModuloApagado({ flag }: { flag: keyof FeatureFlags }) {
  const esAdmin = useAuthStore((s) => s.rol) === "ADMINISTRADORA";
  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="max-w-md rounded-3xl border border-surface-600 bg-surface-800 p-8 text-center" data-testid="modulo-apagado">
        <PowerOff className="mx-auto h-8 w-8 text-muted" />
        <h2 className="mt-3 text-lg font-black text-gray-100">{MODULOS_INFO[flag].label} está apagado</h2>
        <p className="mt-1 text-sm text-muted">
          {esAdmin
            ? "Este módulo no está activo para tu negocio. Puedes encenderlo en Configuración → Módulos."
            : "Este módulo no está activo para tu negocio. Pídele a la administradora que lo encienda si lo necesitas."}
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Link href="/cobro" className="rounded-xl border border-surface-500 px-4 py-2 text-sm text-gray-200 hover:bg-surface-700">
            Ir a Cobro
          </Link>
          {esAdmin && (
            <Link href="/configuracion" className="btn-primary px-4 py-2 text-sm">
              Ir a Configuración
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
