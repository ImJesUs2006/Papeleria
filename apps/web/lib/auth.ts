import { cookies } from "next/headers";
import { verifyToken, type AuthPayload } from "@/lib/jwt";

export type { AuthPayload } from "@/lib/jwt";
export { signToken } from "@/lib/jwt";

export async function getSession(): Promise<AuthPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("papeleria_token")?.value;
  if (!token) return null;
  return verifyToken(token);
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
  return PERMISSIONS[rol]?.includes(permission) ?? false;
}