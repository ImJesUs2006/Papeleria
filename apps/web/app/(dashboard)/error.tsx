"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard/error]", error);
  }, [error]);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="bg-surface-800 border border-neon-red/40 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-xl bg-neon-red/10 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-neon-red" />
          </div>
          <div>
            <h2 className="font-black text-gray-100">Ocurrió un error en este módulo</h2>
            <p className="text-xs text-muted">
              El resto de la aplicación sigue disponible. Puedes reintentar la sección.
            </p>
          </div>
        </div>
        <p className="text-xs text-muted break-words bg-surface-900/60 rounded-lg px-3 py-2 mb-4">
          {error.message || "Error inesperado"}
          {error.digest ? ` · ${error.digest}` : ""}
        </p>
        <div className="flex gap-2">
          <button
            onClick={reset}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-neon-green text-surface-900 font-bold text-sm shadow-neon"
          >
            <RotateCcw className="h-4 w-4" /> Reintentar
          </button>
          <a
            href="/dashboard"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-700 hover:bg-surface-600 text-sm font-medium text-gray-100 transition-colors"
          >
            Ir al dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
