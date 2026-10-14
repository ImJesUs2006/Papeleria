import { cookies } from "next/headers";
import { prisma } from "@papeleria/database";
import { verifyToken, type AuthPayload } from "@/lib/jwt";
import { tienePermiso, type PermisoModulo } from "@/lib/permisos";

export type { AuthPayload } from "@/lib/jwt";
export { signToken } from "@/lib/jwt";

export async function getSession(): Promise<AuthPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("papeleria_token")?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;

  // El token solo prueba identidad. Estado, rol y permisos se leen de la BD
  // en cada petición: una cuenta desactivada o degradada pierde el acceso de
  // inmediato, sin esperar a que el token expire.
  const user = await prisma.usuario.findUnique({
    where: { idPersona: payload.idPersona },
    select: {
      activa: true,
      idNegocio: true,
      idSucursal: true,
      negocio: { select: { activo: true } },
      nombre: true,
      rol: true,
      permisoCobrar: true,
      permisoInventario: true,
      permisoReportes: true,
    },
  });
  // Negocio suspendido ⇒ nadie de ese negocio opera.
  if (!user || !user.activa || !user.negocio?.activo) return null;

  return {
    ...payload,
    // El negocio SIEMPRE sale de la BD (nunca del token ni del cliente).
    idNegocio: user.idNegocio,
    idSucursal: await resolverSucursal(user, cookieStore.get(COOKIE_SUCURSAL)?.value),
    nombre: user.nombre,
    rol: user.rol,
    permisoCobrar: user.permisoCobrar,
    permisoInventario: user.permisoInventario,
    permisoReportes: user.permisoReportes,
  };
}


/**
 * Exige sesión y, opcionalmente, uno de `allowedRoles`. Con `opciones.permiso`
 * también pasa quien tenga ese permiso de módulo (perfiles / permisos
 * granulares): p. ej. un encargado de almacén con permiso de inventario.
 */
/** Cookie con la sucursal que eligió la administradora para operar. */
export const COOKIE_SUCURSAL = "papeleria_sucursal";

/**
 * Sucursal de la sesión: la asignada al usuario; si no tiene, la que eligió
 * una administradora (cookie, validada contra su negocio); si no, la matriz.
 */
async function resolverSucursal(
  user: { idNegocio: string; idSucursal: string | null; rol: string },
  elegida: string | undefined
): Promise<string | null> {
  if (user.idSucursal && user.rol !== "ADMINISTRADORA") return user.idSucursal;
  if (elegida && user.rol === "ADMINISTRADORA") {
    const valida = await prisma.sucursal.findFirst({
      where: { idSucursal: elegida, idNegocio: user.idNegocio, activa: true },
      select: { idSucursal: true },
    });
    if (valida) return valida.idSucursal;
  }
  if (user.idSucursal) return user.idSucursal;
  const matriz = await prisma.sucursal.findFirst({
    where: { idNegocio: user.idNegocio, esMatriz: true },
    select: { idSucursal: true },
  });
  return matriz?.idSucursal ?? null;
}

export function requireAuth(allowedRoles?: string[], opciones?: { permiso?: PermisoModulo }) {
  return async function middleware() {
    const session = await getSession();

    if (!session) {
      return { error: "No autenticado", status: 401 };
    }

    if (
      allowedRoles &&
      !allowedRoles.includes(session.rol) &&
      !(opciones?.permiso && tienePermiso(session, opciones.permiso))
    ) {
      return { error: "Sin permisos", status: 403 };
    }

    return { user: session };
  };
}

const PERMISSIONS: Record<string, string[]> = {
  ADMINISTRADORA: [
    "dashboard.ver",
    "caja.abrir", "caja.cerrar", "cobro.realizar",
    "inventario.ver", "inventario.editar", "inventario.carga_masiva",
    "proveedores.ver", "pedidos.ver",
    "devoluciones.ver", "devoluciones.registrar",
    "reportes.ver", "reportes.exportar",
    "configuracion.usuarios", "configuracion.roles",
    "bitacora.ver",
    "facturacion.ver",
  ],
  CAJERA: [
    "caja.abrir", "caja.cerrar", "cobro.realizar",
    "devoluciones.ver", "devoluciones.registrar",
  ],
};

export function hasPermission(rol: string, permission: string): boolean {
  // Fase 10 · Admin Override: la ADMINISTRADORA tiene acceso de lectura,
  // escritura y actualización a TODO, sin importar los checkboxes granulares.
  if (rol === "ADMINISTRADORA") return true;
  return PERMISSIONS[rol]?.includes(permission) ?? false;
}