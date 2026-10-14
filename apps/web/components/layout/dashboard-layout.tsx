"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Sidebar } from "./sidebar";
import { OfflineIndicator } from "./offline-indicator";
import AuthGuard from "@/components/auth-guard";
import { useConfigStore } from "@/store/config";
import { NotificacionesHost } from "@/components/notificaciones";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const hydrateConfig = useConfigStore((s) => s.hydrate);
  const pathname = usePathname();

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
            {children}
          </motion.div>
        </main>
      </div>
      <NotificacionesHost />
    </AuthGuard>
  );
}
