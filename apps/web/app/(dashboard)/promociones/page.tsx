"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pause, Play, Plus, Tag, Trash2 } from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ErrorBoundary } from "@/components/error-boundary";
import { Modal } from "@/components/ui/modal";
import { promocionVigente } from "@/lib/descuentos";
import { cn } from "@/lib/utils";

interface Promocion {
  idPromocion: string;
  nombre: string;
  tipo: "PORCENTAJE" | "NXM";
  valor: number | null;
  llevaN: number | null;
  pagaM: number | null;
  codigoItem: string | null;
  idCategoria: string | null;
  fechaInicio: string;
  fechaFin: string | null;
  activa: boolean;
}

interface Categoria {
  id: string;
  nombre: string;
}

const hoy = () => new Date().toISOString().slice(0, 10);

function describir(p: Promocion, categorias: Categoria[]): string {
  const que =
    p.tipo === "PORCENTAJE" ? `${p.valor}% de descuento` : `Lleva ${p.llevaN} paga ${p.pagaM}`;
  const donde = p.codigoItem
    ? `en el producto ${p.codigoItem}`
    : p.idCategoria
      ? `en ${categorias.find((c) => c.id === p.idCategoria)?.nombre ?? "una categoría"}`
      : "en todo el catálogo";
  return `${que} ${donde}`;
}

export default function PromocionesPage() {
  const [promos, setPromos] = useState<Promocion[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState({
    nombre: "",
    tipo: "PORCENTAJE" as "PORCENTAJE" | "NXM",
    valor: "10",
    llevaN: "3",
    pagaM: "2",
    alcance: "TODO" as "TODO" | "PRODUCTO" | "CATEGORIA",
    codigoItem: "",
    idCategoria: "",
    fechaInicio: hoy(),
    fechaFin: "",
  });
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch("/api/promociones", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudieron cargar las promociones");
      setPromos(data.promociones ?? []);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    fetch("/api/categorias", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCategorias(Array.isArray(d?.categorias) ? d.categorias : []))
      .catch(() => {});
  }, [cargar]);

  const crear = async () => {
    setGuardando(true);
    setErrorForm(null);
    try {
      const res = await fetch("/api/promociones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: form.nombre,
          tipo: form.tipo,
          valor: form.tipo === "PORCENTAJE" ? Number(form.valor) : null,
          llevaN: form.tipo === "NXM" ? Number(form.llevaN) : null,
          pagaM: form.tipo === "NXM" ? Number(form.pagaM) : null,
          codigoItem: form.alcance === "PRODUCTO" ? form.codigoItem.trim().toUpperCase() : null,
          idCategoria: form.alcance === "CATEGORIA" ? form.idCategoria : null,
          fechaInicio: form.fechaInicio,
          fechaFin: form.fechaFin || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo crear la promoción");
      setAbierto(false);
      await cargar();
    } catch (e: any) {
      setErrorForm(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const alternar = async (p: Promocion) => {
    await fetch(`/api/promociones/${p.idPromocion}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activa: !p.activa }),
    });
    cargar();
  };

  const eliminar = async (p: Promocion) => {
    if (!window.confirm(`¿Eliminar la promoción "${p.nombre}"? Las ventas pasadas no cambian.`)) return;
    await fetch(`/api/promociones/${p.idPromocion}`, { method: "DELETE" });
    cargar();
  };

  return (
    <DashboardLayout>
      <ErrorBoundary>
        <div className="p-6 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black text-gray-100">Promociones</h2>
              <p className="text-sm text-muted">
                Se aplican solas en el punto de venta mientras estén vigentes. Si a un producto le
                aplican varias, se usa la que más descuenta.
              </p>
            </div>
            <button
              onClick={() => {
                setErrorForm(null);
                setAbierto(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-acento px-4 py-2.5 text-sm font-bold text-btn-ink shadow-card hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Nueva promoción
            </button>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          )}

          {cargando ? (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
            </p>
          ) : promos.length === 0 ? (
            <div className="rounded-xl border border-dashed border-surface-600 bg-surface-800 px-4 py-10 text-center text-sm text-muted">
              <Tag className="mx-auto mb-2 h-8 w-8 opacity-60" />
              Aún no hay promociones. Crea un "3x2" o un porcentaje por producto o categoría.
            </div>
          ) : (
            <div className="space-y-2">
              {promos.map((p) => {
                const vigente = promocionVigente(p);
                return (
                  <div
                    key={p.idPromocion}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-surface-600 bg-surface-800 p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-gray-100">{p.nombre}</p>
                      <p className="text-xs text-muted">{describir(p, categorias)}</p>
                      <p className="text-xs text-muted">
                        Desde {new Date(p.fechaInicio).toLocaleDateString("es-MX")}
                        {p.fechaFin ? ` hasta ${new Date(p.fechaFin).toLocaleDateString("es-MX")}` : " · sin fecha de fin"}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-bold",
                        vigente
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-surface-600 text-muted"
                      )}
                    >
                      {vigente ? "Vigente" : p.activa ? "Fuera de fechas" : "Pausada"}
                    </span>
                    <button
                      onClick={() => alternar(p)}
                      title={p.activa ? "Pausar" : "Activar"}
                      aria-label={p.activa ? "Pausar" : "Activar"}
                      className="rounded-lg border border-surface-500 p-2 text-slate-300 hover:bg-surface-600"
                    >
                      {p.activa ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={() => eliminar(p)}
                      title="Eliminar"
                      aria-label="Eliminar"
                      className="rounded-lg border border-rose-500/40 p-2 text-rose-300 hover:bg-rose-500/20"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <Modal open={abierto} onClose={() => !guardando && setAbierto(false)} title="Nueva promoción">
          <div className="space-y-3">
            <input
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder='Nombre (ej. "3x2 en cuadernos")'
              className="input-dark"
            />
            <div className="grid grid-cols-2 gap-2">
              {(["PORCENTAJE", "NXM"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm({ ...form, tipo: t })}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-sm font-bold",
                    form.tipo === t
                      ? "border-acento bg-acento/10 text-acento"
                      : "border-surface-500 text-slate-300"
                  )}
                >
                  {t === "PORCENTAJE" ? "% de descuento" : "Lleva N paga M"}
                </button>
              ))}
            </div>
            {form.tipo === "PORCENTAJE" ? (
              <label className="block">
                <span className="mb-1 block text-xs text-muted">Porcentaje</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={form.valor}
                  onChange={(e) => setForm({ ...form, valor: e.target.value })}
                  className="input-dark"
                />
              </label>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-xs text-muted">Lleva</span>
                  <input
                    type="number"
                    min={2}
                    value={form.llevaN}
                    onChange={(e) => setForm({ ...form, llevaN: e.target.value })}
                    className="input-dark"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted">Paga</span>
                  <input
                    type="number"
                    min={1}
                    value={form.pagaM}
                    onChange={(e) => setForm({ ...form, pagaM: e.target.value })}
                    className="input-dark"
                  />
                </label>
              </div>
            )}
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Aplica a</span>
              <select
                value={form.alcance}
                onChange={(e) => setForm({ ...form, alcance: e.target.value as typeof form.alcance })}
                className="input-dark"
              >
                <option value="TODO">Todo el catálogo</option>
                <option value="PRODUCTO">Un producto</option>
                <option value="CATEGORIA">Una categoría</option>
              </select>
            </label>
            {form.alcance === "PRODUCTO" && (
              <input
                value={form.codigoItem}
                onChange={(e) => setForm({ ...form, codigoItem: e.target.value })}
                placeholder="Código del producto"
                className="input-dark"
              />
            )}
            {form.alcance === "CATEGORIA" && (
              <select
                value={form.idCategoria}
                onChange={(e) => setForm({ ...form, idCategoria: e.target.value })}
                className="input-dark"
              >
                <option value="">Elige una categoría</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            )}
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-xs text-muted">Desde</span>
                <input
                  type="date"
                  value={form.fechaInicio}
                  onChange={(e) => setForm({ ...form, fechaInicio: e.target.value })}
                  className="input-dark"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-muted">Hasta (opcional)</span>
                <input
                  type="date"
                  value={form.fechaFin}
                  onChange={(e) => setForm({ ...form, fechaFin: e.target.value })}
                  className="input-dark"
                />
              </label>
            </div>
            {errorForm && <p className="text-sm text-rose-300">{errorForm}</p>}
            <button
              disabled={guardando || form.nombre.trim().length < 2}
              onClick={crear}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-acento px-4 py-2.5 text-sm font-bold text-btn-ink disabled:opacity-50"
            >
              {guardando && <Loader2 className="h-4 w-4 animate-spin" />} Crear promoción
            </button>
          </div>
        </Modal>
      </ErrorBoundary>
    </DashboardLayout>
  );
}
