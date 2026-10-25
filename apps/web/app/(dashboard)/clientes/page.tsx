"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Search,
  Plus,
  Coins,
  History,
  Pencil,
  Trash2,
  UserX,
  Phone,
  ShoppingBag,
  Eye,
  EyeOff,
  CalendarClock,
  FileCheck2,
  ShoppingCart,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { VirtualCard } from "@/components/pos/virtual-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/store/auth";
import { useCartStore } from "@/store/cart";
import { notificar } from "@/store/notificaciones";
import { CLIENTE_SCHEMA, enmascarar } from "@/lib/clientes";
import { validar } from "@/lib/validacion";
import { REGIMENES_FISCALES } from "@/lib/sat-catalogos";
import { clienteADatosFiscales, DatosFiscalesEditor, datosFiscalesACliente, erroresClienteAEditor } from "@/components/configuracion/datos-fiscales";
import type { DatosFiscales } from "@/lib/business-types";
import { confirmar } from "@/store/dialogo";

interface ClienteFila {
  idCliente: string;
  nombre: string;
  telefono: string | null;
  saldoDeudor: number;
  puntosFidelidad: number;
  nivel: "MENUDEO" | "MAYOREO";
  montoHistorico: number;
  /** Fase 12: datos fiscales (requeridos para poder facturar). */
  rfc?: string | null;
  razonSocial?: string | null;
  email?: string | null;
  facturable?: boolean;
}

interface Perfil {
  visitas: number;
  totalComprado: number;
  ticketPromedio: number;
  ultimaVisita: string | null;
  frecuenciaDias: number | null;
  proximaVisita: string | null;
  estado: "NUEVO" | "AL_DIA" | "POR_VOLVER" | "ATRASADO";
}

interface Favorito {
  codigoItem: string;
  descripcion: string;
  precioUnitario: number | null;
  cantidad: number;
  veces: number;
}

const ESTADO_PERFIL: Record<Perfil["estado"], { texto: string; cls: string }> = {
  NUEVO: { texto: "Cliente nuevo", cls: "bg-surface-600 text-muted" },
  AL_DIA: { texto: "Al día", cls: "bg-emerald-500/15 text-emerald-300" },
  POR_VOLVER: { texto: "Le toca surtirse", cls: "bg-sky-500/15 text-sky-300" },
  ATRASADO: { texto: "No ha vuelto", cls: "bg-amber-500/15 text-amber-300" },
};

interface VentaHistorial {
  folioVenta: string;
  fechaHora: string;
  totalNeto: number;
  metodoPago: string;
  estado: string;
  devoluciones: number;
}

interface ClienteDetalle extends ClienteFila {
  equivalenciaPesos: number;
  totalVentas: number;
  regimenFiscal?: string | null;
  codigoPostalFiscal?: string | null;
  usoCfdi?: string | null;
  calle?: string | null;
  numExt?: string | null;
  numInt?: string | null;
  colonia?: string | null;
  municipio?: string | null;
  estado?: string | null;
  notas?: string | null;
  faltantesFiscales?: string[];
  datosCompletos?: boolean;
}

const METODO_LABEL: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA: "Tarjeta",
  TARJETA_TERMINAL: "Tarjeta",
  DIGITAL: "Transferencia",
  TRANSFERENCIA: "Transferencia",
  PUNTOS_MONEDERO: "Puntos",
};

/** Formato monetario seguro: nunca revienta con undefined/null/NaN. */
const money = (v: unknown): string => `$${(Number(v) || 0).toFixed(2)}`;

export default function ClientesPage() {
  const [clientes, setClientes] = useState<ClienteFila[]>([]);
  const [q, setQ] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selId, setSelId] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<ClienteDetalle | null>(null);
  const [historial, setHistorial] = useState<VentaHistorial[]>([]);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [favoritos, setFavoritos] = useState<Favorito[]>([]);
  // La administradora recibe los datos completos, pero se muestran
  // enmascarados hasta que pulse el ojo (pantalla compartida en mostrador).
  const [mostrarDatos, setMostrarDatos] = useState(false);
  const esAdmin = useAuthStore((s) => s.rol) === "ADMINISTRADORA";
  const router = useRouter();
  const addItem = useCartStore((s) => s.addItem);
  const setClienteCarrito = useCartStore((s) => s.setCliente);

  // Formulario (alta / edición)
  const [formAbierto, setFormAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  // Datos fiscales del cliente (receptor del CFDI): mismo editor que el negocio.
  const [fiscal, setFiscal] = useState<DatosFiscales>({});
  const [email, setEmail] = useState("");
  const [notas, setNotas] = useState("");
  const [erroresCampo, setErroresCampo] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const cargarLista = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/clientes?q=${encodeURIComponent(q)}&limit=100`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("No se pudo cargar el padrón de clientes");
      const data = await res.json();
      setClientes(Array.isArray(data.clientes) ? data.clientes : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
      setClientes([]);
    } finally {
      setCargando(false);
    }
  }, [q]);

  useEffect(() => {
    // Debounce ligero para no golpear el endpoint en cada tecla.
    const t = setTimeout(() => {
      void cargarLista();
    }, 250);
    return () => clearTimeout(t);
  }, [cargarLista]);

  const cargarDetalle = useCallback(async (id: string) => {
    setCargandoDetalle(true);
    try {
      const res = await fetch(`/api/clientes/${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("No se pudo cargar la ficha del cliente");
      const data = await res.json();
      setDetalle(data.cliente ?? null);
      setHistorial(Array.isArray(data.ventas) ? data.ventas : []);
      setPerfil(data.perfil ?? null);
      setFavoritos(Array.isArray(data.favoritos) ? data.favoritos : []);
      setMostrarDatos(false);
    } catch (e) {
      setDetalle(null);
      setHistorial([]);
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCargandoDetalle(false);
    }
  }, []);

  const seleccionar = (id: string) => {
    setSelId(id);
    void cargarDetalle(id);
  };

  // Enlace desde las alertas: /clientes?id=...
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) {
      setSelId(id);
      void cargarDetalle(id);
    }
  }, [cargarDetalle]);

  const abrirAlta = () => {
    setEditandoId(null);
    setNombre("");
    setTelefono("");
    setFiscal({});
    setEmail("");
    setNotas("");
    setErroresCampo({});
    setFormError(null);
    setFormAbierto(true);
  };

  // La edición parte de la ficha completa (solo la administradora edita).
  const abrirEdicion = async (c: ClienteFila) => {
    const res = await fetch(`/api/clientes/${encodeURIComponent(c.idCliente)}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    const d: ClienteDetalle | undefined = data.cliente;
    if (!res.ok || !d) {
      notificar.error("No se pudo abrir la ficha del cliente");
      return;
    }
    setEditandoId(c.idCliente);
    setNombre(d.nombre);
    setTelefono(d.telefono ?? "");
    setFiscal(clienteADatosFiscales(d));
    setEmail(d.email ?? "");
    setNotas(d.notas ?? "");
    setErroresCampo({});
    setFormError(null);
    setFormAbierto(true);
  };

  // Favoritos del cliente directo al carrito (con su nombre en la venta).
  const llevarAlCarrito = async (lista: Favorito[]) => {
    if (!detalle) return;
    let agregados = 0;
    for (const f of lista) {
      const r = await fetch(`/api/productos/${encodeURIComponent(f.codigoItem)}`, { cache: "no-store" });
      if (!r.ok) continue;
      const p = await r.json();
      if (!p.esServicio && Number(p.stockActual) <= 0) continue;
      addItem({
        codigoItem: p.codigoItem,
        descripcion: p.descripcion,
        precioUnitario: Number(p.precioUnitario),
        cantidad: 1,
        permiteDecimales: p.permiteDecimales,
        esServicio: p.esServicio,
        precioMayoreo: p.precioMayoreo ?? null,
        escalasPrecio: p.escalasPrecio ?? null,
        tasaIva: p.tasaIva ?? null,
        exentoIva: p.exentoIva === true,
        tasaIeps: p.tasaIeps ?? null,
        idCategoria: p.idCategoria ?? null,
        usaSeries: p.usaSeries === true,
      });
      agregados++;
    }
    setClienteCarrito(detalle.idCliente, detalle.nombre, detalle.puntosFidelidad, detalle.nivel, detalle.montoHistorico);
    if (agregados) router.push("/cobro");
    else notificar.aviso("Sin existencia de esos productos");
  };

  const guardar = async () => {
    if (guardando) return;
    const cuerpo = {
      nombre,
      telefono: telefono || null,
      email: email || null,
      ...datosFiscalesACliente(fiscal),
      notas: notas.trim() || null,
    };
    // Mismas reglas que el servidor: el error aparece junto al campo.
    const v = validar(CLIENTE_SCHEMA, cuerpo);
    if (!v.ok) {
      setErroresCampo(v.campos);
      setFormError(v.error);
      return;
    }
    setErroresCampo({});
    setGuardando(true);
    setFormError(null);
    try {
      const esEdicion = editandoId !== null;
      const res = await fetch(
        esEdicion ? `/api/clientes/${encodeURIComponent(editandoId)}` : "/api/clientes",
        {
          method: esEdicion ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cuerpo),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErroresCampo(data?.campos ?? {});
        throw new Error(data?.error ?? "No se pudo guardar el cliente");
      }
      notificar.exito(esEdicion ? "Cliente actualizado" : "Cliente registrado", nombre.trim());
      setFormAbierto(false);
      await cargarLista();
      if (esEdicion && editandoId) void cargarDetalle(editandoId);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (c: ClienteFila) => {
    if (guardando) return;
    if (!(await confirmar({ titulo: `¿Eliminar a ${c.nombre}?`, mensaje: "Esta acción no se puede deshacer.", aceptar: "Eliminar", peligro: true }))) {
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch(`/api/clientes/${encodeURIComponent(c.idCliente)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "No se pudo eliminar");
      if (selId === c.idCliente) {
        setSelId(null);
        setDetalle(null);
        setHistorial([]);
      }
      await cargarLista();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <div className="p-6 space-y-4">
        <motion.div
          initial={{ y: -8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="flex flex-wrap items-end justify-between gap-3"
        >
          <div>
            <h2 className="text-2xl font-black text-gray-100">Clientes</h2>
            <p className="text-sm text-muted">
              Padrón, monedero de puntos, tarjeta de fidelidad e historial de compras.
            </p>
          </div>
          <button
            onClick={abrirAlta}
            className="inline-flex items-center gap-2 rounded-xl bg-acento px-4 py-2.5 text-sm font-bold text-btn-ink shadow-card hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Nuevo cliente
          </button>
        </motion.div>

        {error && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, teléfono, RFC o razón social..."
            className="w-full rounded-xl border border-surface-500 bg-surface-700 py-2.5 pl-10 pr-4 text-sm text-gray-100 outline-none focus:border-acento"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Listado */}
          <div className="space-y-2 lg:col-span-2">
            {cargando ? (
              <Skeleton className="h-64 w-full" />
            ) : clientes.length === 0 ? (
              <p className="rounded-xl border border-surface-600 bg-surface-800 px-4 py-6 text-center text-sm text-muted">
                {q
                  ? "Sin resultados para la búsqueda."
                  : "Aún no hay clientes registrados."}
              </p>
            ) : (
              clientes.map((c) => (
                <div
                  key={c.idCliente}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors ${
                    selId === c.idCliente
                      ? "border-acento/60 bg-surface-600"
                      : "border-surface-600 bg-surface-700 hover:bg-surface-600"
                  }`}
                >
                  <button
                    onClick={() => seleccionar(c.idCliente)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-sm font-bold text-gray-100">
                      {c.nombre}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {c.telefono ? enmascarar.telefono(c.telefono) : "Sin teléfono"}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 font-bold ${
                          c.nivel === "MAYOREO"
                            ? "bg-amber-500/15 text-amber-300"
                            : "bg-surface-600 text-slate-300"
                        }`}
                      >
                        {c.nivel}
                      </span>
                      <span className="inline-flex items-center gap-1 text-amber-300">
                        <Coins className="h-3 w-3" />
                        {Number(c.puntosFidelidad) || 0} pts
                      </span>
                      <span>Histórico: {money(c.montoHistorico)}</span>
                      {c.facturable && (
                        <span className="inline-flex items-center gap-1 text-emerald-300" title="Datos fiscales completos">
                          <FileCheck2 className="h-3 w-3" /> Facturable
                        </span>
                      )}
                      {Number(c.saldoDeudor) > 0 && (
                        <span className="text-rose-300">
                          Saldo a cobrar: {money(c.saldoDeudor)}
                        </span>
                      )}
                    </p>
                  </button>
                  {esAdmin && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => abrirEdicion(c)}
                        title="Editar"
                        aria-label={`Editar ${c.nombre}`}
                        className="rounded-lg border border-surface-500 p-2 text-slate-300 hover:bg-surface-600 hover:text-gray-100"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => eliminar(c)}
                        title="Eliminar"
                        aria-label={`Eliminar ${c.nombre}`}
                        className="rounded-lg border border-rose-500/40 p-2 text-rose-300 hover:bg-rose-500/20"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Ficha */}
          <div className="space-y-3">
            {!selId && !cargandoDetalle && (
              <div className="rounded-xl border border-dashed border-surface-600 bg-surface-800 px-4 py-8 text-center text-sm text-muted">
                Selecciona un cliente para ver su tarjeta y su historial.
              </div>
            )}

            {cargandoDetalle && <Skeleton className="h-64 w-full" />}

            {detalle && !cargandoDetalle && (
              <>
                <VirtualCard
                  nombre={detalle.nombre}
                  nivel={detalle.nivel}
                  puntos={Number(detalle.puntosFidelidad) || 0}
                  valorPuntoPesos={1}
                />

                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-surface-600 bg-surface-800 px-3 py-2 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-muted">
                      Compras
                    </p>
                    <p className="text-sm font-black text-gray-100">
                      {Number(detalle.totalVentas) || 0}
                    </p>
                  </div>
                  <div className="rounded-xl border border-surface-600 bg-surface-800 px-3 py-2 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-muted">
                      Histórico
                    </p>
                    <p className="text-sm font-black text-emerald-300">
                      {money(detalle.montoHistorico)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-surface-600 bg-surface-800 px-3 py-2 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-muted">
                      Puntos
                    </p>
                    <p className="text-sm font-black text-amber-300">
                      {money(detalle.equivalenciaPesos)}
                    </p>
                  </div>
                </div>

                {perfil && (
                  <div className="rounded-xl border border-surface-600 bg-surface-800 p-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h4 className="flex items-center gap-2 text-xs font-bold uppercase text-muted">
                        <CalendarClock className="h-3.5 w-3.5" /> Hábitos de compra
                      </h4>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ESTADO_PERFIL[perfil.estado].cls}`}>
                        {ESTADO_PERFIL[perfil.estado].texto}
                      </span>
                    </div>
                    <div className="space-y-1 text-xs">
                      <p className="flex justify-between text-muted">
                        <span>Ticket promedio</span>
                        <span className="font-bold text-gray-100">{money(perfil.ticketPromedio)}</span>
                      </p>
                      <p className="flex justify-between text-muted">
                        <span>Viene cada</span>
                        <span className="font-bold text-gray-100">
                          {perfil.frecuenciaDias ? `~${perfil.frecuenciaDias} días` : "Aún sin patrón (3+ compras)"}
                        </span>
                      </p>
                      <p className="flex justify-between text-muted">
                        <span>Última visita</span>
                        <span className="font-bold text-gray-100">
                          {perfil.ultimaVisita ? new Date(perfil.ultimaVisita).toLocaleDateString("es-MX") : "—"}
                        </span>
                      </p>
                      {perfil.proximaVisita && (
                        <p className="flex justify-between text-muted">
                          <span>Debería volver</span>
                          <span className="font-bold text-sky-300">
                            {new Date(perfil.proximaVisita).toLocaleDateString("es-MX", { day: "numeric", month: "long" })}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {favoritos.length > 0 && (
                  <div className="rounded-xl border border-surface-600 bg-surface-800 p-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h4 className="text-xs font-bold uppercase text-muted">Lo que más compra</h4>
                      <button
                        type="button"
                        onClick={() => llevarAlCarrito(favoritos.slice(0, 5))}
                        className="inline-flex items-center gap-1 rounded-lg bg-acento px-2.5 py-1 text-[11px] font-bold text-btn-ink"
                      >
                        <ShoppingCart className="h-3 w-3" /> Surtir sus 5 favoritos
                      </button>
                    </div>
                    <ul className="space-y-1">
                      {favoritos.map((f) => (
                        <li key={f.codigoItem} className="flex items-center justify-between gap-2 text-xs">
                          <span className="min-w-0 truncate text-gray-100" title={f.descripcion}>
                            {f.descripcion}
                          </span>
                          <span className="flex shrink-0 items-center gap-2 text-muted">
                            {f.cantidad} pzs · {f.veces} vez{f.veces === 1 ? "" : "es"}
                            <button
                              type="button"
                              onClick={() => llevarAlCarrito([f])}
                              aria-label={`Agregar ${f.descripcion} al carrito`}
                              className="rounded-md border border-surface-500 p-1 hover:text-acento"
                            >
                              <ShoppingCart className="h-3 w-3" />
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="rounded-xl border border-surface-600 bg-surface-800 p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h4 className="flex items-center gap-2 text-xs font-bold uppercase text-muted">
                      <FileCheck2 className="h-3.5 w-3.5" /> Contacto y datos fiscales
                    </h4>
                    {detalle.datosCompletos && (
                      <button
                        type="button"
                        onClick={() => setMostrarDatos((v) => !v)}
                        className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-gray-100"
                      >
                        {mostrarDatos ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        {mostrarDatos ? "Ocultar" : "Mostrar"}
                      </button>
                    )}
                  </div>
                  {(() => {
                    const ver = (valor: string | null | undefined, mascara: (v: string | null) => string | null) =>
                      detalle.datosCompletos && !mostrarDatos ? mascara(valor ?? null) : valor;
                    const filas: Array<[string, string | null | undefined]> = [
                      ["Teléfono", ver(detalle.telefono, enmascarar.telefono)],
                      ["Correo", ver(detalle.email, enmascarar.email)],
                      ["RFC", ver(detalle.rfc, enmascarar.rfc)],
                      ["Razón social", detalle.razonSocial],
                      ["Régimen", detalle.regimenFiscal ? `${detalle.regimenFiscal} · ${REGIMENES_FISCALES.find((r) => r.clave === detalle.regimenFiscal)?.nombre ?? ""}` : null],
                      ["C.P. fiscal", detalle.datosCompletos && !mostrarDatos && detalle.codigoPostalFiscal ? "•••••" : detalle.codigoPostalFiscal],
                      ["Uso de CFDI", detalle.usoCfdi],
                      [
                        "Domicilio fiscal",
                        detalle.datosCompletos && !mostrarDatos && detalle.calle
                          ? "•••••"
                          : [
                              [detalle.calle, detalle.numExt && `#${detalle.numExt}`, detalle.numInt && `int. ${detalle.numInt}`]
                                .filter(Boolean)
                                .join(" "),
                              detalle.colonia,
                              detalle.municipio,
                              detalle.estado,
                            ]
                              .filter(Boolean)
                              .join(", ") || null,
                      ],
                    ];
                    return (
                      <dl className="space-y-1 text-xs">
                        {filas.map(([k, v]) => (
                          <div key={k} className="flex justify-between gap-3">
                            <dt className="shrink-0 text-muted">{k}</dt>
                            <dd className="min-w-0 truncate text-right text-gray-100" title={v ?? undefined}>
                              {v || "—"}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    );
                  })()}
                  {detalle.faltantesFiscales && detalle.faltantesFiscales.length > 0 ? (
                    <p className="mt-2 rounded-lg bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-300">
                      Para facturarle falta: {detalle.faltantesFiscales.join(", ")}.
                    </p>
                  ) : (
                    <p className="mt-2 rounded-lg bg-emerald-500/10 px-2 py-1.5 text-[11px] text-emerald-300">
                      Datos fiscales completos: se le puede facturar.
                    </p>
                  )}
                  {detalle.notas && <p className="mt-2 text-[11px] text-muted">Notas: {detalle.notas}</p>}
                </div>

                <div className="rounded-xl border border-surface-600 bg-surface-800 p-4">
                  <h4 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase text-muted">
                    <History className="h-3.5 w-3.5" /> Historial de compras
                  </h4>
                  {historial.length === 0 ? (
                    <p className="text-xs text-muted">
                      Este cliente todavía no tiene compras registradas.
                    </p>
                  ) : (
                    <div className="max-h-72 space-y-2 overflow-auto">
                      {historial.map((v) => (
                        <div
                          key={v.folioVenta}
                          className="flex items-center justify-between gap-2 rounded-lg bg-surface-700 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-gray-100">
                              {v.folioVenta}
                            </p>
                            <p className="text-[11px] text-muted">
                              {new Date(v.fechaHora).toLocaleString("es-MX")}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-xs font-bold text-emerald-300">
                              {money(v.totalNeto)}
                            </p>
                            <p className="text-[11px] text-muted">
                              {METODO_LABEL[v.metodoPago] ?? v.metodoPago}
                              {v.estado !== "COMPLETADA" ? ` · ${v.estado}` : ""}
                              {v.devoluciones > 0 ? ` · ${v.devoluciones} dev.` : ""}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Modal alta / edición */}
        {formAbierto && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            onClick={() => !guardando && setFormAbierto(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-surface-600 bg-surface-800 p-5 shadow-card"
            >
              <div className="mb-4 flex items-center gap-2">
                {editandoId ? (
                  <Pencil className="h-4 w-4 text-acento" />
                ) : (
                  <UserX className="h-4 w-4 text-acento" />
                )}
                <h3 className="text-lg font-black text-gray-100">
                  {editandoId ? "Editar cliente" : "Nuevo cliente"}
                </h3>
              </div>

              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-muted">
                    Nombre completo *
                  </span>
                  <input
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    maxLength={80}
                    placeholder="Ej. María López"
                    className="w-full rounded-xl border border-surface-500 bg-surface-700 px-3 py-2 text-sm text-gray-100 outline-none focus:border-acento"
                  />
                  <ErrorCampo msg={erroresCampo.nombre} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-muted">
                    Teléfono
                  </span>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    maxLength={20}
                    placeholder="55 1234 5678"
                    className="w-full rounded-xl border border-surface-500 bg-surface-700 px-3 py-2 text-sm text-gray-100 outline-none focus:border-acento"
                  />
                  <ErrorCampo msg={erroresCampo.telefono} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-muted">Correo (para enviarle su factura)</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    maxLength={120}
                    placeholder="cliente@correo.com"
                    className="w-full rounded-xl border border-surface-500 bg-surface-700 px-3 py-2 text-sm text-gray-100 outline-none focus:border-acento"
                  />
                  <ErrorCampo msg={erroresCampo.email} />
                </label>
              </div>

              <div className="mt-4 rounded-xl border border-surface-600 p-3">
                <DatosFiscalesEditor
                  modo="receptor"
                  datos={fiscal}
                  onChange={setFiscal}
                  errores={erroresClienteAEditor(erroresCampo)}
                />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="col-span-2 block">
                  <span className="mb-1 block text-xs font-bold text-muted">Notas</span>
                  <input
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    maxLength={500}
                    placeholder="Ej. surte cada lunes para la escuela"
                    className="w-full rounded-xl border border-surface-500 bg-surface-700 px-3 py-2 text-sm text-gray-100 outline-none focus:border-acento"
                  />
                </label>
              </div>

              {formError && (
                <p className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                  {formError}
                </p>
              )}

              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => setFormAbierto(false)}
                  disabled={guardando}
                  className="rounded-xl border border-surface-500 px-4 py-2 text-sm font-bold text-slate-300 hover:bg-surface-700"
                >
                  Cancelar
                </button>
                <button
                  onClick={guardar}
                  disabled={guardando || nombre.trim().length < 2}
                  className="inline-flex items-center gap-2 rounded-xl bg-acento px-4 py-2 text-sm font-bold text-btn-ink shadow-card hover:opacity-90 disabled:opacity-40"
                >
                  <ShoppingBag className="h-4 w-4" />
                  {guardando ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </>
  );
}

function ErrorCampo({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <span className="mt-1 block text-[11px] font-semibold text-rose-300">{msg}</span>;
}
