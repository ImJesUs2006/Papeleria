"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body style={{ margin: 0, background: "#0a0a0f", color: "#e5e7eb", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#16161d", border: "1px solid #7f1d1d", borderRadius: 16, padding: 24, maxWidth: 420, width: "100%", textAlign: "center" }}>
            <h2 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 4px" }}>Algo salió mal</h2>
            <p style={{ fontSize: 13, color: "#9ca3af", margin: "0 0 16px", wordBreak: "break-word" }}>
              {error.message || "Error inesperado"}
            </p>
            <button
              onClick={reset}
              style={{ width: "100%", padding: "12px", borderRadius: 12, background: "#22c55e", color: "#0a0a0f", fontWeight: 700, border: 0, cursor: "pointer" }}
            >
              Reintentar
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
