// ============================================================
// npm run db:baseline
//
// Prepara una base creada con el método anterior (`prisma db push`) para
// usar migraciones, SIN borrar datos:
//   1. Si ya tiene historial de migraciones → solo aplica las pendientes.
//   2. Si está vacía → aplica todas las migraciones.
//   3. Si tiene tablas pero no historial:
//      a) le faltan tablas de la versión base (Fase 12) → las agrega con el
//         esquema de esa versión (git), sin aceptar pérdida de datos;
//      b) marca la migración inicial como aplicada;
//      c) aplica las migraciones restantes.
// Antes de tocar nada pide un respaldo (o --sin-respaldo para omitir).
// ============================================================
import { execSync } from "node:child_process";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = join(raiz, "prisma", "schema.prisma");
const MIGRACION_INICIAL = "20261005000000_init";
// Commit cuyo esquema corresponde a la migración inicial (Fase 12).
const COMMIT_BASE = "29d7771";
const TABLAS_BASE = [
  "usuarios", "productos", "categorias", "proveedores", "pedidos_proveedor",
  "items_pedido_proveedor", "ventas", "lineas_detalle_venta", "sesiones_caja",
  "configuracion_negocio", "snapshots_seguridad", "bitacora_logs", "devoluciones",
  "devolucion_lineas", "pagos_proveedor", "clientes", "facturas", "apartados",
  "apartado_lineas", "movimientos_kardex", "retiros_efectivo",
];

const prisma = (cmd) => {
  console.log(`\n$ prisma ${cmd}`);
  execSync(`npx prisma ${cmd}`, { cwd: raiz, stdio: "inherit" });
};

const db = new PrismaClient();
try {
  const tablas = (
    await db.$queryRawUnsafe(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    )
  ).map((t) => t.table_name);

  if (tablas.includes("_prisma_migrations")) {
    console.log("La base ya usa migraciones: se aplican solo las pendientes.");
    prisma(`migrate deploy --schema "${SCHEMA}"`);
  } else if (tablas.length === 0) {
    console.log("Base vacía: se crean todas las tablas con las migraciones.");
    prisma(`migrate deploy --schema "${SCHEMA}"`);
  } else {
    if (!process.argv.includes("--sin-respaldo")) {
      console.log(
        "\nEsta base tiene datos y no tiene historial de migraciones.\n" +
          "Haz un respaldo antes de continuar, por ejemplo:\n" +
          "  docker exec papeleria-db pg_dump -U <usuario> -d <base> -Fc -f /tmp/respaldo.dump\n" +
          "  docker cp papeleria-db:/tmp/respaldo.dump ./respaldo.dump\n\n" +
          "Cuando lo tengas, vuelve a ejecutar:  npm run db:baseline -- --sin-respaldo"
      );
      process.exitCode = 1;
    } else {
      const faltan = TABLAS_BASE.filter((t) => !tablas.includes(t));
      if (faltan.length > 0) {
        console.log(`\nA la base le faltan tablas de la versión base: ${faltan.join(", ")}`);
        console.log("Se agregan con el esquema de esa versión (sin aceptar pérdida de datos).");
        const temporal = join(raiz, "prisma", "schema-base.tmp.prisma");
        try {
          const esquemaBase = execSync(`git show ${COMMIT_BASE}:packages/database/prisma/schema.prisma`, {
            cwd: raiz,
            encoding: "utf8",
          });
          writeFileSync(temporal, esquemaBase, "utf8");
          // Sin --accept-data-loss: si algo implicara borrar datos, se detiene.
          prisma(`db push --skip-generate --schema "${temporal}"`);
        } finally {
          if (existsSync(temporal)) unlinkSync(temporal);
        }
      }
      prisma(`migrate resolve --applied ${MIGRACION_INICIAL} --schema "${SCHEMA}"`);
      prisma(`migrate deploy --schema "${SCHEMA}"`);
      console.log("\nListo: la base ya usa migraciones y está al día.");
    }
  }
} finally {
  await db.$disconnect();
}
