"use client";

import { useEffect } from "react";
import { Sidebar } from "./sidebar";
import { OfflineIndicator } from "./offline-indicator";
import AuthGuard from "@/components/auth-guard";
import { useConfigStore } from "@/store/config";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const hydrateConfig = useConfigStore((s) => s.hydrate);

  useEffect(() => {
    hydrateConfig();
  }, [hydrateConfig]);

  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-app">
          <OfflineIndicator />
          {children}
        </main>
      </div>
    </AuthGuard>
  );
}
