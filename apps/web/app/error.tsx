"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app/error]", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-app p-6">
      <div className="bg-surface-800 border border-neon-red/40 rounded-2xl p-6 max-w-md w-full text-center">
        <h2 className="text-xl font-black text-gray-100 mb-1">Algo salió mal</h2>
        <p className="text-sm text-muted mb-4 break-words">
          {error.message || "Error inesperado"}
          {error.digest ? ` · ${error.digest}` : ""}
        </p>
        <button
          onClick={reset}
          className="w-full py-3 rounded-xl bg-neon-green text-btn-ink font-bold shadow-neon"
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}
