"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";

// ============================================================
// Recepción de pedido (Paso 7): cuánto llegó de cada renglón, a qué costo
// real y, si el producto controla lotes, con qué lote y caducidad. Lo que
// no llegue queda pendiente (pedido PARCIAL).
// ============================================================

export interface RenglonPedido {
  idItemPedido: string;
  descripcion: string;
  cantidad: number;
  cantidadRecibida?: number;
  precioCotizado: number;
  usaLotes?: boolean;
  usaSeries?: boolean;
}

interface Captura {
  cantidad: string;
  costo: string;
  lote: string;
  caducidad: string;
}

export function RecepcionModal({
  pedido,
  onClose,
  onRecibido,
}: {
  pedido: { idPedido: string; proveedor: string; items: RenglonPedido[] } | null;
  onClose: () => void;
  onRecibido: (estado: string) => void;
}) {
  const [captura, setCaptura] = useState<Record<string, Captura>>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!pedido) return;
    setError(null);
    setCaptura(
      Object.fromEntries(
        pedido.items.map((i) => [
          i.idItemPedido,
          {
            cantidad: String(Math.max(i.cantidad - (i.cantidadRecibida ?? 0), 0)),
            costo: String(i.precioCotizado),
            lote: "",
            caducidad: "",
          },
        ])
      )
    );
  }, [pedido]);

  const recibir = async () => {
    if (!pedido) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/pedidos/${pedido.idPedido}/recibir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          renglones: pedido.items
            .filter((i) => !i.usaSeries)
            .map((i) => ({
              idItemPedido: i.idItemPedido,
              cantidad: Number(captura[i.idItemPedido]?.cantidad || 0),
              costoUnitario: Number(captura[i.idItemPedido]?.costo),
              numeroLote: captura[i.idItemPedido]?.lote || null,
              caducidad: captura[i.idItemPedido]?.caducidad || null,
            })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo registrar la recepción");
      onRecibido(data.estado);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const set = (id: string, cambio: Partial<Captura>) =>
    setCaptura((c) => ({ ...c, [id]: { ...c[id], ...cambio } }));

  return (
    <Modal
      open={pedido !== null}
      onClose={() => !enviando && onClose()}
      title="Recibir mercancía"
      subtitle={pedido ? `${pedido.proveedor} · lo que no llegue queda pendiente` : undefined}
      className="max-w-3xl"
    >
      {pedido && (
        <div className="space-y-3">
          {pedido.items.map((i) => {
            const pendiente = Math.max(i.cantidad - (i.cantidadRecibida ?? 0), 0);
            const c = captura[i.idItemPedido];
            if (!c) return null;
            return (
              <div key={i.idItemPedido} className="rounded-xl border border-surface-600 p-3">
                <p className="text-sm font-bold text-gray-100">{i.descripcion}</p>
                <p className="text-xs text-muted">
                  Pedido {i.cantidad} · recibido {i.cantidadRecibida ?? 0} · pendiente {pendiente}
                </p>
                {i.usaSeries ? (
                  <p className="mt-1 text-xs text-amber-300">
                    Lleva número de serie: recíbelo registrando sus series en Lotes y series.
                  </p>
                ) : pendiente === 0 ? (
                  <p className="mt-1 text-xs text-emerald-300">Completo</p>
                ) : (
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <label className="block">
                      <span className="mb-1 block text-[11px] text-muted">Llegó</span>
                      <input
                        type="number"
                        min={0}
                        max={pendiente}
                        value={c.cantidad}
                        onChange={(e) => set(i.idItemPedido, { cantidad: e.target.value })}
                        className="input-dark"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] text-muted">Costo unitario</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={c.costo}
                        onChange={(e) => set(i.idItemPedido, { costo: e.target.value })}
                        className="input-dark"
                      />
                    </label>
                    {i.usaLotes && (
                      <>
                        <label className="block">
                          <span className="mb-1 block text-[11px] text-muted">Lote</span>
                          <input
                            value={c.lote}
                            onChange={(e) => set(i.idItemPedido, { lote: e.target.value })}
                            className="input-dark"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-[11px] text-muted">Caducidad</span>
                          <input
                            type="date"
                            value={c.caducidad}
                            onChange={(e) => set(i.idItemPedido, { caducidad: e.target.value })}
                            className="input-dark"
                          />
                        </label>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <button
            type="button"
            disabled={enviando}
            onClick={recibir}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-acento px-4 py-2.5 text-sm font-bold text-btn-ink disabled:opacity-50"
          >
            {enviando && <Loader2 className="h-4 w-4 animate-spin" />} Registrar recepción
          </button>
        </div>
      )}
    </Modal>
  );
}
