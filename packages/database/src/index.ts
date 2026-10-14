import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Valores explícitos (Turbopack no puede reexportar con `export *` un
// módulo CommonJS sin avisos) y todos los tipos de modelos.
export { Prisma, PrismaClient } from "@prisma/client";
export type * from "@prisma/client";
