"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { Loader2 } from "lucide-react";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hydrateFromServer = useAuthStore((s) => s.hydrateFromServer);
  const router = useRouter();
  // La sesión guardada en el navegador permite pintar de inmediato; la
  // respuesta del servidor decide. Solo se manda a /login cuando el servidor
  // ya contestó (antes un temporizador de 100 ms expulsaba al usuario si la
  // verificación tardaba un poco más).
  const [verificado, setVerificado] = useState(false);

  useEffect(() => {
    let vivo = true;
    hydrateFromServer().finally(() => {
      if (vivo) setVerificado(true);
    });
    return () => {
      vivo = false;
    };
  }, [hydrateFromServer]);

  useEffect(() => {
    if (verificado && !isAuthenticated) router.replace("/login");
  }, [verificado, isAuthenticated, router]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 text-neon-green animate-spin" />
          <p className="text-sm text-muted">Verificando sesión...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
