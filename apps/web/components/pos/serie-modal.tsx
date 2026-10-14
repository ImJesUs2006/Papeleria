"use client";

import { useEffect, useState } from "react";
import { Barcode, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";

// ============================================================
// Captura de número de serie (Paso 6). Al agregar un producto con
// `usaSeries`, la cajera escanea la serie de la pieza; se verifica que
// esté disponible antes de agregarla (el servidor lo vuelve a validar).
// ============================================================

export function SerieModal({
  producto,
  yaEnCarrito,
  onAgregar,
  onClose,
}: {
  producto: { codigoItem: string; descripcion: string } | null;
  yaEnCarrito: string[];
  onAgregar: (serie: string) => void;
  onClose: () => void;
}) {
  const [serie, setSerie] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verificando, setVerificando] = useState(false);

  useEffect(() => {
    setSerie("");
    setError(null);
  }, [producto]);

  const confirmar = async () => {
    const s = serie.trim().toUpperCase();
    if (!s || !producto) return;
    if (yaEnCarrito.includes(s)) {
      setError("Esa serie ya está en el carrito");
      return;
    }
    setVerificando(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/series?codigoItem=${encodeURIComponent(producto.codigoItem)}&estado=DISPONIBLE&q=${encodeURIComponent(s)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      const disponible = (data.series ?? []).some((x: { serie: string }) => x.serie === s);
      if (!disponible) {
        setError("Serie no disponible: no está registrada o ya se vendió");
        return;
      }
      onAgregar(s);
      setSerie("");
    } catch {
      setError("No se pudo verificar la serie");
    } finally {
      setVerificando(false);
    }
  };

  return (
    <Modal
      open={producto !== null}
      onClose={onClose}
      title="Número de serie"
      subtitle={producto?.descripcion}
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          confirmar();
        }}
      >
        <label className="flex items-center gap-2">
          <Barcode className="h-5 w-5 text-acento" />
          <input
            value={serie}
            onChange={(e) => setSerie(e.target.value)}
            placeholder="Escanea o escribe la serie"
            autoFocus
            autoComplete="off"
            className="input-dark"
          />
        </label>
        {error && <p className="text-sm text-rose-300">{error}</p>}
        <button
          type="submit"
          disabled={!serie.trim() || verificando}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-acento px-4 py-2.5 text-sm font-bold text-btn-ink disabled:opacity-50"
        >
          {verificando && <Loader2 className="h-4 w-4 animate-spin" />} Agregar pieza
        </button>
      </form>
    </Modal>
  );
}
