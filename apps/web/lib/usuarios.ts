import type { PrismaClient } from "@papeleria/database";

type Db = Pick<PrismaClient, "usuario">;

// ============================================================
// Regla anti-bloqueo: siempre debe existir al menos una
// ADMINISTRADORA activa EN EL NEGOCIO (el cliente recibido ya viene con
// alcance de negocio). Se usa para autorizar cambios que
// podrían desactivar/degradar/eliminar a la última.
// ============================================================

export async function tieneOtroAdminActivo(prisma: Db, excludeIdPersona: string): Promise<boolean> {
  const restantes = await prisma.usuario.count({
    where: {
      rol: "ADMINISTRADORA",
      activa: true,
      idPersona: { not: excludeIdPersona },
    },
  });
  return restantes > 0;
}

export async function contarAdminsActivos(prisma: Db): Promise<number> {
  return prisma.usuario.count({ where: { rol: "ADMINISTRADORA", activa: true } });
}

/**
 * ¿La sesión actúa como dueño(a)? Es la administradora marcada como raíz o,
 * si el negocio no tiene dueño marcado (datos viejos), cualquier
 * administradora: nunca se queda nadie sin poder administrar.
 */
export async function actuaComoDueno(
  prisma: Db,
  sesion: { rol: string; isRoot?: boolean }
): Promise<boolean> {
  if (sesion.rol !== "ADMINISTRADORA") return false;
  if (sesion.isRoot) return true;
  const duenos = await prisma.usuario.count({ where: { isRoot: true, activa: true } });
  return duenos === 0;
}
