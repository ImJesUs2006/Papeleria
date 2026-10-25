// ============================================================
// Tipos de usuario (Fase F) — puro: pantalla y servidor.
//
//   Dueño(a)          ADMINISTRADORA con isRoot. Uno por negocio, se transfiere.
//                     Única persona que crea, degrada, desactiva o cambia la
//                     clave de administradores, y la única que reinicia el sistema.
//   Administrador(a)  ADMINISTRADORA: todo, menos manejar administradores.
//   Encargado(a)      CAJERA con inventario y reportes: compras, existencias,
//                     reportes, cortes; sin configuración ni usuarios.
//   Cajero(a)         CAJERA: cobro y su caja.
//
// Se construye sobre los roles y permisos que ya validan todas las rutas: no
// cambia quién puede usar cada API, agrega quién puede tocar a quién.
// ============================================================

export type NivelUsuario = "DUENO" | "ADMIN" | "ENCARGADO" | "CAJERO";

export interface UsuarioRol {
  rol: string;
  isRoot?: boolean | null;
  permisoInventario?: boolean | null;
  permisoReportes?: boolean | null;
}

export const NIVELES: Record<NivelUsuario, { titulo: string; resumen: string }> = {
  DUENO: { titulo: "Dueño(a)", resumen: "Todo, y es quien maneja a los administradores." },
  ADMIN: { titulo: "Administrador(a)", resumen: "Todo, menos crear o quitar administradores." },
  ENCARGADO: { titulo: "Encargado(a)", resumen: "Inventario, compras y reportes, además de cobrar." },
  CAJERO: { titulo: "Cajero(a)", resumen: "Cobro y su caja." },
};

export function nivelDe(u: UsuarioRol): NivelUsuario {
  if (u.rol === "ADMINISTRADORA") return u.isRoot ? "DUENO" : "ADMIN";
  return u.permisoInventario || u.permisoReportes ? "ENCARGADO" : "CAJERO";
}

/** Plantillas para dar de alta rápido (rol base + permisos). */
export const PLANTILLAS_USUARIO: Record<
  Exclude<NivelUsuario, "DUENO">,
  { rol: "ADMINISTRADORA" | "CAJERA"; permisoCobrar: boolean; permisoInventario: boolean; permisoReportes: boolean }
> = {
  ADMIN: { rol: "ADMINISTRADORA", permisoCobrar: true, permisoInventario: true, permisoReportes: true },
  ENCARGADO: { rol: "CAJERA", permisoCobrar: true, permisoInventario: true, permisoReportes: true },
  CAJERO: { rol: "CAJERA", permisoCobrar: true, permisoInventario: false, permisoReportes: false },
};

/** ¿Quién puede hacer qué? (lo que ya validan las rutas, en una tabla). */
export const MATRIZ_PERMISOS: Array<{ accion: string; niveles: NivelUsuario[] }> = [
  { accion: "Cobrar y abrir/cerrar su caja", niveles: ["DUENO", "ADMIN", "ENCARGADO", "CAJERO"] },
  { accion: "Devoluciones (montos altos con autorización)", niveles: ["DUENO", "ADMIN", "ENCARGADO", "CAJERO"] },
  { accion: "Clientes y apartados", niveles: ["DUENO", "ADMIN", "ENCARGADO", "CAJERO"] },
  { accion: "Inventario, lotes y traspasos", niveles: ["DUENO", "ADMIN", "ENCARGADO"] },
  { accion: "Proveedores y pedidos", niveles: ["DUENO", "ADMIN", "ENCARGADO"] },
  { accion: "Dashboard y reportes", niveles: ["DUENO", "ADMIN", "ENCARGADO"] },
  { accion: "Retiros de efectivo y cancelar cajas", niveles: ["DUENO", "ADMIN"] },
  { accion: "Facturación", niveles: ["DUENO", "ADMIN"] },
  { accion: "Configuración, módulos y bitácora", niveles: ["DUENO", "ADMIN"] },
  { accion: "Crear cajeros(as) y encargados(as)", niveles: ["DUENO", "ADMIN"] },
  { accion: "Crear, degradar o quitar administradores", niveles: ["DUENO"] },
  { accion: "Reiniciar o restaurar el sistema", niveles: ["DUENO"] },
  { accion: "Transferir la propiedad del negocio", niveles: ["DUENO"] },
];

export class RolError extends Error {
  readonly status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

/**
 * Valida que `actor` pueda aplicar `cambio` sobre `objetivo` (null = alta).
 * `actorEsDueno` ya contempla el caso de un negocio sin dueño marcado.
 */
export function validarGestion(p: {
  actorId: string;
  actorEsDueno: boolean;
  objetivo: (UsuarioRol & { idPersona: string; activa?: boolean }) | null;
  cambio: { rolNuevo?: string; desactivar?: boolean; eliminar?: boolean; clave?: boolean };
}): void {
  const { actorId, actorEsDueno, objetivo, cambio } = p;
  const propio = objetivo?.idPersona === actorId;

  if (objetivo?.isRoot) {
    if (!propio) throw new RolError("La cuenta del dueño(a) solo la modifica el propio dueño(a)");
    if (cambio.rolNuevo && cambio.rolNuevo !== "ADMINISTRADORA") {
      throw new RolError("El dueño(a) no puede quitarse el rol: primero transfiere la propiedad", 409);
    }
    if (cambio.desactivar || cambio.eliminar) {
      throw new RolError("El dueño(a) no puede desactivarse: primero transfiere la propiedad", 409);
    }
    return;
  }
  const tocaAdmin = objetivo?.rol === "ADMINISTRADORA" || cambio.rolNuevo === "ADMINISTRADORA";
  if (tocaAdmin && !actorEsDueno && !(propio && !cambio.rolNuevo && !cambio.desactivar && !cambio.eliminar)) {
    throw new RolError("Solo el dueño(a) puede crear, cambiar o quitar administradores");
  }
}
