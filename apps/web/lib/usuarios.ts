import { prisma } from "@papeleria/database";

// ============================================================
// Regla anti-bloqueo: siempre debe existir al menos una
// ADMINISTRADORA activa. Se usa para autorizar cambios que
// podrían desactivar/degradar/eliminar a la última.
// ============================================================

export async function tieneOtroAdminActivo(excludeIdPersona: string): Promise<boolean> {
  const restantes = await prisma.usuario.count({
    where: {
      rol: "ADMINISTRADORA",
      activa: true,
      idPersona: { not: excludeIdPersona },
    },
  });
  return restantes > 0;
}

export async function contarAdminsActivos(): Promise<number> {
  return prisma.usuario.count({ where: { rol: "ADMINISTRADORA", activa: true } });
}