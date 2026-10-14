import type { PrismaClient } from "@papeleria/database";

// ============================================================
// Perfiles: roles con nombre propio del negocio. Un perfil es una
// plantilla (rol base + permisos de módulo); asignarlo copia esos
// valores al usuario, y editarlo los propaga a todos sus usuarios.
// `db` es el cliente con alcance de negocio (lib/tenant).
// ============================================================

export class PerfilError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface PerfilInput {
  nombre: string;
  rolBase: "ADMINISTRADORA" | "CAJERA";
  permisoCobrar: boolean;
  permisoInventario: boolean;
  permisoReportes: boolean;
}

export function validarPerfil(raw: any, parcial = false): Partial<PerfilInput> {
  const out: Partial<PerfilInput> = {};
  if (!parcial || raw?.nombre !== undefined) {
    const nombre = String(raw?.nombre ?? "").trim();
    if (nombre.length < 2 || nombre.length > 40) {
      throw new PerfilError("El nombre del perfil debe tener entre 2 y 40 caracteres");
    }
    out.nombre = nombre;
  }
  if (!parcial || raw?.rolBase !== undefined) {
    const rol = raw?.rolBase ?? "CAJERA";
    if (rol !== "ADMINISTRADORA" && rol !== "CAJERA") throw new PerfilError("Rol base inválido");
    out.rolBase = rol;
  }
  for (const k of ["permisoCobrar", "permisoInventario", "permisoReportes"] as const) {
    if (raw?.[k] === undefined) {
      if (!parcial) out[k] = k === "permisoCobrar";
      continue;
    }
    if (typeof raw[k] !== "boolean") throw new PerfilError(`Valor de ${k} inválido`);
    out[k] = raw[k];
  }
  return out;
}

/** Valores que un perfil impone a sus usuarios. */
export function valoresDePerfil(p: PerfilInput) {
  return {
    rol: p.rolBase,
    permisoCobrar: p.permisoCobrar,
    permisoInventario: p.permisoInventario,
    permisoReportes: p.permisoReportes,
  };
}

/** Busca el perfil del negocio y devuelve los datos a copiar al usuario. */
export async function datosPorPerfil(
  db: Pick<PrismaClient, "perfil">,
  idPerfil: string
) {
  const perfil = await db.perfil.findUnique({ where: { idPerfil } });
  if (!perfil) throw new PerfilError("Perfil no encontrado", 404);
  return { idPerfil: perfil.idPerfil, ...valoresDePerfil(perfil) };
}
