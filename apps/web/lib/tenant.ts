import { prisma, Prisma, type PrismaClient } from "@papeleria/database";

// ============================================================
// MULTI-TENANT — cliente Prisma con alcance de negocio.
//
// `tenantDb(idNegocio)` devuelve un cliente que, en CADA operación sobre
// una tabla con `idNegocio`:
//   - lecturas / updateMany / deleteMany → agrega `idNegocio` al filtro;
//   - findUnique / update / delete / upsert → agrega `idNegocio` y traduce
//     las llaves que son únicas POR negocio (`{ codigoItem }` →
//     `{ idNegocio_codigoItem }`, `{ username }` → `{ idNegocio_username }`);
//   - create / createMany / escrituras anidadas → sella `idNegocio`.
//
// El aislamiento vive aquí, en un solo punto: una ruta no puede "olvidar"
// el filtro. Las rutas NO importan el cliente global; solo lo usan el login
// (aún no hay negocio), `getSession` y el alta de negocios.
// ============================================================

type Modelo = (typeof Prisma.dmmf.datamodel.models)[number];

interface LlaveCompuesta {
  nombre: string;
  campos: string[];
}

interface InfoModelo {
  esTenant: boolean;
  /** Llaves únicas compuestas que incluyen idNegocio (ej. idNegocio_codigoItem). */
  llaves: LlaveCompuesta[];
  /** campo de relación → modelo destino. */
  relaciones: Map<string, string>;
}

let cacheModelos: Map<string, InfoModelo> | null = null;

function modelos(): Map<string, InfoModelo> {
  if (cacheModelos) return cacheModelos;
  const out = new Map<string, InfoModelo>();
  for (const m of Prisma.dmmf.datamodel.models as readonly Modelo[]) {
    const llaves: LlaveCompuesta[] = [];
    const candidatas = [
      ...(m.primaryKey ? [m.primaryKey] : []),
      ...m.uniqueIndexes,
    ];
    for (const k of candidatas) {
      const campos = [...k.fields];
      if (campos.length > 1 && campos.includes("idNegocio")) {
        llaves.push({ nombre: k.name ?? campos.join("_"), campos });
      }
    }
    out.set(m.name, {
      esTenant: m.fields.some((f) => f.name === "idNegocio"),
      llaves,
      relaciones: new Map(
        m.fields.filter((f) => f.kind === "object").map((f) => [f.name, f.type])
      ),
    });
  }
  cacheModelos = out;
  return out;
}

const esEscalar = (v: unknown) =>
  v !== null && v !== undefined && (typeof v !== "object" || v instanceof Date);

/** Filtro único con alcance de negocio (traduce llaves únicas por negocio). */
function whereUnico(info: InfoModelo, where: any, idNegocio: string) {
  const w: Record<string, any> = { ...(where ?? {}) };
  for (const llave of info.llaves) {
    if (w[llave.nombre] !== undefined) {
      w[llave.nombre] = { ...w[llave.nombre], idNegocio };
      continue;
    }
    const propios = llave.campos.filter((c) => c !== "idNegocio");
    if (propios.every((c) => esEscalar(w[c]))) {
      const compuesta: Record<string, any> = { idNegocio };
      for (const c of propios) {
        compuesta[c] = w[c];
        delete w[c];
      }
      w[llave.nombre] = compuesta;
    }
  }
  w.idNegocio = idNegocio;
  return w;
}

/** Sella idNegocio en `data` y en toda escritura anidada (create / createMany…). */
function sellarData(modelo: string, data: any, idNegocio: string): any {
  if (Array.isArray(data)) return data.map((d) => sellarData(modelo, d, idNegocio));
  if (!data || typeof data !== "object") return data;
  const info = modelos().get(modelo);
  if (!info) return data;

  const out: Record<string, any> = { ...data };
  if (info.esTenant) out.idNegocio = idNegocio;

  for (const [campo, destino] of info.relaciones) {
    const anidado = out[campo];
    if (!anidado || typeof anidado !== "object") continue;
    const copia: Record<string, any> = { ...anidado };
    if (copia.create !== undefined) copia.create = sellarData(destino, copia.create, idNegocio);
    if (copia.createMany?.data !== undefined) {
      copia.createMany = {
        ...copia.createMany,
        data: sellarData(destino, copia.createMany.data, idNegocio),
      };
    }
    for (const op of ["connectOrCreate", "upsert"] as const) {
      if (copia[op] === undefined) continue;
      const sellar = (x: any) => ({ ...x, create: sellarData(destino, x.create, idNegocio) });
      copia[op] = Array.isArray(copia[op]) ? copia[op].map(sellar) : sellar(copia[op]);
    }
    out[campo] = copia;
  }
  return out;
}

const OPS_UNICAS = new Set(["findUnique", "findUniqueOrThrow", "update", "delete"]);
const OPS_FILTRO = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "deleteMany",
]);

function construir(idNegocio: string): PrismaClient {
  const extendido = prisma.$extends({
    name: "tenant",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const info = modelos().get(model);
          if (!info?.esTenant) return query(args);
          const a: any = { ...(args as any) };

          if (OPS_UNICAS.has(operation)) {
            a.where = whereUnico(info, a.where, idNegocio);
            if (a.data !== undefined) {
              // update: sella solo lo anidado; el dueño de la fila no cambia.
              const { idNegocio: _omit, ...resto } = sellarData(model, a.data, idNegocio);
              a.data = resto;
            }
          } else if (OPS_FILTRO.has(operation)) {
            a.where = { ...(a.where ?? {}), idNegocio };
            if (operation === "updateMany" && a.data) {
              const { idNegocio: _omit, ...resto } = a.data;
              a.data = resto;
            }
          } else if (operation === "create") {
            a.data = sellarData(model, a.data, idNegocio);
          } else if (operation === "createMany" || operation === "createManyAndReturn") {
            a.data = sellarData(model, a.data, idNegocio);
          } else if (operation === "upsert") {
            a.where = whereUnico(info, a.where, idNegocio);
            a.create = sellarData(model, a.create, idNegocio);
            const { idNegocio: _omit, ...resto } = sellarData(model, a.update ?? {}, idNegocio);
            a.update = resto;
          } else {
            // Operación desconocida sobre una tabla con dueño: mejor fallar
            // que arriesgar una fuga entre negocios.
            throw new Error(`Operación ${operation} sin alcance de negocio en ${model}`);
          }
          return query(a);
        },
      },
    },
  });
  // La extensión solo intercepta consultas: la superficie del cliente no cambia.
  return extendido as unknown as PrismaClient;
}

const clientes = new Map<string, PrismaClient>();

/** Cliente Prisma limitado a los datos de un negocio. */
export function tenantDb(idNegocio: string): PrismaClient {
  // En pruebas unitarias `prisma` es un doble sin `$extends`: se usa tal cual.
  if (typeof (prisma as any).$extends !== "function") return prisma;
  if (!idNegocio) {
    throw new Error("tenantDb: falta idNegocio (sesión sin negocio)");
  }
  let db = clientes.get(idNegocio);
  if (!db) {
    db = construir(idNegocio);
    clientes.set(idNegocio, db);
  }
  return db;
}

// Exportado para pruebas de aislamiento.
export const _interno = { whereUnico, sellarData, modelos };
