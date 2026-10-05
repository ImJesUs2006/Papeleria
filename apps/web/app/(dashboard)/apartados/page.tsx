"use client";

import { useCallback, useEffect, useState } from "react";
import { Banknote, CreditCard, Landmark, Loader2, PackageOpen, XCircle } from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ErrorBoundary } from "@/components/error-boundary";
import { Modal } from "@/components/ui/modal";
import { useAuthStore } from "@/store/auth";
import { useConfigStore } from "@/store/config";
import { cn } from "@/lib/utils";

interface Apartado {
  idApartado: string;
  folio: string;
  cliente: string;
  telefono: string | null;
  fechaCreado: string;
  anticipo: number;
  total: number;
  saldoPendiente: number;
  notas: string | null;
  lineas: Array<{ descripcion: string; cantidad: number; subtotalLinea: number }>;
}

const METODOS = [
  { id: "EFECTIVO", requerido: "EFECTIVO", label: "Efectivo", icon: Banknote },
  { id: "TARJETA", requerido: "TARJETA_TERMINAL", label: "Tarjeta", icon: CreditCard },
  { id: "TRANSFERENCIA", requerido: "TRANSFERENCIA", label: "Transferencia", icon: Landmark },
] as const;

const dinero = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

export default function ApartadosPage() {
  const esAdmin = useAuthStore((s) => s.rol === "ADMINISTRADORA");
  const metodosHabilitados = useConfigStore((s) => s.config?.metodosPago);

  const [apartados, setApartados] = useState<Apartado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [liquidando, setLiquidando] = useState<Apartado | null>(null);
  const [metodoPago, setMetodoPago] = useState<string>("EFECTIVO");
  const [referencia, setReferencia] = useState("");
  const [cancelando, setCancelando] = useState<Apartado | null>(null);
  const [reembolsar, setReembolsar] = useState(true);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorModal, setErrorModal] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch("/api/apartados", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudieron cargar los apartados");
      setApartados(data.apartados ?? []);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const enviar = async (id: string, body: Record<string, unknown>, exito: (d: any) => string) => {
    setEnviando(true);
    setErrorModal(null);
    try {
      const res = await fetch(`/api/apartados/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo actualizar el apartado");
      setAviso(exito(data));
      setLiquidando(null);
      setCancelando(null);
      setReferencia("");
      setMotivo("");
      await cargar();
    } catch (e: any) {
      setErrorModal(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const metodos = METODOS.filter(
    (m) => !metodosHabilitados || (metodosHabilitados as string[]).includes(m.requerido)
  );
  const pideReferencia = metodoPago === "TRANSFERENCIA";

  return (
    <DashboardLayout>
      <ErrorBoundary>
        <div className="p-6 space-y-4">
          <div>
            <h2 className="text-2xl font-black text-gray-100">Apartados</h2>
            <p className="text-sm text-muted">
              Mercancía reservada con anticipo. Liquida para cobrar el saldo y entregar, o cancela
              para liberar el inventario.
            </p>
          </div>

          {aviso && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              {aviso}
            </div>
          )}
          {error && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          )}

          {cargando ? (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando apartados...
            </p>
          ) : apartados.length === 0 ? (
            <div className="rounded-xl border border-dashed border-surface-600 bg-surface-800 px-4 py-10 text-center text-sm text-muted">
              <PackageOpen className="mx-auto mb-2 h-8 w-8 opacity-60" />
              No hay apartados pendientes. Se crean desde el carrito en Cobro.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {apartados.map((a) => (
                <div
                  key={a.idApartado}
                  className="rounded-xl border border-surface-600 bg-surface-800 p-4 shadow-card"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-gray-100">{a.cliente}</p>
                      <p className="text-xs text-muted">
                        {a.folio} · {new Date(a.fechaCreado).toLocaleDateString("es-MX")}
                        {a.telefono ? ` · ${a.telefono}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs text-muted">Saldo pendiente</p>
                      <p className="text-lg font-black text-acento">{dinero(a.saldoPendiente)}</p>
                    </div>
                  </div>

                  <ul className="mt-3 space-y-1 border-t border-surface-600 pt-3 text-xs text-slate-300">
                    {a.lineas.map((l, i) => (
                      <li key={i} className="flex justify-between gap-2">
                        <span className="truncate">
                          {l.cantidad} × {l.descripcion}
                        </span>
                        <span className="shrink-0">{dinero(l.subtotalLinea)}</span>
                      </li>
                    ))}
                  </ul>

                  <p className="mt-2 text-xs text-muted">
                    Total {dinero(a.total)} · Anticipo {dinero(a.anticipo)}
                    {a.notas ? ` · ${a.notas}` : ""}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        setErrorModal(null);
                        setMetodoPago(metodos[0]?.id ?? "EFECTIVO");
                        setLiquidando(a);
                      }}
                      className="inline-flex items-center gap-2 rounded-xl bg-acento px-4 py-2 text-sm font-bold text-btn-ink shadow-card hover:opacity-90"
                    >
                      <Banknote className="h-4 w-4" /> Liquidar
                    </button>
                    {esAdmin && (
                      <button
                        onClick={() => {
                          setErrorModal(null);
                          setReembolsar(a.anticipo > 0);
                          setCancelando(a);
                        }}
                        className="inline-flex items-center gap-2 rounded-xl border border-rose-500/40 px-4 py-2 text-sm font-bold text-rose-300 hover:bg-rose-500/20"
                      >
                        <XCircle className="h-4 w-4" /> Cancelar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <Modal
          open={liquidando !== null}
          onClose={() => !enviando && setLiquidando(null)}
          title="Liquidar apartado"
          subtitle={liquidando ? `${liquidando.folio} · ${liquidando.cliente}` : undefined}
        >
          {liquidando && (
            <div className="space-y-4">
              <p className="text-sm text-slate-300">
                Saldo a cobrar:{" "}
                <span className="font-black text-acento">{dinero(liquidando.saldoPendiente)}</span>
              </p>
              <div className="grid grid-cols-3 gap-2">
                {metodos.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMetodoPago(m.id)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-xs font-bold",
                      metodoPago === m.id
                        ? "border-acento bg-acento/10 text-acento"
                        : "border-surface-500 text-slate-300 hover:bg-surface-600"
                    )}
                  >
                    <m.icon className="h-4 w-4" />
                    {m.label}
                  </button>
                ))}
              </div>
              {pideReferencia && (
                <input
                  value={referencia}
                  onChange={(e) => setReferencia(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  inputMode="numeric"
                  placeholder="Últimos 4 dígitos de la referencia"
                  className="w-full rounded-xl border border-surface-500 bg-surface-700 px-4 py-2.5 text-sm text-gray-100 outline-none focus:border-acento"
                />
              )}
              {errorModal && <p className="text-sm text-rose-300">{errorModal}</p>}
              <button
                disabled={enviando || (pideReferencia && referencia.length !== 4)}
                onClick={() =>
                  enviar(
                    liquidando.idApartado,
                    {
                      accion: "liquidar",
                      metodoPago,
                      referenciaTransferencia: pideReferencia ? referencia : null,
                    },
                    (d) => `Apartado ${d.folio} liquidado. Venta ${d.folioVenta}.`
                  )
                }
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-acento px-4 py-2.5 text-sm font-bold text-btn-ink hover:opacity-90 disabled:opacity-50"
              >
                {enviando && <Loader2 className="h-4 w-4 animate-spin" />} Cobrar y entregar
              </button>
            </div>
          )}
        </Modal>

        <Modal
          open={cancelando !== null}
          onClose={() => !enviando && setCancelando(null)}
          title="Cancelar apartado"
          subtitle={cancelando ? `${cancelando.folio} · ${cancelando.cliente}` : undefined}
        >
          {cancelando && (
            <div className="space-y-4">
              <p className="text-sm text-slate-300">
                La mercancía regresa al inventario. Esta acción no se puede deshacer.
              </p>
              {cancelando.anticipo > 0 && (
                <label className="flex items-start gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={reembolsar}
                    onChange={(e) => setReembolsar(e.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    Devolver el anticipo de {dinero(cancelando.anticipo)} en efectivo (requiere caja
                    abierta). Si lo desmarcas, el negocio lo retiene.
                  </span>
                </label>
              )}
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Motivo (opcional)"
                className="w-full rounded-xl border border-surface-500 bg-surface-700 px-4 py-2.5 text-sm text-gray-100 outline-none focus:border-acento"
              />
              {errorModal && <p className="text-sm text-rose-300">{errorModal}</p>}
              <button
                disabled={enviando}
                onClick={() =>
                  enviar(
                    cancelando.idApartado,
                    { accion: "cancelar", reembolsarAnticipo: reembolsar, motivo },
                    (d) =>
                      `Apartado ${d.folio} cancelado.${
                        d.anticipoReembolsado > 0
                          ? ` Entrega ${dinero(d.anticipoReembolsado)} al cliente.`
                          : ""
                      }`
                  )
                }
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-sm font-bold text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
              >
                {enviando && <Loader2 className="h-4 w-4 animate-spin" />} Cancelar apartado
              </button>
            </div>
          )}
        </Modal>
      </ErrorBoundary>
    </DashboardLayout>
  );
}
