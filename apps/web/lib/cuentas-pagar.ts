import type { Prisma } from "@papeleria/database";

// ============================================================
// Cuentas por pagar a proveedores (Fase A).
//
//   - Recibir mercancía de un pedido A CRÉDITO crea una cuenta por el
//     importe recibido, que vence en "hoy + días de crédito" del proveedor,
//     y sube el saldo del proveedor.
//   - Un abono se aplica a las cuentas más antiguas primero (por
//     vencimiento) y baja el saldo del proveedor.
//
// Antes el saldo solo bajaba (con abonos) y nunca subía: el crédito con
// proveedores no funcionaba.
// ============================================================

type Tx = Prisma.TransactionClient;

const r2 = (n: number) => Math.round(n * 100) / 100;
const DIA_MS = 86_400_000;

/** Inicio del día local. */
export function inicioDelDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Vencimiento de una compra a crédito: fin del día `hoy + días`. */
export function calcularVencimiento(desde: Date, diasCredito: number): Date {
  const dias = Math.max(0, Math.floor(diasCredito));
  const d = inicioDelDia(desde);
  d.setDate(d.getDate() + dias);
  d.setHours(23, 59, 59, 999);
  return d;
}

export type EstadoVencimiento = "VENCIDA" | "VENCE_PRONTO" | "AL_CORRIENTE";

/** Días que faltan (negativo = días de atraso). */
export function diasParaVencer(vencimiento: Date, hoy: Date): number {
  return Math.round((inicioDelDia(vencimiento).getTime() - inicioDelDia(hoy).getTime()) / DIA_MS);
}

export function estadoVencimiento(vencimiento: Date, hoy: Date, avisoDias = 3): EstadoVencimiento {
  const dias = diasParaVencer(vencimiento, hoy);
  if (dias < 0) return "VENCIDA";
  if (dias <= avisoDias) return "VENCE_PRONTO";
  return "AL_CORRIENTE";
}

/**
 * Reparte un abono entre cuentas pendientes, de la que vence primero a la
 * última. Devuelve cuánto se aplica a cada una (puro, para pruebas).
 */
export function repartirAbono(
  cuentas: Array<{ idCuenta: string; saldo: number; fechaVencimiento: Date }>,
  monto: number
): Array<{ idCuenta: string; aplicado: number; saldoNuevo: number }> {
  let resto = r2(monto);
  const ordenadas = [...cuentas].sort(
    (a, b) => a.fechaVencimiento.getTime() - b.fechaVencimiento.getTime()
  );
  const out: Array<{ idCuenta: string; aplicado: number; saldoNuevo: number }> = [];
  for (const c of ordenadas) {
    if (resto <= 0) break;
    const aplicado = r2(Math.min(resto, c.saldo));
    if (aplicado <= 0) continue;
    resto = r2(resto - aplicado);
    out.push({ idCuenta: c.idCuenta, aplicado, saldoNuevo: r2(c.saldo - aplicado) });
  }
  return out;
}

/** Registra la deuda por lo recibido de un pedido a crédito. */
export async function registrarCuentaPorPagar(
  tx: Tx,
  c: { idProveedor: string; idPedido: string; monto: number; concepto: string; hoy?: Date }
) {
  const monto = r2(c.monto);
  if (monto <= 0) return null;
  const proveedor = await tx.proveedor.findUnique({
    where: { idProveedor: c.idProveedor },
    select: { diasCredito: true, limiteCredito: true, saldoCredito: true },
  });
  if (!proveedor) return null;
  const cuenta = await tx.cuentaPorPagar.create({
    data: {
      idProveedor: c.idProveedor,
      idPedido: c.idPedido,
      concepto: c.concepto.slice(0, 190),
      monto,
      saldo: monto,
      fechaVencimiento: calcularVencimiento(c.hoy ?? new Date(), proveedor.diasCredito),
    },
  });
  const actualizado = await tx.proveedor.update({
    where: { idProveedor: c.idProveedor },
    data: { saldoCredito: { increment: monto } },
    select: { saldoCredito: true },
  });
  const saldo = Number(actualizado.saldoCredito ?? 0);
  const limite = proveedor.limiteCredito != null ? Number(proveedor.limiteCredito) : null;
  return {
    cuenta,
    saldo,
    // El proveedor es quien decide si surte arriba del límite: aquí solo se avisa.
    excedeLimite: limite != null && saldo > limite + 0.005,
  };
}

/** Aplica un abono a las cuentas pendientes del proveedor (más antigua primero). */
export async function aplicarAbono(tx: Tx, idProveedor: string, monto: number) {
  const pendientes = await tx.cuentaPorPagar.findMany({
    where: { idProveedor, estado: "PENDIENTE" },
    select: { idCuenta: true, saldo: true, fechaVencimiento: true },
  });
  const reparto = repartirAbono(
    pendientes.map((p) => ({ ...p, saldo: Number(p.saldo) })),
    monto
  );
  for (const r of reparto) {
    await tx.cuentaPorPagar.update({
      where: { idCuenta: r.idCuenta },
      data: { saldo: r.saldoNuevo, estado: r.saldoNuevo <= 0 ? "PAGADA" : "PENDIENTE" },
    });
  }
  return reparto;
}
