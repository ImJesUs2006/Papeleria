"use client";

import { useCallback, useEffect, useState } from "react";
import {
  UserPlus,
  KeyRound,
  Trash2,
  ShieldCheck,
  ShieldOff,
  Loader2,
  RefreshCw,
  Crown,
  Check,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { SkeletonTable } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { notificar } from "@/store/notificaciones";
import { PerfilesPanel, type Perfil } from "@/components/configuracion/perfiles-panel";
import { SucursalesPanel, type Sucursal } from "@/components/configuracion/sucursales-panel";
import { usePersonalizacion } from "@/store/config";
import { MATRIZ_PERMISOS, nivelDe, NIVELES, PLANTILLAS_USUARIO, type NivelUsuario } from "@/lib/roles";
import { pedirTexto } from "@/store/dialogo";

interface Usuario {
  idPersona: string;
  nombre: string;
  username: string;
  rol: "ADMINISTRADORA" | "CAJERA";
  activa: boolean;
  permisoCobrar: boolean;
  permisoInventario: boolean;
  permisoReportes: boolean;
  idPerfil?: string | null;
  perfil?: { nombre: string } | null;
  idSucursal?: string | null;
  ultimoLoginAt: string | null;
  isRoot?: boolean;
}

// Errores y confirmaciones salen como notificaciones deslizantes.
const setError = (msg: string | null) => {
  if (msg) notificar.error(msg);
};

export function UserManagement() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [accionando, setAccionando] = useState<string | null>(null);

  const [modalNuevo, setModalNuevo] = useState(false);
  const [modalPass, setModalPass] = useState<Usuario | null>(null);
  const [modalEliminar, setModalEliminar] = useState<Usuario | null>(null);
  const [modalPermisos, setModalPermisos] = useState<Usuario | null>(null);
  // Solo el dueño(a) maneja administradores (lib/roles).
  const [esDueno, setEsDueno] = useState(false);
  const [yoId, setYoId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/usuarios", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al cargar usuarios");
      setUsuarios(data.usuarios);
      setEsDueno(data.yo?.esDueno === true);
      setYoId(data.yo?.idPersona ?? null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Perfiles del negocio (roles con nombre propio).
  const { etiquetasRol } = usePersonalizacion();
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const cargarPerfiles = useCallback(async () => {
    try {
      const res = await fetch("/api/perfiles", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setPerfiles(data.perfiles ?? []);
    } catch {
      /* sin perfiles: la gestión de usuarios sigue funcionando */
    }
  }, []);
  useEffect(() => {
    cargarPerfiles();
  }, [cargarPerfiles]);

  // Sucursales (multi-sucursal): alta y asignación de cada usuario.
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const cargarSucursales = useCallback(async () => {
    try {
      const res = await fetch("/api/sucursales", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setSucursales(data.sucursales ?? []);
    } catch {
      /* sin sucursales: la gestión de usuarios sigue funcionando */
    }
  }, []);
  useEffect(() => {
    cargarSucursales();
  }, [cargarSucursales]);

  const aviso = (msg: string) => notificar.exito(msg);

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

  // Transferir la propiedad: confirma con la contraseña del dueño(a) actual.
  const transferir = async (u: Usuario) => {
    const password = await pedirTexto({
      titulo: `Transferir la propiedad a ${u.nombre}`,
      mensaje: "Tú seguirás como administrador(a).",
      etiqueta: "Escribe TU contraseña para confirmar",
      tipo: "password",
      aceptar: "Transferir",
      peligro: true,
    });
    if (!password) return;
    setAccionando(u.idPersona);
    try {
      const res = await fetch(`/api/usuarios/${u.idPersona}/dueno`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo transferir");
      aviso(`${data.dueno} es ahora el dueño(a) del negocio`);
      cargar();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAccionando(null);
    }
  };
  // ¿Puedo tocar a esta persona? (el servidor lo vuelve a validar)
  const bloqueado = (u: Usuario) => (u.isRoot ? u.idPersona !== yoId : u.rol === "ADMINISTRADORA" && !esDueno);

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
      aviso(
        data.modo === "ANONIMIZADO"
          ? `Usuario eliminado: sus datos personales se borraron de ${data.registrosAnonimizados ?? 0} registro(s); sus ventas y movimientos se conservan`
          : "Usuario eliminado"
      );
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

      <SucursalesPanel
        sucursales={sucursales}
        onError={setError}
        onCambio={() => {
          cargarSucursales();
          cargar();
        }}
      />

      <PerfilesPanel
        perfiles={perfiles}
        onError={setError}
        onCambio={() => {
          cargarPerfiles();
          cargar();
        }}
      />

      <div className="bg-surface-800 border border-surface-600 rounded-2xl overflow-hidden">
        {loading ? (
          <SkeletonTable rows={4} cols={6} />
        ) : usuarios.length === 0 ? (
          <div className="py-12 text-center text-muted text-sm">Sin usuarios</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-700">
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="px-4 py-3 font-semibold">Usuario</th>
                <th className="px-4 py-3 font-semibold">Rol</th>
                <th className="px-4 py-3 font-semibold">Permisos de módulo</th>
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
                    <span
                      className={cn(
                        "mb-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold",
                        u.isRoot ? "bg-amber-500/15 text-amber-300" : "bg-surface-600 text-gray-200"
                      )}
                      data-testid="nivel-usuario"
                    >
                      {u.isRoot && <Crown className="h-3 w-3" />}
                      {u.perfil?.nombre ?? NIVELES[nivelDe(u)].titulo}
                    </span>
                    <select
                      value={u.rol}
                      disabled={accionando === u.idPersona || !!u.isRoot || bloqueado(u)}
                      title={u.isRoot ? "Para dejar de ser dueño(a), transfiere la propiedad" : bloqueado(u) ? "Solo el dueño(a) cambia administradores" : undefined}
                      onChange={(e) => cambiar(u, { rol: e.target.value as Usuario["rol"] })}
                      className={cn(
                        "bg-surface-700 border rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none",
                        u.rol === "ADMINISTRADORA"
                          ? "border-neon-purple/40 text-neon-purple"
                          : "border-neon-cyan/40 text-neon-cyan"
                      )}
                    >
                      <option value="ADMINISTRADORA" disabled={!esDueno}>
                        {etiquetasRol.ADMINISTRADORA}
                      </option>
                      <option value="CAJERA">{etiquetasRol.CAJERA}</option>
                    </select>
                    {perfiles.length > 0 && !u.isRoot && !bloqueado(u) && (
                      <select
                        value={u.idPerfil ?? ""}
                        disabled={accionando === u.idPersona}
                        onChange={(e) =>
                          cambiar(u, { idPerfil: e.target.value || null } as Partial<Usuario>).then(
                            cargarPerfiles
                          )
                        }
                        title="Perfil"
                        className="mt-1 block w-full rounded-lg border border-surface-500 bg-surface-700 px-2 py-1 text-[11px] text-slate-300 focus:outline-none"
                      >
                        <option value="">— Sin perfil —</option>
                        {perfiles.map((pf) => (
                          <option key={pf.idPerfil} value={pf.idPerfil}>
                            {pf.nombre}
                          </option>
                        ))}
                      </select>
                    )}
                    {sucursales.filter((s) => s.activa).length > 1 && (
                      <select
                        value={u.idSucursal ?? ""}
                        disabled={accionando === u.idPersona}
                        onChange={(e) =>
                          cambiar(u, { idSucursal: e.target.value || null } as Partial<Usuario>).then(
                            cargarSucursales
                          )
                        }
                        title="Sucursal"
                        className="mt-1 block w-full rounded-lg border border-surface-500 bg-surface-700 px-2 py-1 text-[11px] text-slate-300 focus:outline-none"
                      >
                        <option value="">Matriz (por defecto)</option>
                        {sucursales
                          .filter((s) => s.activa && !s.esMatriz)
                          .map((s) => (
                            <option key={s.idSucursal} value={s.idSucursal}>
                              {s.nombre}
                            </option>
                          ))}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setModalPermisos(u)}
                      disabled={accionando === u.idPersona}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-700 border border-surface-500 text-[11px] font-bold text-muted hover:border-acento/40 hover:text-acento transition-colors"
                      title="Editar permisos de módulo"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Permisos
                      <span
                        className="ml-1 h-4 min-w-4 px-1 rounded bg-acento/10 text-acento flex items-center justify-center"
                        title={u.rol === "ADMINISTRADORA" ? "Acceso total por rol" : "Permisos activos"}
                      >
                        {u.rol === "ADMINISTRADORA"
                          ? 3
                          : [u.permisoCobrar, u.permisoInventario, u.permisoReportes].filter(Boolean).length}
                      </span>
                    </button>
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
                      {esDueno && !u.isRoot && u.activa && (
                        <button
                          onClick={() => transferir(u)}
                          disabled={accionando === u.idPersona}
                          className="h-8 w-8 rounded-lg bg-surface-700 hover:bg-amber-500/10 flex items-center justify-center text-muted hover:text-amber-300 transition-colors"
                          title="Transferir la propiedad del negocio"
                          aria-label={`Transferir la propiedad a ${u.nombre}`}
                        >
                          <Crown className="h-4 w-4" />
                        </button>
                      )}
                      {!u.isRoot && !bloqueado(u) && (
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
                      )}
                      {!bloqueado(u) && (
                      <button
                        onClick={() => setModalPass(u)}
                        className="h-8 w-8 rounded-lg bg-surface-700 hover:bg-neon-cyan/10 flex items-center justify-center text-muted hover:text-neon-cyan transition-colors"
                        title="Cambiar contraseña"
                      >
                        <KeyRound className="h-4 w-4" />
                      </button>
                      )}
                      {!u.isRoot && !bloqueado(u) && (
                      <button
                        onClick={() => setModalEliminar(u)}
                        className="h-8 w-8 rounded-lg bg-surface-700 hover:bg-neon-red/10 flex items-center justify-center text-muted hover:text-neon-red transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      )}
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

      <MatrizPermisos />

      <NuevoUsuarioModal
        esDueno={esDueno}
        perfiles={perfiles}
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

      <PermisosModal
        usuario={modalPermisos}
        accionando={accionando}
        onCambiar={cambiar}
        onClose={() => setModalPermisos(null)}
      />

      <Modal
        open={!!modalEliminar}
        onClose={() => setModalEliminar(null)}
        title="Eliminar usuario"
        subtitle="Esta acción no se puede deshacer"
      >
        <p className="text-sm text-muted mb-5">
          ¿Eliminar a <span className="text-gray-100 font-bold">{modalEliminar?.nombre}</span>?
          Si ya trabajó en el sistema, sus ventas, cortes y bitácora se conservan pero quedan a nombre de
          «Usuario eliminado»: su nombre y usuario se borran y ya no podrá entrar.
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
  esDueno,
  perfiles,
  open,
  onClose,
  onCreado,
  onError,
}: {
  esDueno: boolean;
  perfiles: Perfil[];
  open: boolean;
  onClose: () => void;
  onCreado: () => void;
  onError: (msg: string) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState<"ADMINISTRADORA" | "CAJERA">("CAJERA");
  const [permisoCobrar, setPermisoCobrar] = useState(true);
  // Una cajera nueva cobra, pero no entra a inventario ni reportes.
  const [permisoInventario, setPermisoInventario] = useState(false);
  const [permisoReportes, setPermisoReportes] = useState(false);
  const [idPerfil, setIdPerfil] = useState("");
  const [guardando, setGuardando] = useState(false);
  const { etiquetasRol } = usePersonalizacion();

  useEffect(() => {
    if (open) {
      setNombre("");
      setUsername("");
      setPassword("");
      setRol("CAJERA");
      setPermisoCobrar(true);
      setPermisoInventario(false);
      setPermisoReportes(false);
      setIdPerfil("");
    }
  }, [open]);

  const crear = async () => {
    setGuardando(true);
    try {
      const res = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre,
          username,
          password,
          rol,
          permisoCobrar,
          permisoInventario,
          permisoReportes,
          idPerfil: idPerfil || null,
        }),
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
        {perfiles.length > 0 && (
          <Campo label="Perfil (opcional)">
            <select value={idPerfil} onChange={(e) => setIdPerfil(e.target.value)} className="input-dark">
              <option value="">— Sin perfil: elegir rol y permisos —</option>
              {perfiles.map((pf) => (
                <option key={pf.idPerfil} value={pf.idPerfil}>
                  {pf.nombre}
                </option>
              ))}
            </select>
          </Campo>
        )}
        {!idPerfil && (
        <>
        <div>
          <span className="text-xs text-muted mb-1.5 block">Tipo de usuario</span>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup">
            {(["CAJERO", "ENCARGADO", "ADMIN"] as const).map((n) => {
              const p = PLANTILLAS_USUARIO[n];
              const activo =
                rol === p.rol && (p.rol === "ADMINISTRADORA" || nivelDe({ rol, permisoInventario, permisoReportes }) === n);
              const permitido = n !== "ADMIN" || esDueno;
              return (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={activo}
                  disabled={!permitido}
                  title={permitido ? undefined : "Solo el dueño(a) crea administradores"}
                  onClick={() => {
                    setRol(p.rol);
                    setPermisoCobrar(p.permisoCobrar);
                    setPermisoInventario(p.permisoInventario);
                    setPermisoReportes(p.permisoReportes);
                  }}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-left disabled:opacity-40",
                    activo ? "border-acento bg-acento/10" : "border-surface-500 hover:border-surface-400"
                  )}
                >
                  <span className="block text-sm font-bold text-gray-100">{NIVELES[n].titulo}</span>
                  <span className="block text-[11px] text-muted">{NIVELES[n].resumen}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <span className="text-xs text-muted mb-1.5 block">
            {rol === "ADMINISTRADORA"
              ? "Permisos de módulo — acceso total por rol (no editable)"
              : "Permisos de módulo"}
          </span>
          <div className="flex flex-wrap gap-4">
            {[
              {
                value: rol === "ADMINISTRADORA" ? true : permisoCobrar,
                set: setPermisoCobrar,
                label: "Cobrar (Punto de Venta)",
              },
              {
                value: rol === "ADMINISTRADORA" ? true : permisoInventario,
                set: setPermisoInventario,
                label: "Inventario",
              },
              {
                value: rol === "ADMINISTRADORA" ? true : permisoReportes,
                set: setPermisoReportes,
                label: "Reportes",
              },
            ].map((p) => (
              <label key={p.label} className="flex items-center gap-2 text-sm text-gray-100 cursor-pointer">
                <input
                  type="checkbox"
                  checked={p.value}
                  disabled={rol === "ADMINISTRADORA"}
                  onChange={(e) => p.set(e.target.checked)}
                  className="h-4 w-4 rounded border-surface-500 bg-surface-700 accent-[var(--color-accento)] disabled:opacity-50"
                />
                {p.label}
              </label>
            ))}
          </div>
        </div>
        </>
        )}
        <button
          onClick={crear}
          disabled={guardando || !nombre || !username || password.length < 8}
          className={cn(
            "w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all",
            !guardando && nombre && username && password.length >= 8
              ? "bg-neon-green text-btn-ink shadow-neon"
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
              ? "bg-neon-cyan text-btn-ink shadow-neon-cyan"
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

function PermisosModal({
  usuario,
  accionando,
  onCambiar,
  onClose,
}: {
  usuario: Usuario | null;
  accionando: string | null;
  onCambiar: (u: Usuario, cambios: Partial<Usuario>) => void;
  onClose: () => void;
}) {
  const [pendiente, setPendiente] = useState<Partial<Usuario> | null>(null);
  const esAdmin = usuario?.rol === "ADMINISTRADORA";

  useEffect(() => {
    if (usuario) setPendiente(null);
  }, [usuario]);

  const items: Array<{
    key: "permisoCobrar" | "permisoInventario" | "permisoReportes";
    label: string;
    desc: string;
  }> = [
    {
      key: "permisoCobrar",
      label: "Cobrar (Punto de Venta)",
      desc: "Permite registrar ventas, devoluciones y operar el POS.",
    },
    {
      key: "permisoInventario",
      label: "Inventario",
      desc: "Permite ver y editar inventario, proveedores y pedidos.",
    },
    {
      key: "permisoReportes",
      label: "Reportes y bitácora",
      desc: "Permite ver reportes, exportar Excel y auditar la bitácora.",
    },
  ];

  const guardar = () => {
    if (!usuario || !pendiente) return;
    onCambiar(usuario, pendiente);
    onClose();
  };

  const valor = (key: "permisoCobrar" | "permisoInventario" | "permisoReportes") =>
    esAdmin ? true : pendiente?.[key] ?? Boolean(usuario?.[key]);

  return (
    <Modal
      open={!!usuario}
      onClose={onClose}
      title="Editar permisos de módulo"
      subtitle={usuario ? `Para @${usuario.username}` : undefined}
    >
      {esAdmin && (
        <div className="flex items-start gap-2 bg-neon-purple/10 border border-neon-purple/40 rounded-xl px-3 py-2.5 text-xs text-gray-100 mb-3">
          <ShieldCheck className="h-4 w-4 text-neon-purple shrink-0 mt-0.5" />
          <span>
            Acceso total por rol: la administradora tiene lectura, escritura y
            actualización en todos los módulos. Los checkboxes están bloqueados.
          </span>
        </div>
      )}
      <div className="space-y-3">
        {items.map(({ key, label, desc }) => {
          const activo = valor(key);
          return (
            <label
              key={key}
              className={cn(
                "flex items-start gap-3 border rounded-xl px-4 py-3 transition-colors",
                esAdmin ? "cursor-not-allowed" : "cursor-pointer",
                activo
                  ? "border-acento/40 bg-acento/5"
                  : "border-surface-500 bg-surface-700"
              )}
            >
              <input
                type="checkbox"
                checked={activo}
                disabled={esAdmin}
                onChange={(e) => {
                  const cambios: Partial<Usuario> = {
                    ...pendiente,
                    [key]: e.target.checked,
                  };
                  setPendiente(cambios);
                }}
                className="mt-0.5 h-4 w-4 rounded accent-[var(--color-accento)] disabled:opacity-50"
              />
              <span>
                <span className="block text-sm font-bold text-gray-100">{label}</span>
                <span className="block text-[11px] text-muted">{desc}</span>
              </span>
            </label>
          );
        })}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-surface-500 text-muted hover:text-gray-100 transition-colors"
          >
            Cerrar
          </button>
          {!esAdmin && (
            <button
              type="button"
              onClick={guardar}
              disabled={!pendiente || accionando === usuario?.idPersona}
              className={cn(
                "flex-1 py-2.5 rounded-xl font-bold transition-all",
                pendiente && accionando !== usuario?.idPersona
                  ? "bg-neon-cyan text-btn-ink shadow-neon-cyan"
                  : "bg-surface-600 text-muted cursor-not-allowed"
              )}
            >
              {accionando === usuario?.idPersona ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Guardar permisos"}
            </button>
          )}
        </div>
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

/** ¿Quién puede hacer qué? — lo que el servidor ya valida, en una tabla. */
function MatrizPermisos() {
  const niveles: NivelUsuario[] = ["DUENO", "ADMIN", "ENCARGADO", "CAJERO"];
  return (
    <details className="rounded-2xl border border-surface-600 bg-surface-800 p-4" data-testid="matriz-permisos">
      <summary className="cursor-pointer text-sm font-bold text-gray-100">¿Qué puede hacer cada tipo de usuario?</summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-2 pr-3 font-semibold">Acción</th>
              {niveles.map((n) => (
                <th key={n} className="px-2 py-2 text-center font-semibold">
                  {NIVELES[n].titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MATRIZ_PERMISOS.map((f) => (
              <tr key={f.accion} className="border-t border-surface-700">
                <td className="py-1.5 pr-3 text-gray-200">{f.accion}</td>
                {niveles.map((n) => (
                  <td key={n} className="px-2 py-1.5 text-center">
                    {f.niveles.includes(n) ? (
                      <Check className="mx-auto h-4 w-4 text-emerald-300" aria-label="Sí" />
                    ) : (
                      <span className="text-muted" aria-label="No">—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-muted">
          Con «Perfiles» puedes crear tus propios puestos (p. ej. «Encargado de almacén») encendiendo o apagando cobro,
          inventario y reportes. Solo el dueño(a) asigna perfiles de administración.
        </p>
      </div>
    </details>
  );
}
