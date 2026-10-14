"use client";

import { useEffect, useState } from "react";
import { Monitor } from "lucide-react";

// ============================================================
// Multi-caja (Paso 5): la administradora ve todas las cajas abiertas del
// negocio, con su cajero(a), sucursal y lo que llevan cobrado.
// ============================================================

interface CajaAbierta {
  idCaja: string;
  folioCaja: string | null;
  nombreCaja: string | null;
  estado: string;
  cajero: string;
  sucursal: string | null;
  horaApertura: string;
  fondoInicial: number;
  totalVentasEfectivo: number;
  totalVentasDigital: number;
  totalRecargas: number;
}

const dinero = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

export function CajasAbiertas() {
  const [cajas, setCajas] = useState<CajaAbierta[] | null>(null);

  useEffect(() => {
    fetch("/api/caja/abiertas", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { cajas: [] }))
      .then((d) => setCajas(d.cajas ?? []))
      .catch(() => setCajas([]));
  }, []);

  if (!cajas || cajas.length === 0) return null;

  return (
    <div className="rounded-2xl border border-surface-600 bg-surface-800 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Monitor className="h-4 w-4 text-acento" />
        <span className="text-sm font-bold text-gray-100">Cajas abiertas ({cajas.length})</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
              <th className="py-1 pr-3">Caja</th>
              <th className="py-1 pr-3">Cajero(a)</th>
              <th className="py-1 pr-3">Sucursal</th>
              <th className="py-1 pr-3">Desde</th>
              <th className="py-1 pr-3 text-right">Efectivo</th>
              <th className="py-1 pr-3 text-right">Digital</th>
              <th className="py-1 text-right">Estado</th>
            </tr>
          </thead>
          <tbody>
            {cajas.map((c) => (
              <tr key={c.idCaja} className="border-t border-surface-700">
                <td className="py-1.5 pr-3 font-bold text-gray-100">
                  {c.folioCaja ?? "—"}
                  {c.nombreCaja ? ` · ${c.nombreCaja}` : ""}
                </td>
                <td className="py-1.5 pr-3 text-slate-300">{c.cajero}</td>
                <td className="py-1.5 pr-3 text-slate-300">{c.sucursal ?? "—"}</td>
                <td className="py-1.5 pr-3 text-muted">
                  {new Date(c.horaApertura).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                </td>
                <td className="py-1.5 pr-3 text-right text-gray-100">
                  {dinero(c.fondoInicial + c.totalVentasEfectivo)}
                </td>
                <td className="py-1.5 pr-3 text-right text-gray-100">{dinero(c.totalVentasDigital)}</td>
                <td className="py-1.5 text-right text-xs font-bold text-acento">
                  {c.estado === "EN_CIERRE" ? "En corte" : "Abierta"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
