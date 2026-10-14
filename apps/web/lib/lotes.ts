import type { Prisma } from "@papeleria/database";
import { moverStock } from "./existencias";
import { registrarMovimientosKardex } from "./kardex";
import { claveProducto } from "./tenant-keys";

// ============================================================
// Lotes con caducidad (Paso 6).
//
// La EXISTENCIA sigue viviendo en `Existencia` (por sucursal); los lotes
// desglosan cuánto de esa existencia pertenece a cada lote y cuándo caduca.
// La venta consume FEFO (primero lo que caduca antes) y NUNCA toma lotes
// vencidos: esos se dan de baja como merma.
// ============================================================

type Tx = Prisma.TransactionClient;

export class LoteError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface ConsumoLote {
  numeroLote: string;
  cantidad: number;
  caducidad: string | null;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Inicio del día de hoy: un lote que caduca hoy todavía se puede vender. */
function hoy(ahora = new Date()): Date {
  return new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
}

/**
 * Entrada de mercancía con lote: suma al lote (o lo crea), mueve la
 * existencia de la sucursal y el total, y deja kardex ENTRADA.
 */
export async function registrarEntradaLote(
  tx: Tx,
  e: {
    codigoItem: string;
    idSucursal: string;
    numeroLote: string;
    caducidad: Date | null;
    cantidad: number;
    idUsuario: string;
  }
) {
  const numeroLote = e.numeroLote.trim().slice(0, 40);
  const cantidad = r3(Number(e.cantidad));
  if (!numeroLote) throw new LoteError("Indica el número de lote");
  if (!Number.isFinite(cantidad) || cantidad <= 0) throw new LoteError("Cantidad inválida");

  const producto = await tx.producto.findUnique({ where: claveProducto(e.codigoItem) });
  if (!producto || !producto.activo) throw new LoteError("Producto no encontrado", 404);
  if (!producto.usaLotes) {
    throw new LoteError(`"${producto.descripcion}" no controla lotes (actívalo en el producto)`);
  }
  if (!producto.permiteDecimales && !Number.isInteger(cantidad)) {
    throw new LoteError("La cantidad debe ser entera");
  }

  const lote = await tx.lote.upsert({
    where: {
      idSucursal_codigoItem_numeroLote: {
        idSucursal: e.idSucursal,
        codigoItem: e.codigoItem,
        numeroLote,
      },
    },
    create: {
      idSucursal: e.idSucursal,
      codigoItem: e.codigoItem,
      numeroLote,
      caducidad: e.caducidad,
      cantidad,
    },
    update: {
      cantidad: { increment: cantidad },
      ...(e.caducidad ? { caducidad: e.caducidad } : {}),
    },
  });
  await moverStock(tx, { codigoItem: e.codigoItem, delta: cantidad, idSucursal: e.idSucursal });
  await registrarMovimientosKardex(tx, [
    {
      codigoItem: e.codigoItem,
      tipo: "ENTRADA",
      cantidad,
      motivo: `Entrada lote ${numeroLote}`,
      idUsuario: e.idUsuario,
      idSucursal: e.idSucursal,
    },
  ]);
  return lote;
}

/**
 * Consume `cantidad` de los lotes vigentes de la sucursal, primero los que
 * caducan antes (FEFO). Si los lotes no alcanzan, el resto sale de
 * existencia sin lote (stock anterior a usar lotes). Devuelve el detalle
 * para la trazabilidad de la venta.
 */
export async function consumirLotesFEFO(
  tx: Tx,
  c: { codigoItem: string; idSucursal: string; cantidad: number },
  ahora = new Date()
): Promise<ConsumoLote[]> {
  const lotes = await tx.lote.findMany({
    where: {
      idSucursal: c.idSucursal,
      codigoItem: c.codigoItem,
      cantidad: { gt: 0 },
      OR: [{ caducidad: null }, { caducidad: { gte: hoy(ahora) } }],
    },
    orderBy: [{ caducidad: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });

  let pendiente = r3(c.cantidad);
  const consumo: ConsumoLote[] = [];
  for (const lote of lotes) {
    if (pendiente <= 0) break;
    const toma = Math.min(pendiente, Number(lote.cantidad));
    // UPDATE condicionado: dos ventas simultáneas no sobregiran el lote.
    const r = await tx.lote.updateMany({
      where: { idLote: lote.idLote, cantidad: { gte: toma } },
      data: { cantidad: { decrement: toma } },
    });
    if (r.count === 0) continue;
    consumo.push({
      numeroLote: lote.numeroLote,
      cantidad: toma,
      caducidad: lote.caducidad ? lote.caducidad.toISOString().slice(0, 10) : null,
    });
    pendiente = r3(pendiente - toma);
  }
  return consumo;
}

/** Lotes que caducan dentro de `dias` (o ya caducaron) y siguen en existencia. */
export async function lotesPorCaducar(
  db: Pick<Tx, "lote">,
  dias: number,
  idSucursal?: string | null,
  ahora = new Date()
) {
  const limite = new Date(hoy(ahora).getTime() + dias * 86_400_000);
  return db.lote.findMany({
    where: {
      cantidad: { gt: 0 },
      caducidad: { not: null, lte: limite },
      ...(idSucursal ? { idSucursal } : {}),
    },
    orderBy: { caducidad: "asc" },
    include: { producto: { select: { descripcion: true } } },
    take: 300,
  });
}
