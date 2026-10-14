"use client";

import { Plus, Sparkles, Trash2 } from "lucide-react";
import {
  MAX_CAMPOS_PRODUCTO,
  presetPorGiro,
  type CampoPersonalizado,
  type Personalizacion,
  type TipoCampo,
  type Vocabulario,
} from "@/lib/personalizacion";

// ============================================================
// Editor de la personalización del giro (Configuración → Negocio):
// vocabulario, nombres visibles de los roles, campos propios de los
// productos y si se usa el campo de impresión (papelerías).
// ============================================================

const ETIQUETAS_VOCABULARIO: Record<keyof Vocabulario, string> = {
  producto: "Producto (singular)",
  productos: "Productos (plural)",
  cliente: "Cliente (singular)",
  clientes: "Clientes (plural)",
  recarga: "Venta de servicio / recarga",
  apartado: "Apartado",
};

export function PersonalizacionGiroEditor({
  valor,
  tipoNegocio,
  onChange,
}: {
  valor: Personalizacion;
  tipoNegocio: string;
  onChange: (p: Personalizacion) => void;
}) {
  const setVocabulario = (k: keyof Vocabulario, v: string) =>
    onChange({ ...valor, vocabulario: { ...valor.vocabulario, [k]: v } });

  const setCampo = (i: number, cambio: Partial<CampoPersonalizado>) =>
    onChange({
      ...valor,
      camposProducto: valor.camposProducto.map((c, k) => (k === i ? { ...c, ...cambio } : c)),
    });

  return (
    <div className="space-y-4 border-t border-surface-600 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-muted">
          Personalización del giro
        </span>
        <button
          type="button"
          onClick={() => onChange(presetPorGiro(tipoNegocio))}
          className="inline-flex items-center gap-1 rounded-lg border border-surface-500 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-surface-600"
        >
          <Sparkles className="h-3.5 w-3.5" /> Usar plantilla del giro
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {(Object.keys(ETIQUETAS_VOCABULARIO) as (keyof Vocabulario)[]).map((k) => (
          <label key={k} className="block">
            <span className="mb-1 block text-xs text-muted">{ETIQUETAS_VOCABULARIO[k]}</span>
            <input
              value={valor.vocabulario[k]}
              maxLength={30}
              onChange={(e) => setVocabulario(k, e.target.value)}
              className="input-dark"
            />
          </label>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {(["ADMINISTRADORA", "CAJERA"] as const).map((rol) => (
          <label key={rol} className="block">
            <span className="mb-1 block text-xs text-muted">
              Nombre visible del rol {rol === "ADMINISTRADORA" ? "de administración" : "de caja"}
            </span>
            <input
              value={valor.etiquetasRol[rol]}
              maxLength={30}
              onChange={(e) =>
                onChange({ ...valor, etiquetasRol: { ...valor.etiquetasRol, [rol]: e.target.value } })
              }
              className="input-dark"
            />
          </label>
        ))}
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={valor.usarTipoImpresion}
          onChange={(e) => onChange({ ...valor, usarTipoImpresion: e.target.checked })}
        />
        Mostrar el campo &quot;Tipo de impresión&quot; en los productos (papelerías)
      </label>

      <div className="space-y-2">
        <span className="block text-xs text-muted">
          Campos propios de cada {valor.vocabulario.producto.toLowerCase()} (máximo {MAX_CAMPOS_PRODUCTO})
        </span>
        {valor.camposProducto.length === 0 && (
          <p className="text-xs text-muted">Sin campos personalizados.</p>
        )}
        {valor.camposProducto.map((c, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input
              value={c.etiqueta}
              maxLength={40}
              onChange={(e) => setCampo(i, { etiqueta: e.target.value, clave: "" })}
              placeholder="Nombre del campo"
              className="input-dark w-48"
            />
            <select
              value={c.tipo}
              onChange={(e) => {
                const tipo = e.target.value as TipoCampo;
                setCampo(i, { tipo, ...(tipo === "lista" ? { opciones: c.opciones ?? ["", ""] } : { opciones: undefined }) });
              }}
              className="input-dark w-32"
            >
              <option value="texto">Texto</option>
              <option value="numero">Número</option>
              <option value="lista">Lista</option>
            </select>
            {c.tipo === "lista" && (
              <input
                value={(c.opciones ?? []).join(", ")}
                onChange={(e) => setCampo(i, { opciones: e.target.value.split(",").map((o) => o.trim()) })}
                placeholder="Opciones separadas por coma"
                className="input-dark min-w-[12rem] flex-1"
              />
            )}
            <button
              type="button"
              onClick={() =>
                onChange({ ...valor, camposProducto: valor.camposProducto.filter((_, k) => k !== i) })
              }
              className="rounded-lg border border-rose-500/40 p-2 text-rose-300 hover:bg-rose-500/20"
              aria-label="Quitar campo"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {valor.camposProducto.length < MAX_CAMPOS_PRODUCTO && (
          <button
            type="button"
            onClick={() =>
              onChange({
                ...valor,
                camposProducto: [...valor.camposProducto, { clave: "", etiqueta: "", tipo: "texto" }],
              })
            }
            className="inline-flex items-center gap-1 text-xs font-bold text-acento hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> Agregar campo
          </button>
        )}
      </div>
    </div>
  );
}
