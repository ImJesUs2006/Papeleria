import { hash } from "bcryptjs";
import type { PrismaClient } from "@papeleria/database";

// ============================================================
// Alta de negocios (arrendatarios).
// Crea, en una sola transacción, el negocio, su configuración inicial
// (con el asistente de arranque pendiente) y su primera administradora.
// Recibe el cliente GLOBAL: es una operación de plataforma, anterior a
// cualquier sesión de ese negocio.
// ============================================================

export class NegocioError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "NegocioError";
    this.status = status;
  }
}

export interface AltaNegocioInput {
  codigo: string;
  nombre: string;
  admin: { nombre: string; username: string; password: string };
}

const CODIGO_RE = /^[a-z0-9][a-z0-9-]{2,39}$/;
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,40}$/;

/** Normaliza y valida la entrada; lanza NegocioError con el primer problema. */
export function validarAltaNegocio(raw: any): AltaNegocioInput {
  const codigo = String(raw?.codigo ?? "").trim().toLowerCase();
  const nombre = String(raw?.nombre ?? "").trim();
  const adminNombre = String(raw?.admin?.nombre ?? "").trim();
  const username = String(raw?.admin?.username ?? "").trim();
  const password = String(raw?.admin?.password ?? "");

  if (!CODIGO_RE.test(codigo)) {
    throw new NegocioError(
      "Código de negocio inválido: 3 a 40 caracteres, solo minúsculas, números y guiones"
    );
  }
  if (nombre.length < 2 || nombre.length > 120) {
    throw new NegocioError("El nombre del negocio debe tener entre 2 y 120 caracteres");
  }
  if (adminNombre.length < 2 || adminNombre.length > 120) {
    throw new NegocioError("Indica el nombre de la persona administradora");
  }
  if (!USERNAME_RE.test(username)) {
    throw new NegocioError("Usuario inválido: 3 a 40 caracteres (letras, números, . _ -)");
  }
  if (password.length < 8) {
    throw new NegocioError("La contraseña debe tener al menos 8 caracteres");
  }
  return { codigo, nombre, admin: { nombre: adminNombre, username, password } };
}

export async function crearNegocio(prisma: PrismaClient, raw: unknown) {
  const input = validarAltaNegocio(raw);

  const existente = await prisma.negocio.findUnique({ where: { codigo: input.codigo } });
  if (existente) {
    throw new NegocioError(`Ya existe un negocio con el código "${input.codigo}"`, 409);
  }

  const passwordHash = await hash(input.admin.password, 12);

  return prisma.$transaction(async (tx) => {
    const negocio = await tx.negocio.create({
      data: { codigo: input.codigo, nombre: input.nombre },
    });
    const admin = await tx.usuario.create({
      data: {
        idNegocio: negocio.idNegocio,
        nombre: input.admin.nombre,
        username: input.admin.username,
        passwordHash,
        rol: "ADMINISTRADORA",
        isRoot: true,
      },
      select: { idPersona: true, username: true },
    });
    await tx.configuracionNegocio.create({
      data: {
        idNegocio: negocio.idNegocio,
        nombreNegocio: input.nombre,
        setupPendiente: true,
      },
    });
    await tx.bitacoraLog.create({
      data: {
        idNegocio: negocio.idNegocio,
        idUsuario: admin.idPersona,
        accion: `Alta del negocio "${input.nombre}" (${input.codigo})`,
        moduloSistema: "SETUP",
      },
    });
    return {
      idNegocio: negocio.idNegocio,
      codigo: negocio.codigo,
      nombre: negocio.nombre,
      admin: admin.username,
    };
  });
}
