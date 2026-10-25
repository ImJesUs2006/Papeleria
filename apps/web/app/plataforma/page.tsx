"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart3,
  Building2,
  Crown,
  Download,
  KeyRound,
  LifeBuoy,
  Loader2,
  LogOut,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  ScrollText,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
  X,
} from "lucide-react";
import { MODULOS_INFO, TIPO_NEGOCIO, type FeatureFlags, type TipoNegocio } from "@/lib/business-types";
import { SetupWizard } from "@/components/setup/setup-wizard";
import { useColoresTema } from "@/hooks/use-colores-tema";
import { cn } from "@/lib/utils";
import { confirmar, pedirTexto } from "@/store/dialogo";
import { DialogoHost } from "@/components/dialogo-host";
import { descargarBase64 } from "@/lib/descargar";

// ============================================================
// Consola de PLATAFORMA: solo para el dueño del SaaS. Tablero con gráficas,
// lista de negocios con su ficha (usuarios, módulos, bitácora), alta de
// negocios con el mismo asistente de configuración inicial, exportación a
// Excel y bitácora de todo lo que se hace desde aquí.
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
const dineroCorto = (n: number) => (n >= 1000 ? `$${(n / 1000).toLocaleString("es-MX", { maximumFractionDigits: 1 })}k` : `$${Math.round(n)}`);
const fechaHora = (f: string | null) => (f ? new Date(f).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : "Nunca");

function hace(fecha: string | null): string {
  if (!fecha) return "Sin ventas";
  const dias = Math.floor((Date.now() - new Date(fecha).getTime()) / 86_400_000);
  return dias === 0 ? "Hoy" : dias === 1 ? "Ayer" : `Hace ${dias} días`;
}

async function patch(idNegocio: string, cuerpo: object) {
  const r = await fetch(`/api/plataforma/negocios/${idNegocio}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "No se pudo completar");
  return d;
}

export default function ConsolaPlataforma() {
  const [estado, setEstado] = useState<"cargando" | "login" | "dentro">("cargando");
  const [habilitada, setHabilitada] = useState(true);
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [negocios, setNegocios] = useState<NegocioFila[]>([]);
  const [pestana, setPestana] = useState<"tablero" | "negocios" | "bitacora">("tablero");
  const [alta, setAlta] = useState(false);
  const [ficha, setFicha] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const cargar = useCallback(async () => {
    const r = await fetch("/api/plataforma/negocios", { cache: "no-store" });
    if (r.status === 401) return setEstado("login");
    const d = await r.json();
    setNegocios(d.negocios ?? []);
    setEstado("dentro");
    setVersion((v) => v + 1);
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
              <h1 className="text-2xl font-black text-gray-100">Consola de plataforma</h1>
              <p className="text-sm text-muted">Tus negocios, su actividad y el soporte, en un solo lugar.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setAlta(true)} className="btn-primary flex items-center gap-2 px-4 py-2.5 text-sm">
              <Plus className="h-4 w-4" /> Nuevo negocio
            </button>
            <a
              href="/api/plataforma/exportar"
              className="flex items-center gap-2 rounded-xl border border-surface-600 px-3 text-sm text-muted hover:text-gray-100"
            >
              <Download className="h-4 w-4" /> Excel
            </a>
            <button type="button" onClick={cargar} aria-label="Actualizar" className="rounded-xl border border-surface-600 px-3 text-muted hover:text-gray-100">
              <RefreshCw className="h-4 w-4" />
            </button>
            <button type="button" onClick={salir} className="flex items-center gap-2 rounded-xl border border-surface-600 px-3 text-sm text-muted hover:text-rose-300">
              <LogOut className="h-4 w-4" /> Salir
            </button>
          </div>
        </header>

        {aviso && (
          <p className="flex items-center justify-between gap-2 rounded-xl border border-surface-600 bg-surface-800 px-4 py-2 text-sm text-gray-100" data-testid="aviso-plataforma">
            {aviso}
            <button type="button" onClick={() => setAviso(null)} aria-label="Cerrar aviso" className="text-muted">
              <X className="h-4 w-4" />
            </button>
          </p>
        )}

        <div className="flex gap-2" role="tablist">
          {(
            [
              ["tablero", "Tablero", BarChart3],
              ["negocios", `Negocios (${negocios.length})`, Building2],
              ["bitacora", "Bitácora", ScrollText],
            ] as const
          ).map(([id, etiqueta, Icono]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={pestana === id}
              onClick={() => setPestana(id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold",
                pestana === id ? "border-acento bg-acento/10 text-acento" : "border-surface-500 text-slate-300 hover:bg-surface-700"
              )}
            >
              <Icono className="h-4 w-4" /> {etiqueta}
            </button>
          ))}
        </div>

        {pestana === "tablero" && <Tablero negocios={negocios} version={version} onAbrir={setFicha} />}
        {pestana === "negocios" && <ListaNegocios negocios={negocios} onAbrir={setFicha} />}
        {pestana === "bitacora" && <Bitacora version={version} />}
      </div>

      {alta && (
        <SetupWizard
          plataforma={{
            onCancelar: () => setAlta(false),
            onTerminado: (mensaje) => {
              setAlta(false);
              setAviso(mensaje);
              cargar();
            },
          }}
        />
      )}
      {ficha && (
        <FichaNegocio
          idNegocio={ficha}
          onClose={() => setFicha(null)}
          onCambio={(msg) => {
            setAviso(msg);
            cargar();
          }}
        />
      )}
      <DialogoHost />
    </main>
  );
}

// ---------------------------------------------------------------- Tablero

function Tablero({ negocios, version, onAbrir }: { negocios: NegocioFila[]; version: number; onAbrir: (id: string) => void }) {
  const colores = useColoresTema();
  const [datos, setDatos] = useState<{
    ventasPorDia: Array<{ dia: string; total: number }>;
    porGiro: Array<{ giro: string; negocios: number }>;
    altasPorMes: Array<{ mes: string; altas: number }>;
    inactivos: Array<{ idNegocio: string; nombre: string; codigo: string; ultimaVenta: string | null }>;
  } | null>(null);
  useEffect(() => {
    fetch("/api/plataforma/tablero", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setDatos)
      .catch(() => setDatos(null));
  }, [version]);
  const totales = useMemo(
    () => ({
      activos: negocios.filter((n) => n.activo).length,
      suspendidos: negocios.filter((n) => !n.activo).length,
      pendientes: negocios.filter((n) => n.setupPendiente).length,
      importe: negocios.reduce((s, n) => s + n.importe30, 0),
    }),
    [negocios]
  );
  const tooltip = {
    contentStyle: { background: colores.tooltipFondo, border: `1px solid ${colores.tooltipBorde}`, borderRadius: 12, color: colores.texto },
  };

  return (
    <div className="space-y-4" data-testid="tablero-plataforma">
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
      {!datos ? (
        <p className="flex items-center gap-2 py-8 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando gráficas…
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-surface-600 bg-surface-800 p-5 lg:col-span-2">
            <h3 className="mb-3 font-bold text-gray-100">Ventas de todos los negocios (30 días)</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={datos.ventasPorDia} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={colores.rejilla} />
                  <XAxis dataKey="dia" tickFormatter={(d) => d.slice(8) + "/" + d.slice(5, 7)} tick={{ fill: colores.textoSuave, fontSize: 10 }} minTickGap={16} />
                  <YAxis tickFormatter={dineroCorto} tick={{ fill: colores.textoSuave, fontSize: 10 }} />
                  <Tooltip {...tooltip} formatter={(v: any) => [dinero(Number(v)), "Vendido"]} />
                  <Area type="monotone" dataKey="total" stroke={colores.serie[1]} fill={colores.serie[1]} fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="rounded-2xl border border-surface-600 bg-surface-800 p-5">
            <h3 className="mb-3 font-bold text-gray-100">Negocios por giro</h3>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={datos.porGiro} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={colores.rejilla} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fill: colores.textoSuave, fontSize: 10 }} />
                  <YAxis type="category" dataKey="giro" width={110} tick={{ fill: colores.textoSuave, fontSize: 10 }} />
                  <Tooltip {...tooltip} formatter={(v: any) => [v, "Negocios"]} />
                  <Bar dataKey="negocios" fill={colores.serie[0]} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="rounded-2xl border border-surface-600 bg-surface-800 p-5">
            <h3 className="mb-3 font-bold text-gray-100">Altas de negocios por mes</h3>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={datos.altasPorMes} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={colores.rejilla} />
                  <XAxis dataKey="mes" tick={{ fill: colores.textoSuave, fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fill: colores.textoSuave, fontSize: 10 }} />
                  <Tooltip {...tooltip} formatter={(v: any) => [v, "Altas"]} />
                  <Bar dataKey="altas" fill={colores.serie[2]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="rounded-2xl border border-surface-600 bg-surface-800 p-5 lg:col-span-2">
            <h3 className="mb-1 font-bold text-gray-100">Negocios activos sin ventas en 7 días</h3>
            <p className="mb-3 text-xs text-muted">Puede ser que no estén usando el sistema: buen momento para contactarlos.</p>
            {datos.inactivos.length === 0 ? (
              <p className="text-sm text-emerald-300">Todos los negocios activos vendieron esta semana.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {datos.inactivos.map((n) => (
                  <li key={n.idNegocio}>
                    <button
                      type="button"
                      onClick={() => onAbrir(n.idNegocio)}
                      className="flex w-full items-center justify-between rounded-xl border border-surface-600 px-3 py-2 text-left text-sm hover:border-acento/50"
                    >
                      <span className="truncate text-gray-100">{n.nombre}</span>
                      <span className="shrink-0 text-xs text-muted">{hace(n.ultimaVenta)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Negocios

function ListaNegocios({ negocios, onAbrir }: { negocios: NegocioFila[]; onAbrir: (id: string) => void }) {
  const [q, setQ] = useState("");
  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? negocios.filter((n) => `${n.nombre} ${n.codigo}`.toLowerCase().includes(t)) : negocios;
  }, [negocios, q]);
  return (
    <div className="space-y-3">
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
            </tr>
          </thead>
          <tbody>
            {visibles.map((n) => (
              <tr
                key={n.idNegocio}
                onClick={() => onAbrir(n.idNegocio)}
                className={cn("cursor-pointer border-b border-surface-700 last:border-0 hover:bg-surface-700/50", !n.activo && "opacity-60")}
                data-testid="fila-negocio"
              >
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
              </tr>
            ))}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted">
                  Sin negocios que coincidan.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Toca un negocio para ver su ficha, sus usuarios y darles soporte.</p>
    </div>
  );
}

// ---------------------------------------------------------------- Ficha

interface Ficha {
  negocio: {
    idNegocio: string;
    codigo: string;
    nombre: string;
    activo: boolean;
    creado: string;
    permitirSoporte: boolean;
    terminosAceptadosEn: string | null;
    giro: TipoNegocio | null;
    setupPendiente: boolean;
    modulos: string[];
    metodosPago: string[];
    productos: number;
    clientes: number;
    sucursales: number;
    ventas30: number;
    importe30: number;
  };
  usuarios: Array<{ idPersona: string; nombre: string; username: string; tipo: string; esDueno: boolean; activa: boolean; ultimoAcceso: string | null }>;
  bitacora: Array<{ fecha: string; accion: string; usuario: string }>;
}

function FichaNegocio({ idNegocio, onClose, onCambio }: { idNegocio: string; onClose: () => void; onCambio: (msg: string) => void }) {
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cargar = useCallback(() => {
    fetch(`/api/plataforma/negocios/${idNegocio}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "No se pudo abrir el negocio");
        setFicha(d);
      })
      .catch((e) => setError(e.message));
  }, [idNegocio]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  const accion = async (cuerpo: object, exito: string) => {
    try {
      await patch(idNegocio, cuerpo);
      onCambio(exito);
      cargar();
    } catch (e: any) {
      setError(e.message);
    }
  };
  const n = ficha?.negocio;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60" onClick={onClose}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-xl overflow-y-auto border-l border-surface-600 bg-surface-800 p-6"
        data-testid="ficha-negocio"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-gray-100">{n?.nombre ?? "…"}</h2>
            {n && (
              <p className="text-xs text-muted">
                código <span className="font-mono">{n.codigo}</span> · {n.giro ? TIPO_NEGOCIO[n.giro] : "sin giro"} · alta{" "}
                {new Date(n.creado).toLocaleDateString("es-MX")}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar ficha" className="text-muted hover:text-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        {error && <p className="mb-3 rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}
        {!ficha || !n ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted" />
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                ["Ventas 30 días", dinero(n.importe30)],
                ["Tickets", String(n.ventas30)],
                ["Productos", String(n.productos)],
                ["Clientes", String(n.clientes)],
                ["Sucursales", String(n.sucursales)],
                ["Estado", n.activo ? "Activo" : "Suspendido"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-surface-700/60 p-2">
                  <p className="text-sm font-black text-gray-100">{v}</p>
                  <p className="text-[10px] text-muted">{k}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  const ok = await confirmar(
                    n.activo
                      ? { titulo: `¿Suspender ${n.nombre}?`, mensaje: "Nadie de ese negocio podrá entrar.", aceptar: "Suspender", peligro: true }
                      : { titulo: `¿Reactivar ${n.nombre}?`, aceptar: "Reactivar" }
                  );
                  if (ok) accion({ activo: !n.activo }, n.activo ? `${n.nombre} suspendido` : `${n.nombre} reactivado`);
                }}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold",
                  n.activo ? "border-rose-500/40 text-rose-300 hover:bg-rose-500/10" : "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                )}
              >
                {n.activo ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
                {n.activo ? "Suspender negocio" : "Reactivar negocio"}
              </button>
              <button
                type="button"
                data-testid="entrar-soporte"
                disabled={!n.activo || !n.permitirSoporte}
                title={n.permitirSoporte ? "Abre el negocio como su dueño(a) durante 1 hora" : "El negocio no permite el acceso de soporte"}
                onClick={async () => {
                  const ok = await confirmar({
                    titulo: `¿Entrar a ${n.nombre} como soporte?`,
                    mensaje:
                      "Se abre una sesión de 1 hora como su dueño(a), con un aviso visible. No podrás transferir la propiedad, reiniciar el sistema ni purgar la bitácora. La entrada queda registrada en la bitácora del negocio.",
                    aceptar: "Entrar",
                  });
                  if (!ok) return;
                  const r = await fetch(`/api/plataforma/negocios/${idNegocio}/soporte`, { method: "POST" });
                  const d = await r.json().catch(() => ({}));
                  if (!r.ok) return setError(d.error || "No se pudo entrar");
                  window.open(d.destino || "/dashboard", "_blank");
                  cargar();
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-500/40 px-3 py-2 text-sm font-bold text-amber-300 hover:bg-amber-500/10 disabled:opacity-40"
              >
                <LifeBuoy className="h-4 w-4" /> Entrar como soporte
              </button>
            </div>
            <p className="text-xs text-muted">
              {n.permitirSoporte ? "El negocio permite el acceso de soporte." : "El dueño(a) bloqueó el acceso de soporte."}{" "}
              {n.terminosAceptadosEn
                ? `Términos aceptados el ${new Date(n.terminosAceptadosEn).toLocaleDateString("es-MX")}.`
                : "Aún no acepta los términos vigentes."}
            </p>

            <section>
              <h3 className="mb-2 text-sm font-bold text-gray-100">Módulos encendidos</h3>
              <div className="flex flex-wrap gap-1.5">
                {n.modulos.length === 0 ? (
                  <span className="text-xs text-muted">{n.setupPendiente ? "Configuración pendiente" : "Ninguno"}</span>
                ) : (
                  n.modulos.map((m) => (
                    <span key={m} className="rounded-full border border-surface-500 px-2 py-0.5 text-[11px] text-gray-200">
                      {MODULOS_INFO[m as keyof FeatureFlags]?.label ?? m}
                    </span>
                  ))
                )}
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-bold text-gray-100">Usuarios ({ficha.usuarios.length})</h3>
              <ul className="space-y-1.5">
                {ficha.usuarios.map((u) => (
                  <li key={u.idPersona} className="flex items-center gap-2 rounded-xl border border-surface-600 px-3 py-2" data-testid="usuario-negocio">
                    <div className="min-w-0 flex-1">
                      <p className={cn("truncate text-sm font-bold", u.activa ? "text-gray-100" : "text-muted line-through")}>
                        {u.esDueno && <Crown className="mr-1 inline h-3.5 w-3.5 text-amber-300" />}
                        {u.nombre}
                      </p>
                      <p className="text-[11px] text-muted">
                        @{u.username} · {u.tipo} · último acceso {fechaHora(u.ultimoAcceso)}
                      </p>
                    </div>
                    <button
                      type="button"
                      title="Restablecer contraseña"
                      aria-label={`Restablecer contraseña de ${u.nombre}`}
                      onClick={async () => {
                        const nueva = await pedirTexto({
                          titulo: `Nueva contraseña para ${u.nombre}`,
                          etiqueta: "Mínimo 8 caracteres",
                          tipo: "password",
                          aceptar: "Restablecer",
                          validar: (v) => (v.length < 8 ? "Debe tener al menos 8 caracteres" : null),
                        });
                        if (nueva) accion({ usuario: { idPersona: u.idPersona, nuevaClave: nueva } }, `Contraseña de ${u.username} restablecida`);
                      }}
                      className="rounded-lg border border-surface-500 p-1.5 text-muted hover:text-gray-100"
                    >
                      <KeyRound className="h-4 w-4" />
                    </button>
                    {!u.esDueno && (
                      <button
                        type="button"
                        title={u.activa ? "Desactivar usuario" : "Reactivar usuario"}
                        aria-label={`${u.activa ? "Desactivar" : "Reactivar"} a ${u.nombre}`}
                        onClick={() =>
                          accion({ usuario: { idPersona: u.idPersona, activa: !u.activa } }, `${u.username} ${u.activa ? "desactivado" : "reactivado"}`)
                        }
                        className="rounded-lg border border-surface-500 p-1.5 text-muted hover:text-gray-100"
                      >
                        {u.activa ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-bold text-gray-100">Actividad reciente del negocio</h3>
              <ul className="space-y-1 text-xs">
                {ficha.bitacora.map((b, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="shrink-0 text-muted">{fechaHora(b.fecha)}</span>
                    <span className="text-gray-200">{b.accion}</span>
                  </li>
                ))}
                {ficha.bitacora.length === 0 && <li className="text-muted">Sin actividad todavía.</li>}
              </ul>
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------- Bitácora

function Bitacora({ version }: { version: number }) {
  const [registros, setRegistros] = useState<Array<{ id: string; fecha: string; accion: string; negocio: string | null }> | null>(null);
  const [meses, setMeses] = useState(3);
  const [recarga, setRecarga] = useState(0);
  const [mensaje, setMensaje] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/plataforma/bitacora", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { registros: [] }))
      .then((d) => setRegistros(d.registros ?? []))
      .catch(() => setRegistros([]));
  }, [version, recarga]);

  const purgar = async () => {
    const clave = await pedirTexto({
      titulo: `Purgar lo de hace más de ${meses} ${meses === 1 ? "mes" : "meses"}`,
      mensaje: "Se descarga un respaldo en Excel y después se borran esos registros. No se puede deshacer.",
      etiqueta: "Clave de plataforma para confirmar",
      tipo: "password",
      aceptar: "Purgar",
      peligro: true,
    });
    if (!clave) return;
    const r = await fetch("/api/plataforma/bitacora/purgar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clave, meses }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setMensaje(d.error || "No se pudo purgar");
    if (d.respaldoXlsx) descargarBase64(d.respaldoXlsx, d.archivo);
    setMensaje(d.purgados ? `${d.purgados} registros purgados; el respaldo se descargó.` : "No hay registros tan antiguos.");
    setRecarga((n) => n + 1);
  };

  return (
    <section className="rounded-2xl border border-surface-600 bg-surface-800 p-5" data-testid="bitacora-plataforma">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="mb-1 font-bold text-gray-100">Lo que se hizo desde la consola</h3>
          <p className="text-xs text-muted">Altas, suspensiones, contraseñas restablecidas, exportaciones e inicios de sesión.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={meses}
            onChange={(e) => setMeses(Number(e.target.value))}
            aria-label="Antigüedad a purgar"
            className="rounded-lg border border-surface-500 bg-surface-700 px-2 py-1.5 text-xs text-gray-100"
          >
            {[1, 3, 6, 12, 24].map((m) => (
              <option key={m} value={m}>
                Más de {m} {m === 1 ? "mes" : "meses"}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={purgar}
            data-testid="purgar-consola"
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-500/10"
          >
            <Trash2 className="h-3.5 w-3.5" /> Purgar
          </button>
        </div>
      </div>
      {mensaje && <p className="mb-3 text-xs text-gray-200">{mensaje}</p>}
      {!registros ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted" />
      ) : registros.length === 0 ? (
        <p className="text-sm text-muted">Sin registros todavía.</p>
      ) : (
        <ul className="divide-y divide-surface-700 text-sm">
          {registros.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 py-2">
              <span className="w-32 shrink-0 text-xs text-muted">{fechaHora(r.fecha)}</span>
              <span className="min-w-0 flex-1 text-gray-100">{r.accion}</span>
              {r.negocio && <span className="font-mono text-[11px] text-muted">{r.negocio}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
