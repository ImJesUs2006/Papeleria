import type { Prisma } from "@papeleria/database";
import { claveProducto } from "./tenant-keys";

// ============================================================
// Existencias por sucursal (Paso 5).
//
// Único punto que mueve stock: actualiza la existencia de la sucursal y
// el total del producto (`Producto.stockActual` = suma de existencias)
// en la misma transacción.
//
// Sin sucursal (operación anterior a las sucursales o sin sesión de
// sucursal) se mueve solo el total, como antes.
// ============================================================

type Tx = Prisma.TransactionClient;

export interface MovimientoStock {
  codigoItem: string;
  /** Con signo: negativo sale, positivo entra. */
  delta: number;
  idSucursal?: string | null;
  /**
   * true = solo descuenta si hay existencia suficiente (UPDATE condicionado:
   * dos ventas simultáneas de la última unidad no pasan ambas).
   */
  exigirDisponible?: boolean;
}

const redondear = (n: number) => Math.round(n * 1000) / 1000;

/** Devuelve false si `exigirDisponible` y no alcanzó la existencia. */
export async function moverStock(tx: Tx, m: MovimientoStock): Promise<boolean> {
  const delta = redondear(m.delta);
  if (delta === 0) return true;

  if (!m.idSucursal) {
    if (delta < 0 && m.exigirDisponible) {
      const r = await tx.producto.updateMany({
        where: { codigoItem: m.codigoItem, stockActual: { gte: -delta } },
        data: { stockActual: { decrement: -delta } },
      });
      return r.count > 0;
    }
    await actualizarTotal(tx, m.codigoItem, delta);
    return true;
  }

  if (delta < 0 && m.exigirDisponible) {
    const r = await tx.existencia.updateMany({
      where: { idSucursal: m.idSucursal, codigoItem: m.codigoItem, stock: { gte: -delta } },
      data: { stock: { decrement: -delta } },
    });
    if (r.count === 0) return false;
  } else {
    await tx.existencia.upsert({
      where: { idSucursal_codigoItem: { idSucursal: m.idSucursal, codigoItem: m.codigoItem } },
      create: { idSucursal: m.idSucursal, codigoItem: m.codigoItem, stock: delta },
      update: { stock: { increment: delta } },
    });
  }
  await actualizarTotal(tx, m.codigoItem, delta);
  return true;
}

/** Total del negocio (`Producto.stockActual`) = suma de existencias. */
async function actualizarTotal(tx: Tx, codigoItem: string, delta: number) {
  await tx.producto.update({
    where: claveProducto(codigoItem),
    data: { stockActual: delta > 0 ? { increment: delta } : { decrement: -delta } },
  });
}

/** Existencia de varios productos en una sucursal (0 si no hay registro). */
export async function stockEnSucursal(
  tx: Pick<Tx, "existencia">,
  idSucursal: string,
  codigos: string[]
): Promise<Map<string, number>> {
  const filas = await tx.existencia.findMany({
    where: { idSucursal, codigoItem: { in: codigos } },
    select: { codigoItem: true, stock: true },
  });
  const mapa = new Map(codigos.map((c) => [c, 0]));
  for (const f of filas) mapa.set(f.codigoItem, Number(f.stock));
  return mapa;
}

/**
 * Para respuestas de API: sustituye `stockActual` por la existencia de la
 * sucursal activa y conserva el total del negocio en `stockTotal`.
 */
export async function conStockDeSucursal<T extends { codigoItem: string; stockActual: unknown }>(
  tx: Pick<Tx, "existencia">,
  idSucursal: string | null | undefined,
  productos: T[]
): Promise<Array<T & { stockTotal: number }>> {
  if (!idSucursal || productos.length === 0) {
    return productos.map((p) => ({ ...p, stockTotal: Number(p.stockActual) }));
  }
  const mapa = await stockEnSucursal(tx, idSucursal, productos.map((p) => p.codigoItem));
  return productos.map((p) => ({
    ...p,
    stockTotal: Number(p.stockActual),
    stockActual: mapa.get(p.codigoItem) ?? 0,
  }));
}
