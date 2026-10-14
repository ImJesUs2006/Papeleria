import { compare } from "bcryptjs";
import type { PrismaClient } from "@papeleria/database";
import { claveUsuario } from "./tenant-keys";

// ============================================================
// Autorización en mostrador: una ADMINISTRADORA del MISMO negocio
// aprueba una operación que excede los permisos de la cajera (p. ej.
// un descuento mayor al tope) tecleando su usuario y contraseña.
// `db` es el cliente con alcance de negocio: una administradora de otro
// negocio no puede autorizar.
// ============================================================

export class AutorizacionError extends Error {}

/**
 * Devuelve el idPersona de quien autoriza, `null` si no se envió
 * autorización, o lanza AutorizacionError si las credenciales no sirven.
 */
export async function verificarAutorizacion(
  db: Pick<PrismaClient, "usuario">,
  raw: unknown
): Promise<string | null> {
  if (!raw || typeof raw !== "object") return null;
  const { username, password } = raw as { username?: unknown; password?: unknown };
  if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
    throw new AutorizacionError("Autorización incompleta: usuario y contraseña de la administradora");
  }
  const admin = await db.usuario.findUnique({ where: claveUsuario(username.trim()) });
  const valida =
    admin && admin.activa && admin.rol === "ADMINISTRADORA"
      ? await compare(password, admin.passwordHash)
      : false;
  if (!admin || !valida) {
    throw new AutorizacionError("Autorización rechazada: credenciales de administradora inválidas");
  }
  return admin.idPersona;
}
