// ============================================================
// Pagos de una venta (puro): uno o varios métodos (pago mixto).
//
// Reglas:
//   - La suma de los pagos debe ser exactamente el total.
//   - Un método aparece una sola vez por venta.
//   - Transferencia exige los últimos 4 dígitos de la referencia.
//   - El cambio solo sale del efectivo: montoRecibido ≥ parte en efectivo.
//   - Con un solo pago, la venta conserva ese método; con varios, "MIXTO".
// ============================================================

export const METODOS_PAGO_VENTA = [
  "EFECTIVO",
  "TARJETA",
  "DIGITAL",
  "TRANSFERENCIA",
  "PUNTOS_MONEDERO",
] as const;

export type MetodoPagoVenta = (typeof METODOS_PAGO_VENTA)[number];

export interface PagoVenta {
  metodo: MetodoPagoVenta;
  monto: number;
  referencia: string | null;
}

export interface PagosNormalizados {
  pagos: PagoVenta[];
  /** Método que se guarda en la venta (el único, o "MIXTO"). */
  metodoVenta: MetodoPagoVenta | "MIXTO";
  efectivo: number;
  cambio: number | null;
}

export class PagoError extends Error {}

const c = (n: number) => Math.round(n * 100);

export const esTransferencia = (m: string) => m === "DIGITAL" || m === "TRANSFERENCIA";

/** Rubro de la caja al que entra cada método. */
export function rubroCaja(metodo: string): "EFECTIVO" | "DIGITAL" | null {
  if (metodo === "EFECTIVO") return "EFECTIVO";
  if (metodo === "PUNTOS_MONEDERO") return null;
  return "DIGITAL";
}

export function normalizarPagos(
  input: {
    metodoPago?: string;
    pagos?: Array<{ metodo?: unknown; monto?: unknown; referencia?: unknown }> | null;
    montoRecibido?: number | null;
    referenciaTransferencia?: string | null;
  },
  total: number
): PagosNormalizados {
  const crudos =
    Array.isArray(input.pagos) && input.pagos.length > 0
      ? input.pagos
      : [{ metodo: input.metodoPago, monto: total, referencia: input.referenciaTransferencia }];

  const vistos = new Set<string>();
  const pagos: PagoVenta[] = crudos.map((raw) => {
    const metodo = String(raw.metodo ?? "");
    if (!METODOS_PAGO_VENTA.includes(metodo as MetodoPagoVenta)) {
      throw new PagoError("Método de pago inválido");
    }
    if (vistos.has(metodo)) {
      throw new PagoError("Cada método de pago puede usarse una sola vez por venta");
    }
    vistos.add(metodo);
    const monto = Math.round(Number(raw.monto) * 100) / 100;
    if (!Number.isFinite(monto) || monto <= 0) {
      throw new PagoError("Cada pago debe ser un monto mayor a 0");
    }
    let referencia: string | null = null;
    if (esTransferencia(metodo)) {
      referencia = String(raw.referencia ?? input.referenciaTransferencia ?? "").trim();
      if (!/^\d{4}$/.test(referencia)) {
        throw new PagoError(
          "Pago por transferencia: se requieren los últimos 4 dígitos de la referencia/rastreo"
        );
      }
    }
    return { metodo: metodo as MetodoPagoVenta, monto, referencia };
  });

  const suma = pagos.reduce((a, x) => a + c(x.monto), 0);
  if (suma !== c(total)) {
    throw new PagoError(
      `Los pagos suman $${(suma / 100).toFixed(2)} y el total es $${total.toFixed(2)}`
    );
  }

  const efectivo = pagos.find((x) => x.metodo === "EFECTIVO")?.monto ?? 0;
  let cambio: number | null = null;
  if (input.montoRecibido != null && Number.isFinite(Number(input.montoRecibido)) && efectivo > 0) {
    const recibido = c(Number(input.montoRecibido));
    if (recibido < c(efectivo)) {
      throw new PagoError(
        `El monto recibido ($${(recibido / 100).toFixed(2)}) no cubre el total ($${efectivo.toFixed(2)})`
      );
    }
    cambio = (recibido - c(efectivo)) / 100;
  }

  return {
    pagos,
    metodoVenta: pagos.length === 1 ? pagos[0].metodo : "MIXTO",
    efectivo,
    cambio,
  };
}
