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
