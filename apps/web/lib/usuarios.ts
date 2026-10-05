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