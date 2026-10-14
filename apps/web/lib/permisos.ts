// Permisos granulares (Fase 9 / ABAC). Funciones puras sobre la sesión ya
// validada contra la BD por `getSession` (lib/auth).

export interface SesionPermisos {
  rol: string;
  permisoCobrar?: boolean;
  permisoInventario?: boolean;
  permisoReportes?: boolean;
}

/**
 * La ADMINISTRADORA siempre puede cobrar; a una CAJERA se le puede retirar
 * el cobro desde Configuración → Usuarios.
 */
export function puedeCobrar(user: SesionPermisos): boolean {
  return user.rol === "ADMINISTRADORA" || user.permisoCobrar !== false;
}

export type PermisoModulo = "cobrar" | "inventario" | "reportes";

/**
 * Permiso de módulo efectivo. La ADMINISTRADORA tiene acceso total; para
 * el resto, inventario y reportes deben estar concedidos explícitamente
 * (por su perfil o desde Configuración → Usuarios).
 */
export function tienePermiso(user: SesionPermisos, permiso: PermisoModulo): boolean {
  if (user.rol === "ADMINISTRADORA") return true;
  if (permiso === "cobrar") return user.permisoCobrar !== false;
  if (permiso === "inventario") return user.permisoInventario === true;
  return user.permisoReportes === true;
}
