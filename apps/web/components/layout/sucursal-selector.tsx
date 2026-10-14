"use client";

import { useEffect, useState } from "react";
import { Store } from "lucide-react";

// ============================================================
// Sucursal activa (Paso 5). Todo el personal ve en qué sucursal opera;
// la administradora puede cambiarla (inventario, ventas y caja usan la
// existencia de esa sucursal). Se oculta si el negocio tiene una sola.
// ============================================================

interface Sucursal {
  idSucursal: string;
  nombre: string;
  activa: boolean;
}

export function SucursalSelector({ esAdmin }: { esAdmin: boolean }) {
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [activa, setActiva] = useState<string | null>(null);
  const [cambiando, setCambiando] = useState(false);

  useEffect(() => {
    fetch("/api/sucursales", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setSucursales((d.sucursales ?? []).filter((s: Sucursal) => s.activa));
        setActiva(d.activa ?? null);
      })
      .catch(() => {});
  }, []);

  if (sucursales.length < 2) return null;
  const actual = sucursales.find((s) => s.idSucursal === activa);

  if (!esAdmin) {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
        <Store className="h-3.5 w-3.5" /> {actual?.nombre ?? "Sucursal"}
      </p>
    );
  }

  return (
    <label className="mt-2 flex items-center gap-1.5 text-xs text-muted">
      <Store className="h-3.5 w-3.5 shrink-0" />
      <span className="sr-only">Sucursal activa</span>
      <select
        value={activa ?? ""}
        disabled={cambiando}
        onChange={async (e) => {
          setCambiando(true);
          const res = await fetch("/api/sucursales/activa", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idSucursal: e.target.value }),
          });
          if (res.ok) {
            // Inventario, caja y catálogo cambian de sucursal: recarga la vista.
            window.location.reload();
          } else {
            setCambiando(false);
          }
        }}
        className="w-full rounded-md border border-surface-500 bg-surface-700 px-2 py-1 text-xs text-gray-100 focus:outline-none"
      >
        {sucursales.map((s) => (
          <option key={s.idSucursal} value={s.idSucursal}>
            {s.nombre}
          </option>
        ))}
      </select>
    </label>
  );
}
