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

// ============================================================
// Eliminar a alguien con historial: se ANONIMIZA. Sus ventas, cortes y
// bitácora se conservan (auditoría y obligación fiscal), pero ya no dicen
// quién era: nombre y usuario se reemplazan, la contraseña deja de servir
// y desaparece de las listas. Sin historial se borra de verdad.
// ============================================================

export const NOMBRE_ANONIMO = "Usuario eliminado";

/** Alias estable y sin datos personales para la persona anonimizada. */
export const aliasAnonimo = (idPersona: string) => `eliminado-${idPersona.slice(0, 8)}`;

/** Reemplaza nombre y usuario reales dentro de un texto de bitácora. */
export function anonimizarTexto(texto: string, datos: { nombre: string; username: string; alias: string }): string {
  let out = texto;
  // Primero el nombre (puede contener al usuario) y luego el usuario.
  for (const [real, falso] of [
    [datos.nombre, NOMBRE_ANONIMO],
    [datos.username, datos.alias],
  ] as const) {
    if (real && real.length >= 3) out = out.split(real).join(falso);
  }
  return out;
}

type DbAnonimizar = Pick<PrismaClient, "usuario" | "bitacoraLog">;

export async function anonimizarUsuario(
  tx: DbAnonimizar,
  objetivo: { idPersona: string; nombre: string; username: string },
  passwordHashInservible: string
): Promise<{ alias: string; registrosAnonimizados: number }> {
  const alias = aliasAnonimo(objetivo.idPersona);
  await tx.usuario.update({
    where: { idPersona: objetivo.idPersona },
    data: {
      nombre: NOMBRE_ANONIMO,
      username: alias,
      passwordHash: passwordHashInservible,
      activa: false,
      isRoot: false,
      permisoCobrar: false,
      permisoInventario: false,
      permisoReportes: false,
      idPerfil: null,
      ultimoLoginAt: null,
      eliminadoEn: new Date(),
    },
  });
  // Textos de bitácora que lo nombran (los de cualquier usuario).
  const menciones = await tx.bitacoraLog.findMany({
    where: {
      OR: [
        { accion: { contains: objetivo.nombre } },
        { accion: { contains: objetivo.username } },
      ],
    },
    select: { idLog: true, accion: true },
  });
  const datos = { nombre: objetivo.nombre, username: objetivo.username, alias };
  let registrosAnonimizados = 0;
  for (const m of menciones) {
    const accion = anonimizarTexto(m.accion, datos);
    if (accion === m.accion) continue;
    await tx.bitacoraLog.update({ where: { idLog: m.idLog }, data: { accion } });
    registrosAnonimizados++;
  }
  return { alias, registrosAnonimizados };
}
