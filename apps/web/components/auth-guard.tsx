"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { Loader2 } from "lucide-react";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, hydrateFromServer } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    hydrateFromServer();
  }, [hydrateFromServer]);

  useEffect(() => {
    // Give a brief moment for hydration
    const timer = setTimeout(() => {
      const state = useAuthStore.getState();
      if (!state.isAuthenticated) {
        router.replace("/login");
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [isAuthenticated, router]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-900">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 text-neon-green animate-spin" />
          <p className="text-sm text-muted">Verificando sesión...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
