"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  KeyRound,
  Loader2,
  LogOut,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { TIPO_NEGOCIO, type TipoNegocio } from "@/lib/business-types";
import { resumenCatalogo } from "@/lib/catalogos-ejemplo";
import { cn } from "@/lib/utils";

// ============================================================
// Consola de PLATAFORMA: solo para el dueño del SaaS. Lista todos los
// negocios con su actividad, da de alta negocios con su giro (y catálogo
// de ejemplo), suspende/reactiva y restablece la clave de la administradora.
// ============================================================

interface NegocioFila {
  idNegocio: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  giro: TipoNegocio | null;
  setupPendiente: boolean;
  creado: string;
  usuarios: number;
  productos: number;
  sucursales: number;
  ventas30: number;
  importe30: number;
  ultimaVenta: string | null;
}

const dinero = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const sugerirCodigo = (nombre: string) =>
  nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

function hace(fecha: string | null): string {
  if (!fecha) return "Sin ventas";
  const dias = Math.floor((Date.now() - new Date(fecha).getTime()) / 86_400_000);
  return dias === 0 ? "Hoy" : dias === 1 ? "Ayer" : `Hace ${dias} días`;
}

export default function ConsolaPlataforma() {
  const [estado, setEstado] = useState<"cargando" | "login" | "dentro">("cargando");
  const [habilitada, setHabilitada] = useState(true);
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [negocios, setNegocios] = useState<NegocioFila[]>([]);
  const [q, setQ] = useState("");
  const [alta, setAlta] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const r = await fetch("/api/plataforma/negocios", { cache: "no-store" });
    if (r.status === 401) return setEstado("login");
    const d = await r.json();
    setNegocios(d.negocios ?? []);
    setEstado("dentro");
  }, []);

  useEffect(() => {
    fetch("/api/plataforma/sesion", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setHabilitada(d.habilitada !== false);
        if (d.activa) cargar();
        else setEstado("login");
      })
      .catch(() => setEstado("login"));
  }, [cargar]);

  const entrar = async () => {
    setError(null);
    const r = await fetch("/api/plataforma/sesion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clave }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setError(d.error || "No se pudo entrar");
    setClave("");
    cargar();
  };

  const salir = async () => {
    await fetch("/api/plataforma/sesion", { method: "DELETE" });
    setNegocios([]);
    setEstado("login");
  };

  const accion = async (n: NegocioFila, cuerpo: object, exito: string) => {
    const r = await fetch(`/api/plataforma/negocios/${n.idNegocio}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    const d = await r.json().catch(() => ({}));
    setAviso(r.ok ? exito : d.error || "No se pudo completar");
    cargar();
  };

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? negocios.filter((n) => `${n.nombre} ${n.codigo}`.toLowerCase().includes(t)) : negocios;
  }, [negocios, q]);
  const totales = useMemo(
    () => ({
      activos: negocios.filter((n) => n.activo).length,
      suspendidos: negocios.filter((n) => !n.activo).length,
      pendientes: negocios.filter((n) => n.setupPendiente).length,
      importe: negocios.reduce((s, n) => s + n.importe30, 0),
    }),
    [negocios]
  );

  if (estado === "cargando") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-app text-muted">
        <Loader2 className="h-6 w-6 animate-spin" />
      </main>
    );
  }

  if (estado === "login") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-app p-4">
        <div className="w-full max-w-sm rounded-3xl border border-surface-600 bg-surface-800 p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500/15">
              <ShieldCheck className="h-5 w-5 text-indigo-300" />
            </div>
            <div>
              <h1 className="font-black text-gray-100">Consola de plataforma</h1>
              <p className="text-xs text-muted">Solo para el dueño del sistema</p>
            </div>
          </div>
          {!habilitada ? (
            <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-300">
              Deshabilitada: define la variable <code>PLATAFORMA_TOKEN</code> (24+ caracteres) en el servidor.
            </p>
          ) : (
            <>
              <label className="block">
                <span className="mb-1 block text-xs text-muted">Clave de plataforma</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={clave}
                  onChange={(e) => setClave(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && entrar()}
                  className="input-dark"
                />
              </label>
              {error && <p className="mt-2 text-xs font-semibold text-rose-300">{error}</p>}
              <button type="button" onClick={entrar} className="btn-primary mt-4 flex w-full items-center justify-center gap-2 py-2.5">
                <KeyRound className="h-4 w-4" /> Entrar
              </button>
              <p className="mt-3 text-[11px] text-muted">
                No es la cuenta de un negocio: los negocios entran por /login con su código, usuario y contraseña.
              </p>
            </>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-app p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500/15">
              <Building2 className="h-5 w-5 text-indigo-300" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-gray-100">Negocios en la plataforma</h1>
              <p className="text-sm text-muted">Alta, suspensión y soporte de cada negocio.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setAlta(true)} className="btn-primary flex items-center gap-2 px-4 py-2.5 text-sm">
              <Plus className="h-4 w-4" /> Nuevo negocio
            </button>
            <button type="button" onClick={cargar} aria-label="Actualizar" className="rounded-xl border border-surface-600 px-3 text-muted hover:text-gray-100">
              <RefreshCw className="h-4 w-4" />
            </button>
            <button type="button" onClick={salir} className="flex items-center gap-2 rounded-xl border border-surface-600 px-3 text-sm text-muted hover:text-rose-300">
              <LogOut className="h-4 w-4" /> Salir
            </button>
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Negocios activos", String(totales.activos)],
            ["Suspendidos", String(totales.suspendidos)],
            ["Sin terminar su configuración", String(totales.pendientes)],
            ["Ventas de todos (30 días)", dinero(totales.importe)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl border border-surface-600 bg-surface-800 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{k}</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-gray-100">{v}</p>
            </div>
          ))}
        </div>

        {aviso && (
          <p className="flex items-center justify-between gap-2 rounded-xl border border-surface-600 bg-surface-800 px-4 py-2 text-sm text-gray-100">
            {aviso}
            <button type="button" onClick={() => setAviso(null)} aria-label="Cerrar aviso" className="text-muted">
              <X className="h-4 w-4" />
            </button>
          </p>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o código" className="input-dark pl-9" />
        </div>

        <div className="overflow-x-auto rounded-2xl border border-surface-600 bg-surface-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-600 text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="px-4 py-3">Negocio</th>
                <th className="px-4 py-3">Giro</th>
                <th className="px-4 py-3 text-right">Ventas 30 días</th>
                <th className="px-4 py-3">Última venta</th>
                <th className="px-4 py-3 text-right">Usuarios · Productos · Sucursales</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((n) => (
                <tr key={n.idNegocio} className={cn("border-b border-surface-700 last:border-0", !n.activo && "opacity-60")}>
                  <td className="px-4 py-3">
                    <p className="font-bold text-gray-100">{n.nombre}</p>
                    <p className="text-[11px] text-muted">
                      código <span className="font-mono">{n.codigo}</span>
                      {n.setupPendiente && <span className="ml-1 text-amber-300">· configuración pendiente</span>}
                      {!n.activo && <span className="ml-1 font-bold text-rose-300">· SUSPENDIDO</span>}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-muted">{n.giro ? TIPO_NEGOCIO[n.giro] : "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <p className="font-bold tabular-nums text-gray-100">{dinero(n.importe30)}</p>
                    <p className="text-[11px] text-muted">{n.ventas30} tickets</p>
                  </td>
                  <td className="px-4 py-3 text-muted">{hace(n.ultimaVenta)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted">
                    {n.usuarios} · {n.productos} · {n.sucursales}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const nueva = window.prompt(`Nueva contraseña para la administradora de ${n.nombre} (mínimo 8 caracteres):`);
                          if (nueva) accion(n, { nuevaClaveAdmin: nueva }, `Contraseña restablecida en ${n.nombre}`);
                        }}
                        title="Restablecer contraseña de la administradora"
                        aria-label={`Restablecer contraseña de ${n.nombre}`}
                        className="rounded-lg border border-surface-500 p-2 text-muted hover:text-gray-100"
                      >
                        <KeyRound className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const msg = n.activo
                            ? `¿Suspender ${n.nombre}? Nadie de ese negocio podrá entrar hasta reactivarlo.`
                            : `¿Reactivar ${n.nombre}?`;
                          if (window.confirm(msg)) accion(n, { activo: !n.activo }, n.activo ? `${n.nombre} suspendido` : `${n.nombre} reactivado`);
                        }}
                        title={n.activo ? "Suspender" : "Reactivar"}
                        aria-label={`${n.activo ? "Suspender" : "Reactivar"} ${n.nombre}`}
                        className={cn(
                          "rounded-lg border p-2",
                          n.activo ? "border-rose-500/40 text-rose-300 hover:bg-rose-500/10" : "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                        )}
                      >
                        {n.activo ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted">
                    Sin negocios que coincidan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {alta && (
        <AltaNegocio
          onClose={() => setAlta(false)}
          onCreado={(texto) => {
            setAlta(false);
            setAviso(texto);
            cargar();
          }}
        />
      )}
    </main>
  );
}

function AltaNegocio({ onClose, onCreado }: { onClose: () => void; onCreado: (aviso: string) => void }) {
  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState("");
  const [codigoTocado, setCodigoTocado] = useState(false);
  const [giro, setGiro] = useState<TipoNegocio>("PAPELERIA_RETAIL");
  const [admin, setAdmin] = useState({ nombre: "", username: "admin", password: "" });
  const [ejemplos, setEjemplos] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const r = resumenCatalogo(giro);

  const crear = async () => {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/plataforma/negocios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, nombre, tipoNegocio: giro, catalogoEjemplo: ejemplos, admin }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "No se pudo crear");
      onCreado(
        `Negocio "${d.nombre}" creado. Entra en /login con el código ${d.codigo} y el usuario ${d.admin}` +
          (d.catalogo ? ` · ${d.catalogo.productos} productos de ejemplo` : "")
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-surface-600 bg-surface-800 p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-black text-gray-100">Nuevo negocio</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-muted hover:text-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Nombre del negocio</span>
            <input
              value={nombre}
              maxLength={120}
              onChange={(e) => {
                setNombre(e.target.value);
                if (!codigoTocado) setCodigo(sugerirCodigo(e.target.value));
              }}
              placeholder="Ferretería El Tornillo"
              className="input-dark"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Código para iniciar sesión</span>
            <input
              value={codigo}
              maxLength={40}
              onChange={(e) => {
                setCodigoTocado(true);
                setCodigo(e.target.value.toLowerCase());
              }}
              className="input-dark font-mono"
            />
            <span className="mt-1 block text-[11px] text-muted">Minúsculas, números y guiones; lo teclean al entrar.</span>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Giro</span>
            <select value={giro} onChange={(e) => setGiro(e.target.value as TipoNegocio)} className="input-dark">
              {Object.entries(TIPO_NEGOCIO).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setEjemplos((v) => !v)}
            aria-pressed={ejemplos}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl border bg-surface-700 p-3 text-left",
              ejemplos ? "border-emerald-500/50" : "border-surface-500"
            )}
          >
            <CheckCircle2 className={cn("h-5 w-5 shrink-0", ejemplos ? "text-emerald-300" : "text-muted")} />
            <span className="text-xs text-gray-200">
              Cargar catálogo de ejemplo: {r.productos} productos en {r.categorias} categorías (códigos EJ-).
            </span>
          </button>
          <p className="pt-1 text-xs font-bold uppercase tracking-wider text-muted">Administradora del negocio</p>
          <input
            value={admin.nombre}
            onChange={(e) => setAdmin({ ...admin, nombre: e.target.value })}
            placeholder="Nombre completo"
            className="input-dark"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              value={admin.username}
              onChange={(e) => setAdmin({ ...admin, username: e.target.value })}
              placeholder="Usuario"
              className="input-dark"
            />
            <input
              type="password"
              autoComplete="new-password"
              value={admin.password}
              onChange={(e) => setAdmin({ ...admin, password: e.target.value })}
              placeholder="Contraseña (8+)"
              className="input-dark"
            />
          </div>
          {error && <p className="text-xs font-semibold text-rose-300">{error}</p>}
          <button
            type="button"
            disabled={enviando}
            onClick={crear}
            className="btn-primary flex w-full items-center justify-center gap-2 py-2.5 disabled:opacity-60"
          >
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Crear negocio
          </button>
        </div>
      </div>
    </div>
  );
}
