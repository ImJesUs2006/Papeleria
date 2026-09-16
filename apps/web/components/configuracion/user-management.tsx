"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  UserPlus,
  KeyRound,
  Trash2,
  ShieldCheck,
  ShieldOff,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Check,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { SkeletonTable } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Usuario {
  idPersona: string;
  nombre: string;
  username: string;
  rol: "ADMINISTRADORA" | "CAJERA";
  activa: boolean;
  ultimoLoginAt: string | null;
}

export function UserManagement() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nota, setNota] = useState<string | null>(null);
  const [accionando, setAccionando] = useState<string | null>(null);

  const [modalNuevo, setModalNuevo] = useState(false);
  const [modalPass, setModalPass] = useState<Usuario | null>(null);
  const [modalEliminar, setModalEliminar] = useState<Usuario | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/usuarios", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al cargar usuarios");
      setUsuarios(data.usuarios);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const aviso = (msg: string) => {
    setNota(msg);
    setTimeout(() => setNota(null), 2600);
  };

  const cambiar = async (u: Usuario, cambios: Partial<Usuario>) => {
    setAccionando(u.idPersona);
    setError(null);
    try {
      const res = await fetch(`/api/usuarios/${u.idPersona}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cambios),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al actualizar");
      setUsuarios((prev) =>
        prev.map((x) => (x.idPersona === u.idPersona ? { ...x, ...data.usuario } : x))
      );
      aviso("Usuario actualizado");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAccionando(null);
    }
  };

  const eliminar = async () => {
    if (!modalEliminar) return;
    const u = modalEliminar;
    setAccionando(u.idPersona);
    try {
      const res = await fetch(`/api/usuarios/${u.idPersona}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al eliminar");
      setUsuarios((prev) => prev.filter((x) => x.idPersona !== u.idPersona));
      setModalEliminar(null);
      aviso("Usuario eliminado");
    } catch (e: any) {
      setError(e.message);
      setModalEliminar(null);
    } finally {
      setAccionando(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-gray-100">Usuarios y accesos</h3>
          <p className="text-xs text-muted">
            {usuarios.filter((u) => u.activa).length} activos de {usuarios.length}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={cargar}
            className="h-9 w-9 rounded-lg bg-surface-700 hover:bg-surface-600 flex items-center justify-center text-muted hover:text-gray-100 transition-colors"
            title="Recargar"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => setModalNuevo(true)}
            className="btn-primary flex items-center gap-2 py-2.5 px-4 text-sm"
          >
            <UserPlus className="h-4 w-4" /> Nuevo usuario
          </button>
        </div>
      </div>

      {nota && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 bg-neon-green/10 border border-neon-green/40 rounded-xl px-4 py-2.5 text-sm text-gray-100"
        >
          <Check className="h-4 w-4 text-neon-green" /> {nota}
        </motion.div>
      )}
      {error && (
        <div className="flex items-center gap-2 bg-neon-red/10 border border-neon-red/40 rounded-xl px-4 py-2.5 text-sm text-gray-100">
          <AlertTriangle className="h-4 w-4 text-neon-red shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-xs text-muted hover:text-gray-100">
            Cerrar
          </button>
        </div>
      )}

      <div className="bg-surface-800 border border-surface-600 rounded-2xl overflow-hidden">
        {loading ? (
          <SkeletonTable rows={4} cols={5} />
        ) : usuarios.length === 0 ? (
          <div className="py-12 text-center text-muted text-sm">Sin usuarios</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-700">
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="px-4 py-3 font-semibold">Usuario</th>
                <th className="px-4 py-3 font-semibold">Rol</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold">Último acceso</th>
                <th className="px-4 py-3 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr
                  key={u.idPersona}
                  className="border-b border-surface-700 last:border-0 hover:bg-surface-700/40 transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className="text-gray-100 font-medium">{u.nombre}</span>
                    <span className="block text-[10px] text-muted">@{u.username}</span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.rol}
                      disabled={accionando === u.idPersona}
                      onChange={(e) => cambiar(u, { rol: e.target.value as Usuario["rol"] })}
                      className={cn(
                        "bg-surface-700 border rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none",
                        u.rol === "ADMINISTRADORA"
                          ? "border-neon-purple/40 text-neon-purple"
                          : "border-neon-cyan/40 text-neon-cyan"
                      )}
                    >
                      <option value="ADMINISTRADORA">ADMINISTRADORA</option>
                      <option value="CAJERA">CAJERA</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "text-xs font-bold px-2 py-0.5 rounded-md",
                        u.activa
                          ? "bg-neon-green/10 text-neon-green"
                          : "bg-neon-red/10 text-neon-red"
                      )}
                    >
                      {u.activa ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {u.ultimoLoginAt
                      ? new Date(u.ultimoLoginAt).toLocaleString("es-MX")
                      : "Nunca"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => cambiar(u, { activa: !u.activa })}
                        disabled={accionando === u.idPersona}
                        className="h-8 w-8 rounded-lg bg-surface-700 hover:bg-surface-600 flex items-center justify-center text-muted hover:text-gray-100 transition-colors"
                        title={u.activa ? "Desactivar" : "Activar"}
                      >
                        {u.activa ? (
                          <ShieldOff className="h-4 w-4" />
                        ) : (
                          <ShieldCheck className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        onClick={() => setModalPass(u)}
                        className="h-8 w-8 rounded-lg bg-surface-700 hover:bg-neon-cyan/10 flex items-center justify-center text-muted hover:text-neon-cyan transition-colors"
                        title="Cambiar contraseña"
                      >
                        <KeyRound className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setModalEliminar(u)}
                        className="h-8 w-8 rounded-lg bg-surface-700 hover:bg-neon-red/10 flex items-center justify-center text-muted hover:text-neon-red transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      {accionando === u.idPersona && (
                        <Loader2 className="h-4 w-4 text-neon-cyan animate-spin" />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <NuevoUsuarioModal
        open={modalNuevo}
        onClose={() => setModalNuevo(false)}
        onCreado={() => {
          setModalNuevo(false);
          cargar();
          aviso("Usuario creado");
        }}
        onError={setError}
      />

      <CambiarPasswordModal
        usuario={modalPass}
        onClose={() => setModalPass(null)}
        onDone={() => {
          setModalPass(null);
          aviso("Contraseña actualizada");
        }}
        onError={setError}
      />

      <Modal
        open={!!modalEliminar}
        onClose={() => setModalEliminar(null)}
        title="Eliminar usuario"
        subtitle="Esta acción no se puede deshacer"
      >
        <p className="text-sm text-muted mb-5">
          ¿Eliminar a <span className="text-gray-100 font-bold">{modalEliminar?.nombre}</span>?
          Si tiene historial de ventas o bitácora, el sistema pedirá desactivarlo en su lugar.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setModalEliminar(null)}
            className="flex-1 py-2.5 rounded-xl border border-surface-500 text-muted hover:text-gray-100 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={eliminar}
            className="flex-1 py-2.5 rounded-xl bg-neon-red text-white font-bold shadow-neon-magenta"
          >
            Eliminar
          </button>
        </div>
      </Modal>
    </div>
  );
}

function NuevoUsuarioModal({
  open,
  onClose,
  onCreado,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  onCreado: () => void;
  onError: (msg: string) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState<"ADMINISTRADORA" | "CAJERA">("CAJERA");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (open) {
      setNombre("");
      setUsername("");
      setPassword("");
      setRol("CAJERA");
    }
  }, [open]);

  const crear = async () => {
    setGuardando(true);
    try {
      const res = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, username, password, rol }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al crear usuario");
      onCreado();
    } catch (e: any) {
      onError(e.message);
      onClose();
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Nuevo usuario" subtitle="Crea accesos para tu equipo">
      <div className="space-y-3">
        <Campo label="Nombre completo">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="input-dark" placeholder="Ej. Ana López" />
        </Campo>
        <Campo label="Usuario (login)">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="input-dark"
            placeholder="ana.lopez"
          />
        </Campo>
        <Campo label="Contraseña (mín. 8)">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-dark"
            placeholder="••••••••"
            autoComplete="new-password"
          />
        </Campo>
        <Campo label="Rol">
          <select value={rol} onChange={(e) => setRol(e.target.value as any)} className="input-dark">
            <option value="CAJERA">CAJERA</option>
            <option value="ADMINISTRADORA">ADMINISTRADORA</option>
          </select>
        </Campo>
        <button
          onClick={crear}
          disabled={guardando || !nombre || !username || password.length < 8}
          className={cn(
            "w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all",
            !guardando && nombre && username && password.length >= 8
              ? "bg-neon-green text-surface-900 shadow-neon"
              : "bg-surface-600 text-muted cursor-not-allowed"
          )}
        >
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Crear usuario
        </button>
      </div>
    </Modal>
  );
}

function CambiarPasswordModal({
  usuario,
  onClose,
  onDone,
  onError,
}: {
  usuario: Usuario | null;
  onClose: () => void;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (usuario) setPassword("");
  }, [usuario]);

  const guardar = async () => {
    if (!usuario) return;
    setGuardando(true);
    try {
      const res = await fetch(`/api/usuarios/${usuario.idPersona}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al cambiar contraseña");
      onDone();
    } catch (e: any) {
      onError(e.message);
      onClose();
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      open={!!usuario}
      onClose={onClose}
      title="Restablecer contraseña"
      subtitle={usuario ? `Para @${usuario.username}` : undefined}
    >
      <div className="space-y-3">
        <Campo label="Nueva contraseña (mín. 8)">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-dark"
            placeholder="••••••••"
            autoComplete="new-password"
          />
        </Campo>
        <button
          onClick={guardar}
          disabled={guardando || password.length < 8}
          className={cn(
            "w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all",
            password.length >= 8
              ? "bg-neon-cyan text-surface-900 shadow-neon-cyan"
              : "bg-surface-600 text-muted cursor-not-allowed"
          )}
        >
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          Actualizar contraseña
        </button>
      </div>
    </Modal>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-muted mb-1 block">{label}</span>
      {children}
    </label>
  );
}