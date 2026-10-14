"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Loader2, Plus, Trash2, Truck } from "lucide-react";
import { notificar } from "@/store/notificaciones";
import { ErrorBoundary } from "@/components/error-boundary";
import { useAuthStore } from "@/store/auth";

interface Sucursal {
  idSucursal: string;
  nombre: string;
  activa: boolean;
}

interface Traspaso {
  idTraspaso: string;
  folio: string;
  origen: string;
  destino: string;
  fecha: string;
  notas: string | null;
  lineas: Array<{ codigoItem: string; descripcion: string; cantidad: number }>;
}

interface Linea {
  codigoItem: string;
  cantidad: string;
}

export default function TraspasosPage() {
  const esAdmin = useAuthStore((s) => s.rol === "ADMINISTRADORA");
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [activa, setActiva] = useState<string>("");
  const [traspasos, setTraspasos] = useState<Traspaso[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([{ codigoItem: "", cantidad: "1" }]);
  const [notas, setNotas] = useState("");
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [rs, rt] = await Promise.all([
        fetch("/api/sucursales", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/traspasos", { cache: "no-store" }).then((r) => r.json()),
      ]);
      const activas = (rs.sucursales ?? []).filter((s: Sucursal) => s.activa);
      setSucursales(activas);
      setActiva(rs.activa ?? "");
      setOrigen((o) => o || rs.activa || "");
      setTraspasos(rt.traspasos ?? []);
      setError(rt.error ?? null);
    } catch {
      setError("No se pudo cargar la información");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const enviar = async () => {
    setEnviando(true);
    try {
      const res = await fetch("/api/traspasos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idOrigen: origen,
          idDestino: destino,
          notas,
          items: lineas
            .filter((l) => l.codigoItem.trim())
            .map((l) => ({ codigoItem: l.codigoItem.trim().toUpperCase(), cantidad: Number(l.cantidad) })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo registrar el traspaso");
      notificar.exito(`Traspaso ${data.folio} registrado`);
      setLineas([{ codigoItem: "", cantidad: "1" }]);
      setNotas("");
      cargar();
    } catch (e: any) {
      notificar.error("No se registró el traspaso", e.message);
    } finally {
      setEnviando(false);
    }
  };

  const listo =
    origen &&
    destino &&
    origen !== destino &&
    lineas.some((l) => l.codigoItem.trim() && Number(l.cantidad) > 0);

  return (
    <>
      <ErrorBoundary>
        <div className="p-6 space-y-4">
          <div>
            <h2 className="text-2xl font-black text-gray-100">Traspasos entre sucursales</h2>
            <p className="text-sm text-muted">
              La mercancía sale de una sucursal y entra a otra al momento; el total del negocio no
              cambia y ambos movimientos quedan en el Kardex.
            </p>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          )}

          {!cargando && sucursales.length < 2 ? (
            <div className="rounded-xl border border-dashed border-surface-600 bg-surface-800 px-4 py-10 text-center text-sm text-muted">
              <Truck className="mx-auto mb-2 h-8 w-8 opacity-60" />
              Necesitas al menos dos sucursales activas. Créalas en Configuración → Usuarios.
            </div>
          ) : (
            <div className="rounded-2xl border border-surface-600 bg-surface-800 p-4 space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-muted">Desde</span>
                  <select
                    value={origen}
                    disabled={!esAdmin}
                    onChange={(e) => setOrigen(e.target.value)}
                    className="input-dark w-48"
                  >
                    {sucursales.map((s) => (
                      <option key={s.idSucursal} value={s.idSucursal}>
                        {s.nombre}
                        {s.idSucursal === activa ? " (activa)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <ArrowRight className="mb-3 h-4 w-4 text-muted" />
                <label className="block">
                  <span className="mb-1 block text-xs text-muted">Hacia</span>
                  <select value={destino} onChange={(e) => setDestino(e.target.value)} className="input-dark w-48">
                    <option value="">Elige destino</option>
                    {sucursales
                      .filter((s) => s.idSucursal !== origen)
                      .map((s) => (
                        <option key={s.idSucursal} value={s.idSucursal}>
                          {s.nombre}
                        </option>
                      ))}
                  </select>
                </label>
              </div>

              {lineas.map((l, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <input
                    value={l.codigoItem}
                    onChange={(e) =>
                      setLineas((ls) => ls.map((x, k) => (k === i ? { ...x, codigoItem: e.target.value } : x)))
                    }
                    placeholder="Código del producto"
                    className="input-dark w-48"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.001"
                    value={l.cantidad}
                    onChange={(e) =>
                      setLineas((ls) => ls.map((x, k) => (k === i ? { ...x, cantidad: e.target.value } : x)))
                    }
                    className="input-dark w-28"
                  />
                  {lineas.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setLineas((ls) => ls.filter((_, k) => k !== i))}
                      aria-label="Quitar producto"
                      className="rounded-lg border border-rose-500/40 p-2 text-rose-300 hover:bg-rose-500/20"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setLineas((ls) => [...ls, { codigoItem: "", cantidad: "1" }])}
                className="inline-flex items-center gap-1 text-xs font-bold text-acento hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Agregar producto
              </button>
              <input
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Notas (opcional)"
                maxLength={300}
                className="input-dark"
              />
              <button
                type="button"
                disabled={!listo || enviando}
                onClick={enviar}
                className="inline-flex items-center gap-2 rounded-xl bg-acento px-4 py-2.5 text-sm font-bold text-btn-ink disabled:opacity-50"
              >
                {enviando && <Loader2 className="h-4 w-4 animate-spin" />} Registrar traspaso
              </button>
            </div>
          )}

          <div className="space-y-2">
            <h3 className="text-sm font-bold text-gray-100">Historial</h3>
            {cargando ? (
              <p className="flex items-center gap-2 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
              </p>
            ) : traspasos.length === 0 ? (
              <p className="text-sm text-muted">Sin traspasos registrados.</p>
            ) : (
              traspasos.map((t) => (
                <div key={t.idTraspaso} className="rounded-xl border border-surface-600 bg-surface-800 p-3 text-sm">
                  <p className="font-bold text-gray-100">
                    {t.folio} · {t.origen} → {t.destino}
                  </p>
                  <p className="text-xs text-muted">
                    {new Date(t.fecha).toLocaleString("es-MX")}
                    {t.notas ? ` · ${t.notas}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-slate-300">
                    {t.lineas.map((l) => `${l.cantidad} × ${l.descripcion}`).join(" · ")}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </ErrorBoundary>
    </>
  );
}
