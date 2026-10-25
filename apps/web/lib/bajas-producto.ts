import type { Prisma } from "@papeleria/database";
import { claveProducto } from "./tenant-keys";

// ============================================================
// Quitar un producto del catálogo (Fase D).
//
// Un producto que nunca se movió (sin ventas, pedidos, devoluciones,
// apartados, lotes ni series) se ELIMINA de verdad. Si ya tiene historia,
// se DA DE BAJA: queda inactivo y oculto, pero los tickets, el kardex y los
// reportes viejos siguen mostrándolo. Nunca se rompe el historial.
// ============================================================

type Tx = Prisma.TransactionClient;

export class BajaProductoError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type ResultadoBaja = { modo: "ELIMINADO" | "DESACTIVADO"; descripcion: string; motivo?: string };

/** ¿Qué historia tiene el producto? (lo que impide borrarlo de verdad). */
export async function historiaDeProducto(tx: Tx, codigoItem: string) {
  const [ventas, pedidos, devoluciones, apartados, lotes, series, promociones] = await Promise.all([
    tx.lineaDetalleVenta.count({ where: { codigoItem } }),
    tx.itemPedidoProveedor.count({ where: { codigoItem } }),
    tx.devolucionLinea.count({ where: { codigoItem } }),
    tx.apartadoLinea.count({ where: { codigoItem } }),
    tx.lote.count({ where: { codigoItem } }),
    tx.numeroSerie.count({ where: { codigoItem } }),
    tx.promocion.count({ where: { codigoItem } }),
  ]);
  return { ventas, pedidos, devoluciones, apartados, lotes, series, promociones };
}

export async function quitarProducto(tx: Tx, codigoItem: string): Promise<ResultadoBaja> {
  const producto = await tx.producto.findUnique({ where: claveProducto(codigoItem) });
  if (!producto) throw new BajaProductoError("Producto no encontrado", 404);

  // Un modelo con variantes activas no se quita: primero sus variantes.
  if (producto.grupoVariante === producto.codigoItem) {
    const variantes = await tx.producto.count({
      where: { grupoVariante: producto.codigoItem, activo: true, NOT: { codigoItem: producto.codigoItem } },
    });
    if (variantes > 0) {
      throw new BajaProductoError(
        `"${producto.descripcion}" es el modelo de ${variantes} variante(s) activas: quítalas primero`,
        409
      );
    }
  }

  const h = await historiaDeProducto(tx, codigoItem);
  const conHistoria = Object.entries(h).filter(([, n]) => n > 0);
  if (conHistoria.length > 0) {
    await tx.producto.update({ where: claveProducto(codigoItem), data: { activo: false, favorito: false } });
    const partes = conHistoria.map(([k, n]) => `${n} ${k}`).join(", ");
    return { modo: "DESACTIVADO", descripcion: producto.descripcion, motivo: `tiene historial (${partes})` };
  }

  await tx.movimientoKardex.deleteMany({ where: { codigoItem } });
  await tx.existencia.deleteMany({ where: { codigoItem } });
  await tx.producto.delete({ where: claveProducto(codigoItem) });
  return { modo: "ELIMINADO", descripcion: producto.descripcion };
}
