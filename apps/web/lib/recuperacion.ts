import { createHash, randomBytes } from "crypto";
import { hash } from "bcryptjs";
import { prisma } from "@papeleria/database";
import { tenantDb } from "@/lib/tenant";

// ============================================================
// Recuperar la contraseña con un enlace de un solo uso.
// - El token viaja solo en el correo; en la base queda su hash (SHA-256).
// - Caduca en 1 hora y un enlace nuevo invalida los anteriores.
// - Usarlo cambia la contraseña, cierra las sesiones abiertas
//   (passwordCambiadaEn) y queda en la bitácora del negocio.
// Usa el cliente global: el enlace llega sin sesión ni negocio.
// ============================================================

export const VIGENCIA_ENLACE_MS = 60 * 60_000;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function crearEnlace(usuario: { idPersona: string; idNegocio: string }, ahora = new Date()): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const { idPersona, idNegocio } = usuario;
  await prisma.$transaction([
    prisma.recuperacionClave.deleteMany({ where: { idNegocio, idPersona, usadoEn: null } }),
    prisma.recuperacionClave.create({
      data: { idNegocio, idPersona, tokenHash: hashToken(token), expiraEn: new Date(ahora.getTime() + VIGENCIA_ENLACE_MS) },
    }),
  ]);
  return token;
}

export class EnlaceError extends Error {}

/** Persona dueña de un enlace vigente, o error explicando por qué no sirve. */
export async function validarEnlace(token: unknown, ahora = new Date()) {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) throw new EnlaceError("El enlace no es válido");
  const r = await prisma.recuperacionClave.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!r) throw new EnlaceError("El enlace no es válido");
  if (r.usadoEn) throw new EnlaceError("Este enlace ya se usó. Pide uno nuevo si lo necesitas.");
  if (r.expiraEn <= ahora) throw new EnlaceError("El enlace caducó. Pide uno nuevo.");
  const usuario = await prisma.usuario.findFirst({
    where: { idPersona: r.idPersona, idNegocio: r.idNegocio },
    select: { idPersona: true, nombre: true, username: true, idNegocio: true, activa: true, eliminadoEn: true },
  });
  if (!usuario || !usuario.activa || usuario.eliminadoEn) throw new EnlaceError("La cuenta ya no está activa");
  return { registro: r, usuario };
}

export async function restablecerConEnlace(token: unknown, nueva: unknown) {
  if (typeof nueva !== "string" || nueva.length < 8 || nueva.length > 200) {
    throw new EnlaceError("La nueva contraseña debe tener al menos 8 caracteres");
  }
  const { registro, usuario } = await validarEnlace(token);
  const passwordHash = await hash(nueva, 10);
  const db = tenantDb(usuario.idNegocio);
  await prisma.$transaction(async (tx) => {
    // Marca de uso condicionada: dos envíos simultáneos no lo usan dos veces.
    const { count } = await tx.recuperacionClave.updateMany({
      where: { id: registro.id, usadoEn: null },
      data: { usadoEn: new Date() },
    });
    if (count === 0) throw new EnlaceError("Este enlace ya se usó. Pide uno nuevo si lo necesitas.");
    await tx.usuario.update({
      where: { idPersona: usuario.idPersona },
      data: { passwordHash, passwordCambiadaEn: new Date() },
    });
  });
  await db.bitacoraLog.create({
    data: {
      idUsuario: usuario.idPersona,
      accion: `Contraseña restablecida con enlace de recuperación (${usuario.username})`,
      moduloSistema: "SEGURIDAD",
    },
  });
  return usuario;
}
