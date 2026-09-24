import type { Prisma } from "@papeleria/database";

// ============================================================
// Kardex de inventario INMUTABLE (Fase 3).
//
// Toda variación de stock debe pasar por `registrarMovimientosKardex`
// dentro de la MISMA transacción que actualiza `stockActual`.
// `cantidadCambio` se persiste CON SIGNO:
//   ENTRADA → +cantidad   |  SALIDA → −cantidad   |  AJUSTE → signo del delta real
// Gracias a ello, `stockActual = stockInicial + Σ cantidadesCambio`
// y el historial es auditable e irreproducible en historia.
// ============================================================

type Tx = Prisma.TransactionClient;

export type TipoMovimientoKardex = "ENTRADA" | "SALIDA" | "AJUSTE";

export interface MovimientoKardexEntrada {
  codigoItem: string;
  tipo: TipoMovimientoKardex;
  /** Siempre positiva; el signo se deriva del tipo (AJUSTE requiere signo del delta). */
  cantidad: number;
  /** Se pueden pedir la razón legible, p.ej. `Venta F-20260924-ABCD` o `Recuento físico`. */
  motivo: string;
  idUsuario: string;
}

/**
 * Inserta uno o más movimientos de kardex. Para AJUSTE el caller debe
 * pasar `cantidad` ya con signo (±) y el signo se conserva tal cual.
 * Lanza si algún código de producto no existe.
 */
export async function registrarMovimientosKardex(
  tx: Tx,
  movimientos: MovimientoKardexEntrada[]
): Promise<void> {
  if (movimientos.length === 0) return;

  const registros = movimientos.map((m) => {
    const abs = Math.abs(m.cantidad);
    const signo =
      m.tipo === "AJUSTE"
        ? Math.sign(m.cantidad) || 0
        : m.tipo === "ENTRADA"
          ? 1
          : -1;
    return {
      codigoItem: m.codigoItem,
      cantidadCambio: signo * abs,
      tipo: m.tipo,
      motivo: m.motivo,
      idUsuario: m.idUsuario,
      fecha: new Date(),
    };
  });

  await tx.movimientoKardex.createMany({ data: registros });
}

/** Resumen del stock derivado SOLO con base en el kardex (idempotente). */
export function stockDerivadoDelKardex(
  movimientos: Array<{ cantidadCambio: number }>,
  stockInicial = 0
): number {
  return movimientos.reduce((acc, m) => acc + m.cantidadCambio, stockInicial);
}