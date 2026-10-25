"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import type { DescuentoManual } from "@/lib/descuentos";
import { cn } from "@/lib/utils";

// ============================================================
// Piezas del cobro avanzado (Paso 3):
//   - DescuentoEditor: descuento por línea o al ticket (% o $).
//   - PagoDivididoModal: reparte el total entre varios métodos.
//   - AutorizacionModal: la administradora aprueba un descuento mayor
//     al tope de la cajera con su usuario y contraseña.
// ============================================================

export function DescuentoEditor({
  actual,
  onAplicar,
  onCerrar,
}: {
  actual: DescuentoManual | null | undefined;
  onAplicar: (d: DescuentoManual | null) => void;
  onCerrar: () => void;
}) {
  const [tipo, setTipo] = useState<DescuentoManual["tipo"]>(actual?.tipo ?? "PORCENTAJE");
  const [valor, setValor] = useState(actual ? String(actual.valor) : "");
  const n = Number(valor);
  const valido = valor !== "" && Number.isFinite(n) && n > 0 && (tipo === "MONTO" || n <= 100);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-surface-500 bg-surface-800 p-2">
      <div className="flex overflow-hidden rounded-md border border-surface-500 text-xs font-bold">
        {(["PORCENTAJE", "MONTO"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTipo(t)}
            className={cn(
              "px-2 py-1",
              tipo === t ? "bg-acento text-btn-ink" : "text-muted hover:bg-surface-600"
            )}
          >
            {t === "PORCENTAJE" ? "%" : "$"}
          </button>
        ))}
      </div>
      <input
        type="number"
        min={0}
        step="0.01"
        autoFocus
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && valido) onAplicar({ tipo, valor: n });
          if (e.key === "Escape") onCerrar();
        }}
        placeholder={tipo === "PORCENTAJE" ? "10" : "20.00"}
        className="w-20 rounded-md border border-surface-500 bg-surface-700 px-2 py-1 text-sm text-gray-100 outline-none focus:border-acento"
      />
      <button
        type="button"
        disabled={!valido}
        onClick={() => onAplicar({ tipo, valor: n })}
        className="rounded-md bg-acento px-2 py-1 text-xs font-bold text-btn-ink disabled:opacity-40"
      >
        Aplicar
      </button>
      {actual && (
        <button
          type="button"
          onClick={() => onAplicar(null)}
          className="rounded-md px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/10"
        >
          Quitar
        </button>
      )}
      <button type="button" onClick={onCerrar} className="ml-auto text-xs text-muted hover:text-gray-100">
        Cerrar
      </button>
    </div>
  );
}

export interface MetodoDisponible {
  metodo: string;
  label: string;
}

interface Parte {
  metodo: string;
  monto: string;
  referencia: string;
}

const centavos = (n: number) => Math.round(n * 100);

export function PagoDivididoModal({
  open,
  total,
  metodos,
  onClose,
  onConfirmar,
  cobrando,
}: {
  open: boolean;
  total: number;
  metodos: MetodoDisponible[];
  onClose: () => void;
  onConfirmar: (
    pagos: Array<{ metodo: string; monto: number; referencia: string | null }>,
    montoRecibido: number | null
  ) => void;
  cobrando: boolean;
}) {
  const [partes, setPartes] = useState<Parte[]>([]);
  const [recibido, setRecibido] = useState("");

  useEffect(() => {
    if (!open) return;
    const [a, b] = metodos;
    setPartes(
      [a, b]
        .filter(Boolean)
        .map((m, i) => ({ metodo: m.metodo, monto: i === 0 ? total.toFixed(2) : "", referencia: "" }))
    );
    setRecibido("");
  }, [open, total, metodos]);

  const suma = useMemo(
    () => partes.reduce((a, p) => a + centavos(Number(p.monto) || 0), 0),
    [partes]
  );
  const restante = (centavos(total) - suma) / 100;
  const efectivo = Number(partes.find((p) => p.metodo === "EFECTIVO")?.monto) || 0;
  const recibidoN = Number(recibido) || 0;
  const usados = new Set(partes.map((p) => p.metodo));
  const faltaRef = partes.some(
    (p) => (p.metodo === "DIGITAL" || p.metodo === "TRANSFERENCIA") && !/^\d{4}$/.test(p.referencia)
  );
  const valido =
    partes.length >= 2 &&
    restante === 0 &&
    partes.every((p) => Number(p.monto) > 0) &&
    !faltaRef &&
    (efectivo === 0 || (recibido !== "" && recibidoN >= efectivo));

  const actualizar = (i: number, cambio: Partial<Parte>) =>
    setPartes((ps) => ps.map((p, k) => (k === i ? { ...p, ...cambio } : p)));

  return (
    <Modal open={open} onClose={() => !cobrando && onClose()} title="Dividir pago" subtitle={`Total a cubrir: $${total.toFixed(2)}`}>
      <div className="space-y-3">
        {partes.map((p, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select
              value={p.metodo}
              onChange={(e) => actualizar(i, { metodo: e.target.value })}
              className="input-dark w-36"
            >
              {metodos
                .filter((m) => m.metodo === p.metodo || !usados.has(m.metodo))
                .map((m) => (
                  <option key={m.metodo} value={m.metodo}>
                    {m.label}
                  </option>
                ))}
            </select>
            <input
              type="number"
              min={0}
              step="0.01"
              value={p.monto}
              onChange={(e) => actualizar(i, { monto: e.target.value })}
              placeholder="0.00"
              className="input-dark w-28"
            />
            {(p.metodo === "DIGITAL" || p.metodo === "TRANSFERENCIA") && (
              <input
                value={p.referencia}
                onChange={(e) => actualizar(i, { referencia: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                inputMode="numeric"
                placeholder="Ref. 4 dígitos"
                className="input-dark w-32"
              />
            )}
            {restante > 0 && (
              <button
                type="button"
                onClick={() => actualizar(i, { monto: ((Number(p.monto) || 0) + restante).toFixed(2) })}
                className="text-xs text-acento hover:underline"
              >
                + restante
              </button>
            )}
            {partes.length > 2 && (
              <button
                type="button"
                onClick={() => setPartes((ps) => ps.filter((_, k) => k !== i))}
                className="rounded-md p-1.5 text-rose-300 hover:bg-rose-500/10"
                aria-label="Quitar pago"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}

        {partes.length < metodos.length && (
          <button
            type="button"
            onClick={() => {
              const libre = metodos.find((m) => !usados.has(m.metodo));
              if (libre) setPartes((ps) => [...ps, { metodo: libre.metodo, monto: "", referencia: "" }]);
            }}
            className="inline-flex items-center gap-1 text-xs font-bold text-acento hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> Agregar método
          </button>
        )}

        <p className={cn("text-sm font-bold", restante === 0 ? "text-emerald-400" : "text-amber-300")}>
          {restante === 0
            ? "Pagos completos"
            : restante > 0
              ? `Falta cubrir $${restante.toFixed(2)}`
              : `Excede el total por $${Math.abs(restante).toFixed(2)}`}
        </p>

        {efectivo > 0 && (
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Efectivo que entregó el cliente</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={recibido}
              onChange={(e) => setRecibido(e.target.value)}
              placeholder={efectivo.toFixed(2)}
              className="input-dark"
            />
            {recibido !== "" && recibidoN >= efectivo && (
              <span className="mt-1 block text-sm font-bold text-emerald-400">
                Cambio: ${(recibidoN - efectivo).toFixed(2)}
              </span>
            )}
            {recibido !== "" && recibidoN < efectivo && (
              <span className="mt-1 block text-sm font-bold text-rose-300">
                Faltan ${(efectivo - recibidoN).toFixed(2)} de efectivo
              </span>
            )}
          </label>
        )}

        <button
          type="button"
          disabled={!valido || cobrando}
          onClick={() =>
            onConfirmar(
              partes.map((p) => ({
                metodo: p.metodo,
                monto: Math.round(Number(p.monto) * 100) / 100,
                referencia: p.referencia || null,
              })),
              recibido !== "" ? recibidoN : null
            )
          }
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-acento px-4 py-2.5 text-sm font-bold text-btn-ink disabled:opacity-40"
        >
          {cobrando && <Loader2 className="h-4 w-4 animate-spin" />} Cobrar ${total.toFixed(2)}
        </button>
      </div>
    </Modal>
  );
}

export function AutorizacionModal({
  open,
  mensaje,
  error,
  enviando,
  onClose,
  onAutorizar,
}: {
  open: boolean;
  mensaje: string;
  error: string | null;
  enviando: boolean;
  onClose: () => void;
  onAutorizar: (cred: { username: string; password: string }) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (open) {
      setUsername("");
      setPassword("");
    }
  }, [open]);

  return (
    <Modal open={open} onClose={() => !enviando && onClose()} title="Autorización requerida" subtitle={mensaje}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (username && password) onAutorizar({ username, password });
        }}
      >
        <p className="flex items-center gap-2 text-xs text-muted">
          <ShieldCheck className="h-4 w-4 text-acento" />
          Una administradora debe aprobar con su usuario y contraseña.
        </p>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Usuario de la administradora"
          autoComplete="off"
          autoFocus
          className="input-dark"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña"
          autoComplete="off"
          className="input-dark"
        />
        {error && <p className="text-sm text-rose-300">{error}</p>}
        <button
          type="submit"
          disabled={!username || !password || enviando}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-acento px-4 py-2.5 text-sm font-bold text-btn-ink disabled:opacity-40"
        >
          {enviando && <Loader2 className="h-4 w-4 animate-spin" />} Autorizar y cobrar
        </button>
      </form>
    </Modal>
  );
}
