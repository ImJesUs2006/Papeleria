"use client";

import { useState } from "react";
import { Loader2, Pencil, Plus, Trash2, UserCog } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { usePersonalizacion } from "@/store/config";
import { confirmar } from "@/store/dialogo";

// ============================================================
// Perfiles: roles con nombre propio del negocio (Paso 4).
// Un perfil fija el rol base y los permisos de módulo; editarlo los
// aplica a todos los usuarios que lo tienen.
// ============================================================

export interface Perfil {
  idPerfil: string;
  nombre: string;
  rolBase: "ADMINISTRADORA" | "CAJERA";
  permisoCobrar: boolean;
  permisoInventario: boolean;
  permisoReportes: boolean;
  usuarios: number;
}

type Borrador = Omit<Perfil, "idPerfil" | "usuarios">;

const VACIO: Borrador = {
  nombre: "",
  rolBase: "CAJERA",
  permisoCobrar: true,
  permisoInventario: false,
  permisoReportes: false,
};

export function PerfilesPanel({
  perfiles,
  onCambio,
  onError,
}: {
  perfiles: Perfil[];
  onCambio: () => void;
  onError: (msg: string) => void;
}) {
  const { etiquetasRol } = usePersonalizacion();
  const [editando, setEditando] = useState<Perfil | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [borrador, setBorrador] = useState<Borrador>(VACIO);
  const [guardando, setGuardando] = useState(false);

  const abrir = (p: Perfil | null) => {
    setEditando(p);
    setBorrador(p ? { ...p } : VACIO);
    setAbierto(true);
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      const res = await fetch(editando ? `/api/perfiles/${editando.idPerfil}` : "/api/perfiles", {
        method: editando ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(borrador),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo guardar el perfil");
      setAbierto(false);
      onCambio();
    } catch (e: any) {
      onError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (p: Perfil) => {
    if (
      !(await confirmar({
        titulo: `¿Eliminar el perfil "${p.nombre}"?`,
        mensaje: `Sus ${p.usuarios} usuario(s) conservan sus permisos actuales.`,
        aceptar: "Eliminar",
        peligro: true,
      }))
    )
      return;
    const res = await fetch(`/api/perfiles/${p.idPerfil}`, { method: "DELETE" });
    if (!res.ok) onError((await res.json()).error || "No se pudo eliminar");
    onCambio();
  };

  const resumen = (p: Borrador) =>
    p.rolBase === "ADMINISTRADORA"
      ? "Acceso total"
      : [p.permisoCobrar && "Cobro", p.permisoInventario && "Inventario", p.permisoReportes && "Reportes"]
          .filter(Boolean)
          .join(" · ") || "Sin módulos";

  return (
    <div className="rounded-2xl border border-surface-600 bg-surface-800 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <UserCog className="h-4 w-4 text-acento" />
          <span className="text-sm font-bold text-gray-100">Perfiles</span>
          <span className="text-xs text-muted">Roles con nombre propio (p. ej. Encargado de almacén)</span>
        </div>
        <button
          type="button"
          onClick={() => abrir(null)}
          className="inline-flex items-center gap-1 rounded-lg bg-acento px-3 py-1.5 text-xs font-bold text-btn-ink"
        >
          <Plus className="h-3.5 w-3.5" /> Nuevo perfil
        </button>
      </div>
      {perfiles.length === 0 ? (
        <p className="text-xs text-muted">
          Sin perfiles. Crea uno para asignar el mismo conjunto de permisos a varias personas.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {perfiles.map((p) => (
            <li key={p.idPerfil} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-bold text-gray-100">{p.nombre}</span>
              <span className="text-xs text-muted">
                {etiquetasRol[p.rolBase]} · {resumen(p)} · {p.usuarios} usuario(s)
              </span>
              <span className="ml-auto flex gap-1">
                <button
                  type="button"
                  onClick={() => abrir(p)}
                  aria-label={`Editar ${p.nombre}`}
                  className="rounded-lg border border-surface-500 p-1.5 text-slate-300 hover:bg-surface-600"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => eliminar(p)}
                  aria-label={`Eliminar ${p.nombre}`}
                  className="rounded-lg border border-rose-500/40 p-1.5 text-rose-300 hover:bg-rose-500/20"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={abierto}
        onClose={() => !guardando && setAbierto(false)}
        title={editando ? `Editar perfil` : "Nuevo perfil"}
        subtitle={editando ? `Los cambios se aplican a sus ${editando.usuarios} usuario(s)` : undefined}
      >
        <div className="space-y-3">
          <input
            value={borrador.nombre}
            maxLength={40}
            onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })}
            placeholder="Nombre del perfil"
            className="input-dark"
          />
          <select
            value={borrador.rolBase}
            onChange={(e) =>
              setBorrador({ ...borrador, rolBase: e.target.value as Borrador["rolBase"] })
            }
            className="input-dark"
          >
            <option value="CAJERA">Basado en {etiquetasRol.CAJERA}</option>
            <option value="ADMINISTRADORA">Basado en {etiquetasRol.ADMINISTRADORA} (acceso total)</option>
          </select>
          {borrador.rolBase === "CAJERA" && (
            <div className="flex flex-wrap gap-4 text-sm text-slate-300">
              {(
                [
                  ["permisoCobrar", "Cobro"],
                  ["permisoInventario", "Inventario"],
                  ["permisoReportes", "Reportes"],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={borrador[k]}
                    onChange={(e) => setBorrador({ ...borrador, [k]: e.target.checked })}
                  />
                  {label}
                </label>
              ))}
            </div>
          )}
          <button
            type="button"
            disabled={guardando || borrador.nombre.trim().length < 2}
            onClick={guardar}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-acento px-4 py-2.5 text-sm font-bold text-btn-ink disabled:opacity-50"
          >
            {guardando && <Loader2 className="h-4 w-4 animate-spin" />} Guardar perfil
          </button>
        </div>
      </Modal>
    </div>
  );
}
