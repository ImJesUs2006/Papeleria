"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Tags, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { notificar } from "@/store/notificaciones";

export interface Categoria {
  id: string;
  nombre: string;
  color: string;
  orden: number;
  productos?: number;
}

const COLORES = ["#10b981", "#0ea5e9", "#6366f1", "#f59e0b", "#ef4444", "#ec4899", "#14b8a6", "#84cc16"];

/** Alta, edición, orden y baja de categorías (también son las pestañas del POS). */
export function GestorCategorias({
  abierto,
  onClose,
  onCambio,
}: {
  abierto: boolean;
  onClose: () => void;
  onCambio: () => void;
}) {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [cargando, setCargando] = useState(false);
  const [nueva, setNueva] = useState({ nombre: "", color: COLORES[0] });
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetch("/api/categorias", { cache: "no-store" });
      const d = await r.json();
      setCategorias(d.categorias ?? []);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (abierto) cargar();
  }, [abierto, cargar]);

  const llamar = async (url: string, init: RequestInit, exito: string) => {
    setOcupado(true);
    try {
      const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "No se pudo guardar");
      notificar.exito(exito);
      await cargar();
      onCambio();
      return true;
    } catch (e: any) {
      notificar.error(e.message);
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const crear = async () => {
    const nombre = nueva.nombre.trim();
    if (nombre.length < 2) return notificar.error("El nombre debe tener al menos 2 caracteres");
    const ok = await llamar("/api/categorias", { method: "POST", body: JSON.stringify(nueva) }, `Categoría “${nombre}” creada`);
    if (ok) setNueva({ nombre: "", color: COLORES[(categorias.length + 1) % COLORES.length] });
  };

  const actualizar = (c: Categoria, cambios: Partial<Categoria>, exito = "Categoría actualizada") =>
    llamar(`/api/categorias/${c.id}`, { method: "PATCH", body: JSON.stringify(cambios) }, exito);

  const mover = async (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= categorias.length) return;
    const a = categorias[i];
    const b = categorias[j];
    // Intercambia posiciones (se normalizan a su índice para evitar empates).
    setOcupado(true);
    try {
      await Promise.all([
        fetch(`/api/categorias/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orden: j }) }),
        fetch(`/api/categorias/${b.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orden: i }) }),
      ]);
      await cargar();
      onCambio();
    } finally {
      setOcupado(false);
    }
  };

  const borrar = (c: Categoria) => {
    const aviso = c.productos ? ` Sus ${c.productos} producto(s) quedarán “sin categoría”.` : "";
    if (!window.confirm(`¿Borrar la categoría “${c.nombre}”?${aviso}`)) return;
    llamar(`/api/categorias/${c.id}`, { method: "DELETE" }, `Categoría “${c.nombre}” borrada`);
  };

  return (
    <Modal open={abierto} onClose={onClose} title="Categorías">
      <p className="mb-3 text-xs text-muted">
        Agrupan tu catálogo: sirven para filtrar el inventario, para promociones por categoría y como pestañas del
        catálogo táctil en Cobro (en este orden).
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-surface-600 p-3">
        <input
          type="color"
          value={nueva.color}
          onChange={(e) => setNueva({ ...nueva, color: e.target.value })}
          aria-label="Color de la nueva categoría"
          className="h-9 w-10 cursor-pointer rounded-lg border border-surface-500 bg-transparent"
        />
        <input
          value={nueva.nombre}
          maxLength={60}
          onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && crear()}
          placeholder="Nueva categoría (ej. Escolar)"
          className="input-dark min-w-0 flex-1"
        />
        <button type="button" disabled={ocupado} onClick={crear} className="btn-primary flex items-center gap-1 px-3 py-2 text-sm">
          <Plus className="h-4 w-4" /> Agregar
        </button>
      </div>

      {cargando ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </p>
      ) : categorias.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center text-muted">
          <Tags className="h-8 w-8 opacity-40" />
          <p className="text-sm">Aún no tienes categorías.</p>
        </div>
      ) : (
        <ul className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
          {categorias.map((c, i) => (
            <li key={c.id} className="flex items-center gap-2 rounded-xl border border-surface-600 bg-surface-700/50 p-2">
              <input
                type="color"
                defaultValue={c.color}
                onBlur={(e) => e.target.value !== c.color && actualizar(c, { color: e.target.value }, "Color actualizado")}
                aria-label={`Color de ${c.nombre}`}
                className="h-8 w-9 shrink-0 cursor-pointer rounded-md border border-surface-500 bg-transparent"
              />
              <input
                defaultValue={c.nombre}
                maxLength={60}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== c.nombre) actualizar(c, { nombre: v }, "Nombre actualizado");
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                aria-label={`Nombre de ${c.nombre}`}
                className="input-dark min-w-0 flex-1 py-1.5 text-sm"
              />
              <span className="shrink-0 text-[11px] text-muted tabular-nums">{c.productos ?? 0} prod.</span>
              <div className="flex shrink-0">
                <button type="button" disabled={ocupado || i === 0} onClick={() => mover(i, -1)} aria-label="Subir" className="flex h-8 w-7 items-center justify-center text-muted hover:text-gray-100 disabled:opacity-30">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" disabled={ocupado || i === categorias.length - 1} onClick={() => mover(i, 1)} aria-label="Bajar" className="flex h-8 w-7 items-center justify-center text-muted hover:text-gray-100 disabled:opacity-30">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button type="button" disabled={ocupado} onClick={() => borrar(c)} aria-label={`Borrar ${c.nombre}`} className="flex h-8 w-8 items-center justify-center text-muted hover:text-rose-300">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
