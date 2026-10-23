"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Truck,
  Plus,
  Search,
  Pencil,
  UserX,
  CheckCircle2,
  Phone,
  Mail,
  Loader2,
  X,
  ShieldCheck,
  HandCoins,
  History,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { validar } from "@/lib/validacion";
import { PROVEEDOR_SCHEMA } from "@/lib/esquemas";
import { notificar } from "@/store/notificaciones";

interface Proveedor {
  idProveedor: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  contacto: string | null;
  limiteCredito: number | null;
  saldoCredito: number;
  diasCredito: number;
  activo: boolean;
}

interface CuentaPendiente {
  idCuenta: string;
  concepto: string;
  monto: number;
  saldo: number;
  fechaVencimiento: string;
  estado: "VENCIDA" | "VENCE_PRONTO" | "AL_CORRIENTE";
  dias: number;
}

function textoVencimiento(c: CuentaPendiente): string {
  if (c.dias < 0) return `Vencida hace ${-c.dias} día${c.dias === -1 ? "" : "s"}`;
  if (c.dias === 0) return "Vence hoy";
  return `Vence en ${c.dias} día${c.dias === 1 ? "" : "s"}`;
}

interface PagoProveedor {
  idPago: string;
  fechaHora: string;
  monto: number;
  metodoPago: string;
  referencia: string | null;
  notas: string | null;
  usuario: string;
}

const METODOS_ABONO = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
  { value: "TARJETA_TERMINAL", label: "Tarjeta (terminal)" },
  { value: "CHEQUE", label: "Cheque" },
];

const VACIO = {
  nombre: "",
  telefono: "",
  email: "",
  direccion: "",
  contacto: "",
  limiteCredito: "",
  diasCredito: "0",
};

export default function ProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<null | { modo: "crear" } | { modo: "editar"; p: Proveedor }>(null);
  const [form, setForm] = useState({ ...VACIO });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [erroresCampo, setErroresCampo] = useState<Record<string, string>>({});
  const [ayudaCredito, setAyudaCredito] = useState(false);

  // Abonos
  const [abono, setAbono] = useState<Proveedor | null>(null);
  const [abonoForm, setAbonoForm] = useState({ monto: "", metodoPago: "EFECTIVO", referencia: "" });
  const [abonando, setAbonando] = useState(false);
  const [abonoError, setAbonoError] = useState("");
  const [historial, setHistorial] = useState<PagoProveedor[]>([]);
  const [cuentas, setCuentas] = useState<CuentaPendiente[]>([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proveedores?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error("error");
      setProveedores((await res.json()).data ?? []);
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    const t = setTimeout(cargar, 300);
    return () => clearTimeout(t);
  }, [cargar]);

  const abrirCrear = () => {
    setForm({ ...VACIO });
    setError("");
    setErroresCampo({});
    setModal({ modo: "crear" });
  };

  const abrirEditar = (p: Proveedor) => {
    setForm({
      nombre: p.nombre,
      telefono: p.telefono ?? "",
      email: p.email ?? "",
      direccion: p.direccion ?? "",
      contacto: p.contacto ?? "",
      limiteCredito: p.limiteCredito != null ? String(p.limiteCredito) : "",
      diasCredito: String(p.diasCredito ?? 0),
    });
    setError("");
    setErroresCampo({});
    setModal({ modo: "editar", p });
  };

  const guardar = async () => {
    // Mismas reglas que el servidor (lib/esquemas): el error sale junto al campo.
    const v = validar(PROVEEDOR_SCHEMA, form);
    if (!v.ok) {
      setErroresCampo(v.campos);
      setError(v.error);
      return;
    }
    setGuardando(true);
    setError("");
    setErroresCampo({});
    try {
      const esCrear = modal?.modo === "crear";
      const res = await fetch(esCrear ? "/api/proveedores" : `/api/proveedores/${(modal as any).p.idProveedor}`, {
        method: esCrear ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Error al guardar");
        setErroresCampo(d.campos ?? {});
      } else {
        notificar.exito(esCrear ? "Proveedor creado" : "Proveedor actualizado", v.datos.nombre);
        setModal(null);
        cargar();
      }
    } finally {
      setGuardando(false);
    }
  };

  const alternarActivo = async (p: Proveedor) => {
    await fetch(`/api/proveedores/${p.idProveedor}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: !p.activo }),
    });
    cargar();
  };

  const abrirAbono = async (p: Proveedor) => {
    setAbono(p);
    setAbonoForm({ monto: "", metodoPago: "EFECTIVO", referencia: "" });
    setAbonoError("");
    setHistorial([]);
    setCuentas([]);
    await abrirHistorial(p.idProveedor);
  };

  const registrarAbono = async () => {
    if (!abono) return;
    const monto = Number(abonoForm.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      setAbonoError("Ingresa un monto válido");
      return;
    }
    setAbonando(true);
    setAbonoError("");
    try {
      const res = await fetch(`/api/proveedores/${abono.idProveedor}/pagos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monto,
          metodoPago: abonoForm.metodoPago,
          referencia: abonoForm.referencia,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAbonoError(data.error || "Error al registrar el abono");
        return;
      }
      notificar.exito(`Abono de $${monto.toFixed(2)} registrado`, `Saldo pendiente: $${Number(data.saldoNuevo).toFixed(2)}`);
      setAbonoForm({ monto: "", metodoPago: abonoForm.metodoPago, referencia: "" });
      setAbono((a) => (a ? { ...a, saldoCredito: data.saldoNuevo } : a));
      await Promise.all([cargar(), abrirHistorial(abono.idProveedor)]);
    } finally {
      setAbonando(false);
    }
  };

  const abrirHistorial = async (idProveedor: string) => {
    setLoadingHistorial(true);
    try {
      const res = await fetch(`/api/proveedores/${idProveedor}/pagos`);
      if (res.ok) {
        const d = await res.json();
        setHistorial(d.data ?? []);
        setCuentas(d.cuentas ?? []);
      }
    } finally {
      setLoadingHistorial(false);
    }
  };

  return (
    <>
      <div className="p-6 max-w-6xl mx-auto">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <h2 className="text-2xl font-black text-gray-100 mb-1">Proveedores</h2>
          <p className="text-sm text-muted">
            Catálogo de proveedores, contactos y lo que les debes por compras a crédito.{" "}
            <button
              type="button"
              onClick={() => setAyudaCredito((v) => !v)}
              className="inline-flex items-center gap-1 font-semibold text-acento hover:underline"
            >
              <Info className="h-3.5 w-3.5" /> ¿Cómo funciona el crédito?
            </button>
          </p>
          <AnimatePresence>
            {ayudaCredito && (
              <motion.ol
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-3 grid gap-2 overflow-hidden text-xs text-gray-200 sm:grid-cols-2 lg:grid-cols-4"
              >
                {[
                  ["Define el plazo", "En el proveedor indica cuántos días te da para pagar y, si quieres, un límite de crédito."],
                  ["Pide a crédito", "Al crear el pedido elige “A crédito”. De contado no genera deuda."],
                  ["Recibe la mercancía", "Lo recibido se convierte en una cuenta por pagar que vence en ese plazo."],
                  ["Abona", "Cada abono liquida primero la compra más antigua. Te avisamos antes de que venza."],
                ].map(([t, d], i) => (
                  <li key={t} className="rounded-xl border border-surface-500 bg-surface-800 p-3">
                    <span className="mb-1 block font-bold text-gray-100">
                      {i + 1}. {t}
                    </span>
                    {d}
                  </li>
                ))}
              </motion.ol>
            )}
          </AnimatePresence>
        </motion.div>

        <div className="flex gap-3 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre, contacto o email..."
              className="w-full bg-surface-800 border border-surface-600 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-100 placeholder:text-muted/50 focus:border-neon-green focus:shadow-neon focus:outline-none transition-all"
            />
          </div>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={abrirCrear}
            className="btn-primary flex items-center gap-2 py-2.5 px-5 text-sm"
          >
            <Plus className="h-4 w-4" />
            Nuevo proveedor
          </motion.button>
        </div>

        <div className="bg-surface-800 border border-surface-600 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-surface-600">
            <Truck className="h-5 w-5 text-neon-cyan" />
            <span className="font-bold text-gray-100">Proveedores ({proveedores.length})</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
            </div>
          ) : proveedores.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted gap-2">
              <Truck className="h-10 w-10 opacity-30" />
              <p className="text-sm">Sin proveedores registrados</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-surface-600 bg-surface-700/40">
                    <th className="px-5 py-3 font-semibold">Proveedor</th>
                    <th className="px-5 py-3 font-semibold">Contacto</th>
                    <th className="px-5 py-3 font-semibold">Crédito</th>
                    <th className="px-5 py-3 font-semibold">Estado</th>
                    <th className="px-5 py-3 font-semibold text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {proveedores.map((p) => (
                    <motion.tr
                      key={p.idProveedor}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="border-b border-surface-700 last:border-0 hover:bg-surface-700/40 transition-colors"
                    >
                      <td className="px-5 py-3">
                        <span className="font-medium text-gray-100">{p.nombre}</span>
                        {p.direccion && (
                          <span className="block text-[11px] text-muted">{p.direccion}</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="space-y-0.5 text-xs text-muted">
                          {p.contacto && <span className="block text-gray-200">{p.contacto}</span>}
                          {p.telefono && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" /> {p.telefono}
                            </span>
                          )}
                          {p.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" /> {p.email}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        {p.diasCredito > 0 || p.saldoCredito > 0 ? (
                          <div className="text-xs">
                            <span className="font-bold text-neon-cyan">
                              {p.diasCredito > 0 ? `${p.diasCredito} días` : "Sin plazo"}
                            </span>
                            {p.limiteCredito != null && (
                              <span className="text-muted"> · límite ${p.limiteCredito.toFixed(2)}</span>
                            )}
                            <span className={cn("block font-bold mt-0.5", p.saldoCredito > 0 ? "text-warning" : "text-muted")}>
                              {p.saldoCredito > 0 ? `Le debes $${p.saldoCredito.toFixed(2)}` : "Sin deuda"}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted text-xs">De contado</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold border",
                            p.activo
                              ? "text-neon-green border-neon-green/40 bg-neon-green/10"
                              : "text-muted border-surface-500 bg-surface-600/40"
                          )}
                        >
                          {p.activo ? <CheckCircle2 className="h-3 w-3" /> : <UserX className="h-3 w-3" />}
                          {p.activo ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => abrirAbono(p)}
                            disabled={p.saldoCredito <= 0}
                            title={p.saldoCredito <= 0 ? "Sin saldo pendiente" : "Registrar abono"}
                            className={cn(
                              "h-8 w-8 rounded-lg flex items-center justify-center transition-colors",
                              p.saldoCredito > 0
                                ? "bg-surface-700 hover:bg-neon-green/10 text-muted hover:text-neon-green"
                                : "bg-surface-700/50 text-muted/40 cursor-not-allowed"
                            )}
                          >
                            <HandCoins className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => abrirEditar(p)}
                            className="h-8 w-8 rounded-lg bg-surface-700 hover:bg-neon-cyan/10 flex items-center justify-center text-muted hover:text-neon-cyan transition-colors"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => alternarActivo(p)}
                            className="h-8 w-8 rounded-lg bg-surface-700 hover:bg-neon-red/10 flex items-center justify-center text-muted hover:text-neon-red transition-colors"
                            title={p.activo ? "Desactivar" : "Reactivar"}
                          >
                            <UserX className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal crear/editar */}
        <AnimatePresence>
          {modal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
              onClick={() => setModal(null)}
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-surface-800 border border-surface-600 rounded-3xl p-6 max-w-lg w-full"
              >
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-neon-cyan/10 flex items-center justify-center">
                      <ShieldCheck className="h-5 w-5 text-neon-cyan" />
                    </div>
                    <h3 className="font-bold text-gray-100 text-lg">
                      {modal.modo === "crear" ? "Nuevo proveedor" : "Editar proveedor"}
                    </h3>
                  </div>
                  <button onClick={() => setModal(null)} className="h-9 w-9 rounded-lg bg-surface-700 hover:bg-surface-600 flex items-center justify-center text-muted hover:text-gray-100">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-3">
                  <label className="block">
                    <span className="text-xs text-muted mb-1 block">Nombre *</span>
                    <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="input-dark" placeholder="Ej: Office Depot" maxLength={120} />
                    <ErrorCampo msg={erroresCampo.nombre} />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-xs text-muted mb-1 block">Contacto</span>
                      <input value={form.contacto} onChange={(e) => setForm({ ...form, contacto: e.target.value })} className="input-dark" placeholder="Nombre de contacto" maxLength={120} />
                      <ErrorCampo msg={erroresCampo.contacto} />
                    </label>
                    <label className="block">
                      <span className="text-xs text-muted mb-1 block">Teléfono</span>
                      <input type="tel" inputMode="tel" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} className="input-dark" placeholder="55 1234 5678" maxLength={20} />
                      <ErrorCampo msg={erroresCampo.telefono} />
                    </label>
                  </div>
                  <label className="block">
                    <span className="text-xs text-muted mb-1 block">Email</span>
                    <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input-dark" placeholder="contacto@proveedor.com" maxLength={120} />
                    <ErrorCampo msg={erroresCampo.email} />
                  </label>
                  <label className="block">
                    <span className="text-xs text-muted mb-1 block">Dirección</span>
                    <input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} className="input-dark" placeholder="Calle, colonia, CP" maxLength={200} />
                    <ErrorCampo msg={erroresCampo.direccion} />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-xs text-muted mb-1 block">Días de crédito</span>
                      <input type="number" min={0} max={365} step={1} inputMode="numeric" value={form.diasCredito} onChange={(e) => setForm({ ...form, diasCredito: e.target.value })} className="input-dark" placeholder="0 = contado" />
                      <span className="mt-1 block text-[11px] text-muted">Plazo para pagar lo recibido. 0 = de contado.</span>
                      <ErrorCampo msg={erroresCampo.diasCredito} />
                    </label>
                    <label className="block">
                      <span className="text-xs text-muted mb-1 block">Límite de crédito ($)</span>
                      <input type="number" min={0} step="0.01" inputMode="decimal" value={form.limiteCredito} onChange={(e) => setForm({ ...form, limiteCredito: e.target.value })} className="input-dark" placeholder="Opcional" />
                      <span className="mt-1 block text-[11px] text-muted">Te avisamos si una compra lo rebasa.</span>
                      <ErrorCampo msg={erroresCampo.limiteCredito} />
                    </label>
                  </div>

                  {error && (
                    <div className="text-xs text-neon-red bg-neon-red/10 border border-neon-red/40 rounded-lg px-3 py-2">{error}</div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button onClick={() => setModal(null)} className="btn-ghost flex-1">Cancelar</button>
                    <motion.button whileTap={{ scale: 0.97 }} onClick={guardar} disabled={guardando} className="btn-cyan flex-1 flex items-center justify-center gap-2">
                      {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
                      {modal.modo === "crear" ? "Crear proveedor" : "Guardar cambios"}
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modal de abonos */}
        <AnimatePresence>
          {abono && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
              onClick={() => setAbono(null)}
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-surface-800 border border-surface-600 rounded-3xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto"
              >
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-neon-green/10 flex items-center justify-center">
                      <HandCoins className="h-5 w-5 text-neon-green" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-100 text-lg">Estado de cuenta</h3>
                      <p className="text-[11px] text-muted">{abono.nombre}</p>
                    </div>
                  </div>
                  <button onClick={() => setAbono(null)} className="h-9 w-9 rounded-lg bg-surface-700 hover:bg-surface-600 flex items-center justify-center text-muted hover:text-gray-100">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between bg-surface-900/50 rounded-xl px-4 py-3 mb-4">
                  <span className="text-xs text-muted">Saldo pendiente</span>
                  <span className={cn("text-lg font-black", abono.saldoCredito > 0 ? "text-warning" : "text-neon-green")}>
                    ${abono.saldoCredito.toFixed(2)}
                  </span>
                </div>

                {cuentas.length > 0 && (
                  <div className="mb-4 space-y-1.5">
                    <span className="block text-xs font-bold text-gray-100">Compras por pagar</span>
                    {cuentas.map((c) => (
                      <div key={c.idCuenta} className="flex items-center justify-between gap-3 rounded-lg bg-surface-900/40 px-3 py-2 text-xs">
                        <div className="min-w-0">
                          <span className="block truncate text-gray-100">{c.concepto}</span>
                          <span
                            className={cn(
                              "font-semibold",
                              c.estado === "VENCIDA" ? "text-rose-300" : c.estado === "VENCE_PRONTO" ? "text-amber-300" : "text-muted"
                            )}
                          >
                            {textoVencimiento(c)} · {new Date(c.fechaVencimiento).toLocaleDateString("es-MX")}
                          </span>
                        </div>
                        <span className="shrink-0 font-bold text-gray-100 tabular-nums">${c.saldo.toFixed(2)}</span>
                      </div>
                    ))}
                    <p className="text-[11px] text-muted">Los abonos se aplican primero a la compra más antigua.</p>
                  </div>
                )}

                <div className="space-y-3">
                  <label className="block">
                    <span className="text-xs text-muted mb-1 block">Monto del abono ($)</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={abonoForm.monto}
                      onChange={(e) => setAbonoForm({ ...abonoForm, monto: e.target.value })}
                      className="input-dark"
                      placeholder="0.00"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-xs text-muted mb-1 block">Método de pago</span>
                      <select
                        value={abonoForm.metodoPago}
                        onChange={(e) => setAbonoForm({ ...abonoForm, metodoPago: e.target.value })}
                        className="input-dark"
                      >
                        {METODOS_ABONO.map((m) => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs text-muted mb-1 block">Referencia</span>
                      <input
                        value={abonoForm.referencia}
                        onChange={(e) => setAbonoForm({ ...abonoForm, referencia: e.target.value })}
                        className="input-dark"
                        placeholder="Opcional"
                      />
                    </label>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setAbonoForm({ ...abonoForm, monto: String(abono.saldoCredito) })}
                      className="text-[11px] text-neon-cyan hover:underline"
                    >
                      Liquidar saldo completo
                    </button>
                  </div>

                  {abonoError && (
                    <div className="text-xs text-neon-red bg-neon-red/10 border border-neon-red/40 rounded-lg px-3 py-2">
                      {abonoError}
                    </div>
                  )}

                  <div className="flex gap-3 pt-1">
                    <button onClick={() => setAbono(null)} className="btn-ghost flex-1">Cerrar</button>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={registrarAbono}
                      disabled={abonando}
                      className="btn-primary flex-1 flex items-center justify-center gap-2"
                    >
                      {abonando && <Loader2 className="h-4 w-4 animate-spin" />}
                      Registrar abono
                    </motion.button>
                  </div>
                </div>

                <div className="mt-6">
                  <div className="flex items-center gap-2 mb-3">
                    <History className="h-4 w-4 text-muted" />
                    <span className="text-xs font-bold text-gray-100">Historial de abonos</span>
                  </div>
                  {loadingHistorial ? (
                    <div className="flex items-center justify-center py-6 text-muted gap-2 text-xs">
                      <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
                    </div>
                  ) : historial.length === 0 ? (
                    <p className="text-xs text-muted py-3">Sin abonos registrados</p>
                  ) : (
                    <div className="space-y-1.5 max-h-44 overflow-y-auto">
                      {historial.map((p) => (
                        <div key={p.idPago} className="flex items-center justify-between bg-surface-900/40 rounded-lg px-3 py-2 text-xs">
                          <div>
                            <span className="text-gray-100 font-bold">${p.monto.toFixed(2)}</span>
                            <span className="text-muted ml-2">{p.metodoPago}</span>
                            {p.referencia && <span className="text-muted ml-2">· {p.referencia}</span>}
                            <span className="block text-[10px] text-muted">
                              {new Date(p.fechaHora).toLocaleString("es-MX")} · {p.usuario}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

function ErrorCampo({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <span className="mt-1 block text-[11px] font-semibold text-rose-300">{msg}</span>;
}
