import type { Prisma } from "@papeleria/database";
import { moverStock } from "./existencias";
import { registrarMovimientosKardex } from "./kardex";
import { claveProducto } from "./tenant-keys";

// ============================================================
// Números de serie (Paso 6): cada unidad de un producto con `usaSeries`
// tiene su serie. Registrarlas da entrada a la existencia; venderlas exige
// indicar cuáles (deben estar DISPONIBLES en la sucursal); una devolución
// las vuelve a poner disponibles.
// ============================================================

type Tx = Prisma.TransactionClient;

export class SerieError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Limpia y valida una lista de series (sin vacíos ni repetidas). */
export function normalizarSeries(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const series = raw.map((s) => String(s ?? "").trim().toUpperCase().slice(0, 60)).filter(Boolean);
  const repetidas = series.filter((s, i) => series.indexOf(s) !== i);
  if (repetidas.length) throw new SerieError(`Serie repetida: ${repetidas[0]}`);
  return series;
}

export async function registrarSeries(
  tx: Tx,
  e: { codigoItem: string; idSucursal: string; series: string[]; idUsuario: string }
) {
  const series = normalizarSeries(e.series);
  if (series.length === 0) throw new SerieError("Captura al menos un número de serie");
  if (series.length > 500) throw new SerieError("Máximo 500 series por registro");

  const producto = await tx.producto.findUnique({ where: claveProducto(e.codigoItem) });
  if (!producto || !producto.activo) throw new SerieError("Producto no encontrado", 404);
  if (!producto.usaSeries) {
    throw new SerieError(`"${producto.descripcion}" no controla números de serie (actívalo en el producto)`);
  }
  const existentes = await tx.numeroSerie.findMany({
    where: { codigoItem: e.codigoItem, serie: { in: series } },
    select: { serie: true },
  });
  if (existentes.length) {
    throw new SerieError(`La serie ${existentes[0].serie} ya está registrada`, 409);
  }

  await tx.numeroSerie.createMany({
    data: series.map((serie) => ({
      idSucursal: e.idSucursal,
      codigoItem: e.codigoItem,
      serie,
    })),
  });
  await moverStock(tx, { codigoItem: e.codigoItem, delta: series.length, idSucursal: e.idSucursal });
  await registrarMovimientosKardex(tx, [
    {
      codigoItem: e.codigoItem,
      tipo: "ENTRADA",
      cantidad: series.length,
      motivo: `Alta de ${series.length} serie(s)`,
      idUsuario: e.idUsuario,
      idSucursal: e.idSucursal,
    },
  ]);
  return series;
}

/** Marca como VENDIDAS las series (todas deben estar disponibles en la sucursal). */
export async function venderSeries(
  tx: Tx,
  v: { codigoItem: string; idSucursal: string | null; series: string[]; folioVenta: string }
) {
  const r = await tx.numeroSerie.updateMany({
    where: {
      codigoItem: v.codigoItem,
      serie: { in: v.series },
      estado: "DISPONIBLE",
      ...(v.idSucursal ? { idSucursal: v.idSucursal } : {}),
    },
    data: { estado: "VENDIDO", folioVenta: v.folioVenta },
  });
  if (r.count !== v.series.length) {
    throw new SerieError(
      "Alguna serie no está disponible en esta sucursal (ya vendida o no registrada)",
      409
    );
  }
}

/**
 * Devolución: vuelve a poner disponibles las series vendidas en ese ticket.
 * Si no se indican, se liberan las últimas `cantidad` vendidas del producto.
 */
export async function devolverSeries(
  tx: Tx,
  d: {
    codigoItem: string;
    folioVenta: string;
    cantidad: number;
    series?: string[];
    idSucursal: string | null;
  }
): Promise<string[]> {
  const vendidas = await tx.numeroSerie.findMany({
    where: { codigoItem: d.codigoItem, folioVenta: d.folioVenta, estado: "VENDIDO" },
    orderBy: { updatedAt: "desc" },
    select: { serie: true },
  });
  const elegidas = d.series?.length
    ? normalizarSeries(d.series)
    : vendidas.slice(0, d.cantidad).map((s) => s.serie);
  const validas = new Set(vendidas.map((s) => s.serie));
  if (elegidas.length !== d.cantidad || elegidas.some((s) => !validas.has(s))) {
    throw new SerieError("Las series a devolver no corresponden a este ticket");
  }
  await tx.numeroSerie.updateMany({
    where: { codigoItem: d.codigoItem, serie: { in: elegidas }, folioVenta: d.folioVenta },
    data: {
      estado: "DISPONIBLE",
      folioVenta: null,
      ...(d.idSucursal ? { idSucursal: d.idSucursal } : {}),
    },
  });
  return elegidas;
}
