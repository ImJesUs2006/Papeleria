import type { Prisma } from "@papeleria/database";

// ============================================================
// Llaves únicas POR negocio.
// `codigoItem`, `codigoBarras` y `username` ya no son únicos globales:
// lo son dentro de cada negocio. Estas funciones construyen el filtro
// único "lógico"; el cliente con alcance de negocio (lib/tenant) lo
// traduce a la llave compuesta real (`idNegocio_codigoItem`, …) antes
// de consultar. Con el cliente global fallan, que es lo deseado.
// ============================================================

export function claveProducto(codigoItem: string): Prisma.ProductoWhereUniqueInput {
  return { codigoItem } as unknown as Prisma.ProductoWhereUniqueInput;
}

export function claveCodigoBarras(codigoBarras: string): Prisma.ProductoWhereUniqueInput {
  return { codigoBarras } as unknown as Prisma.ProductoWhereUniqueInput;
}

export function claveUsuario(username: string): Prisma.UsuarioWhereUniqueInput {
  return { username } as unknown as Prisma.UsuarioWhereUniqueInput;
}
