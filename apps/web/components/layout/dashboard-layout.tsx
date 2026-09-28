"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar } from "./sidebar";
import { OfflineIndicator } from "./offline-indicator";
import AuthGuard from "@/components/auth-guard";
import { useConfigStore } from "@/store/config";

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
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </AuthGuard>
  );
}
