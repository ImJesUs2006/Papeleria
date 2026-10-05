import { cookies } from "next/headers";
import { prisma } from "@papeleria/database";
import { verifyToken, type AuthPayload } from "@/lib/jwt";

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
    nombre: user.nombre,
    rol: user.rol,
    permisoCobrar: user.permisoCobrar,
    permisoInventario: user.permisoInventario,
    permisoReportes: user.permisoReportes,
  };
}


export function requireAuth(allowedRoles?: string[]) {
  return async function middleware() {
    const session = await getSession();

    if (!session) {
      return { error: "No autenticado", status: 401 };
    }

    if (allowedRoles && !allowedRoles.includes(session.rol)) {
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