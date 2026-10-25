"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, HelpCircle } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useDialogo } from "@/store/dialogo";
import { cn } from "@/lib/utils";

/** Muestra el diálogo pendiente de `confirmar()` / `pedirTexto()`. Montar una vez por layout. */
export function DialogoHost() {
  const actual = useDialogo((s) => s.actual);
  const cerrar = useDialogo((s) => s.cerrar);
  const [valor, setValor] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValor(actual?.tipo === "texto" ? actual.opciones.valorInicial ?? "" : "");
    setError(null);
  }, [actual]);

  const o = actual?.opciones;
  const aceptar = () => {
    if (!actual) return;
    if (actual.tipo === "confirmar") return cerrar(true);
    const v = valor.trim();
    const e = actual.opciones.validar?.(v) ?? (v ? null : "Este dato es obligatorio");
    if (e) return setError(e);
    cerrar(v);
  };

  return (
    <Modal open={!!actual} onClose={() => cerrar(null)} className="max-w-sm">
      {o && (
        <form
          data-testid="dialogo"
          onSubmit={(e) => {
            e.preventDefault();
            aceptar();
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                o.peligro ? "bg-rose-500/15 text-rose-300" : "bg-surface-700 text-neon-blue"
              )}
            >
              {o.peligro ? <AlertTriangle className="h-5 w-5" /> : <HelpCircle className="h-5 w-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-black text-gray-100">{o.titulo}</h3>
              {o.mensaje && <p className="mt-1 whitespace-pre-line text-sm text-muted">{o.mensaje}</p>}
            </div>
          </div>

          {actual?.tipo === "texto" && (
            <label className="mt-4 block">
              {actual.opciones.etiqueta && (
                <span className="mb-1 block text-xs text-muted">{actual.opciones.etiqueta}</span>
              )}
              <input
                autoFocus
                type={actual.opciones.tipo ?? "text"}
                value={valor}
                placeholder={actual.opciones.placeholder}
                onChange={(e) => {
                  setValor(e.target.value);
                  setError(null);
                }}
                data-testid="dialogo-texto"
                className="w-full rounded-xl border border-surface-500 bg-surface-700 px-3 py-2.5 text-sm text-gray-100 outline-none focus:border-neon-blue"
              />
              {error && <span className="mt-1 block text-xs text-rose-300">{error}</span>}
            </label>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => cerrar(null)}
              data-testid="dialogo-cancelar"
              className="rounded-xl bg-surface-700 px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-surface-600"
            >
              {o.cancelar ?? "Cancelar"}
            </button>
            <button
              type="submit"
              autoFocus={actual?.tipo === "confirmar"}
              data-testid="dialogo-aceptar"
              className={cn(
                "rounded-xl px-4 py-2 text-sm font-bold",
                o.peligro ? "bg-neon-red text-white hover:opacity-90" : "bg-neon-cyan text-btn-ink hover:opacity-90"
              )}
            >
              {o.aceptar ?? "Aceptar"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
