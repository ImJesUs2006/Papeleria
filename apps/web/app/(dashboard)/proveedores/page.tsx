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
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { cn } from "@/lib/utils";

interface Proveedor {
  idProveedor: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  contacto: string | null;
  limiteCredito: number | null;
  saldoCredito: number;
  activo: boolean;
}

const VACIO = {
  nombre: "",
  telefono: "",
  email: "",
  direccion: "",
  contacto: "",
  limiteCredito: "",
};

export default function ProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<null | { modo: "crear" } | { modo: "editar"; p: Proveedor }>(null);
  const [form, setForm] = useState({ ...VACIO });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

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
    });
    setError("");
    setModal({ modo: "editar", p });
  };

  const guardar = async () => {
    if (!form.nombre.trim()) {
      setError("El nombre es obligatorio");
      return;
    }
    setGuardando(true);
    setError("");
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
      } else {
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

  return (
    <DashboardLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <h2 className="text-2xl font-black text-gray-100 mb-1">Proveedores</h2>
          <p className="text-sm text-muted">Catálogo de proveedores, contactos y créditos</p>
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
                        {p.limiteCredito != null ? (
                          <div className="text-xs">
                            <span className="text-neon-cyan font-bold">
                              ${p.limiteCredito.toFixed(2)}
                            </span>
                            <span className="text-muted"> límite</span>
                            <span className={cn("block font-bold mt-0.5", p.saldoCredito > 0 ? "text-neon-yellow" : "text-muted")}>
                              Saldo: ${p.saldoCredito.toFixed(2)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted text-xs">—</span>
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
                    <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="input-dark" placeholder="Ej: Office Depot" />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-xs text-muted mb-1 block">Contacto</span>
                      <input value={form.contacto} onChange={(e) => setForm({ ...form, contacto: e.target.value })} className="input-dark" placeholder="Nombre de contacto" />
                    </label>
                    <label className="block">
                      <span className="text-xs text-muted mb-1 block">Teléfono</span>
                      <input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} className="input-dark" placeholder="55-1234-5678" />
                    </label>
                  </div>
                  <label className="block">
                    <span className="text-xs text-muted mb-1 block">Email</span>
                    <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input-dark" placeholder="contacto@proveedor.com" />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-xs text-muted mb-1 block">Dirección</span>
                      <input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} className="input-dark" placeholder="Calle, colonia, CP" />
                    </label>
                    <label className="block">
                      <span className="text-xs text-muted mb-1 block">Límite de crédito ($)</span>
                      <input type="number" min={0} value={form.limiteCredito} onChange={(e) => setForm({ ...form, limiteCredito: e.target.value })} className="input-dark" placeholder="5000.00" />
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
      </div>
    </DashboardLayout>
  );
}