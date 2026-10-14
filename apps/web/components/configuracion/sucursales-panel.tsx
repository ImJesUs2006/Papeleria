"use client";

import { useState } from "react";
import { Loader2, Plus, Power, Store } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// Sucursales del negocio (Paso 5): alta y activación. A cada usuario
// se le asigna su sucursal desde la tabla de usuarios.
// ============================================================

export interface Sucursal {
  idSucursal: string;
  nombre: string;
  direccion: string | null;
  esMatriz: boolean;
  activa: boolean;
  usuarios: number;
}

export function SucursalesPanel({
  sucursales,
  onCambio,
  onError,
}: {
  sucursales: Sucursal[];
  onCambio: () => void;
  onError: (msg: string) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [direccion, setDireccion] = useState("");
  const [guardando, setGuardando] = useState(false);

  const crear = async () => {
    setGuardando(true);
    try {
      const res = await fetch("/api/sucursales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, direccion }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo crear la sucursal");
      setNombre("");
      setDireccion("");
      onCambio();
    } catch (e: any) {
      onError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const alternar = async (s: Sucursal) => {
    const res = await fetch(`/api/sucursales/${s.idSucursal}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activa: !s.activa }),
    });
    if (!res.ok) onError((await res.json()).error || "No se pudo actualizar");
    onCambio();
  };

  return (
    <div className="rounded-2xl border border-surface-600 bg-surface-800 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Store className="h-4 w-4 text-acento" />
        <span className="text-sm font-bold text-gray-100">Sucursales</span>
        <span className="text-xs text-muted">Cada una lleva su propia existencia y sus cajas</span>
      </div>
      <ul className="mb-3 space-y-1.5">
        {sucursales.map((s) => (
          <li key={s.idSucursal} className="flex flex-wrap items-center gap-2 text-sm">
            <span className={cn("font-bold", s.activa ? "text-gray-100" : "text-muted line-through")}>
              {s.nombre}
            </span>
            {s.esMatriz && (
              <span className="rounded-full bg-acento/15 px-2 py-0.5 text-[10px] font-bold text-acento">
                Matriz
              </span>
            )}
            <span className="text-xs text-muted">
              {s.direccion ? `${s.direccion} · ` : ""}
              {s.usuarios} usuario(s) asignado(s)
            </span>
            {!s.esMatriz && (
              <button
                type="button"
                onClick={() => alternar(s)}
                title={s.activa ? "Desactivar" : "Activar"}
                aria-label={s.activa ? `Desactivar ${s.nombre}` : `Activar ${s.nombre}`}
                className="ml-auto rounded-lg border border-surface-500 p-1.5 text-slate-300 hover:bg-surface-600"
              >
                <Power className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nueva sucursal"
          maxLength={60}
          className="input-dark w-48"
        />
        <input
          value={direccion}
          onChange={(e) => setDireccion(e.target.value)}
          placeholder="Dirección (opcional)"
          maxLength={200}
          className="input-dark min-w-[12rem] flex-1"
        />
        <button
          type="button"
          disabled={guardando || nombre.trim().length < 2}
          onClick={crear}
          className="inline-flex items-center gap-1 rounded-lg bg-acento px-3 py-1.5 text-xs font-bold text-btn-ink disabled:opacity-50"
        >
          {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Agregar
        </button>
      </div>
    </div>
  );
}
