import type { Prisma } from "@papeleria/database";
import { registrarMovimientosKardex } from "./kardex";
import { round2, sufijoFolio, fechaFolio } from "./sales";
import { puntosGanadosPorCompra } from "./fidelidad";
import { ApartadoError, type ApartadoContext } from "./apartados";

// ============================================================
// Cierre del ciclo del apartado: LIQUIDAR (materializa la venta) o
// CANCELAR (libera el stock reservado). Sin esto la mercancía apartada
// quedaba reservada para siempre.
// ============================================================

type Tx = Prisma.TransactionClient;

export interface CierreApartadoContext extends ApartadoContext {
  /** Tasa del programa de fidelización (pesos de compra por punto). */
  pesosCompraPorPunto?: number;
}

export interface LiquidacionResult {
  folio: string;
  folioVenta: string;
  total: number;
  anticipo: number;
  saldoCobrado: number;
  metodoPago: string;
}

const METODOS_LIQUIDACION = ["EFECTIVO", "TARJETA", "TARJETA_TERMINAL", "DIGITAL", "TRANSFERENCIA"];

async function tomarApartadoPendiente(
  tx: Tx,
  idApartado: string,
  nuevoEstado: "LIQUIDADO" | "CANCELADO"
) {
  const apartado = await tx.apartado.findUnique({
    where: { idApartado },
    include: { lineas: { include: { producto: { select: { esServicio: true } } } } },
  });
  if (!apartado) {
    throw new ApartadoError("Apartado no encontrado", 404);
  }
  // Transición condicionada: dos cajas no liquidan/cancelan el mismo apartado.
  const r = await tx.apartado.updateMany({
    where: { idApartado, estado: "PENDIENTE" },
    data: {
      estado: nuevoEstado,
      ...(nuevoEstado === "LIQUIDADO" ? { fechaLiquidacion: new Date() } : {}),
    },
  });
  if (r.count === 0) {
    throw new ApartadoError(`El apartado ${apartado.folio} ya está ${apartado.estado}`, 409);
  }
  return apartado;
}

async function exigirCajaAbierta(tx: Tx, idCaja: string | null): Promise<string> {
  if (!idCaja) {
    throw new ApartadoError("No hay una caja abierta para registrar el movimiento", 409);
  }
  const sesion = await tx.sesionCaja.findUnique({
    where: { idCaja },
    select: { estado: true },
  });
  if (!sesion || sesion.estado !== "ABIERTA") {
    throw new ApartadoError("La caja está en proceso de cierre", 409);
  }
  return idCaja;
}

/**
 * Liquida el apartado: cobra el saldo pendiente en la caja abierta y
 * registra la Venta. El stock NO se vuelve a descontar (se reservó al crear).
 */
export async function liquidarApartado(
  tx: Tx,
  idApartado: string,
  input: { metodoPago: string; referenciaTransferencia?: string | null },
  ctx: CierreApartadoContext
): Promise<LiquidacionResult> {
  if (!METODOS_LIQUIDACION.includes(input.metodoPago)) {
    throw new ApartadoError("Método de pago inválido");
  }
  const esTransferencia = input.metodoPago === "DIGITAL" || input.metodoPago === "TRANSFERENCIA";
  const referencia = esTransferencia ? String(input.referenciaTransferencia ?? "").trim() : null;
  if (esTransferencia && !/^\d{4}$/.test(referencia ?? "")) {
    throw new ApartadoError(
      "Pago por transferencia: se requieren los últimos 4 dígitos de la referencia/rastreo"
    );
  }

  const idCaja = await exigirCajaAbierta(tx, ctx.idCaja);
  const apartado = await tomarApartadoPendiente(tx, idApartado, "LIQUIDADO");

  const total = round2(Number(apartado.total));
  const anticipo = round2(Number(apartado.anticipo));
  const saldo = round2(total - anticipo);
  const subtotal = round2(apartado.lineas.reduce((s, l) => s + Number(l.subtotalLinea), 0));
  const iva = round2(total - subtotal);
  const folioVenta = `F-${fechaFolio()}-${sufijoFolio()}`;

  await tx.venta.create({
    data: {
      folioVenta,
      subtotal,
      iva,
      totalNeto: total,
      idUsuario: ctx.idUsuario,
      idCaja,
      idCliente: apartado.idCliente,
      estado: "COMPLETADA",
      metodoPago: input.metodoPago,
      referenciaTransferencia: referencia,
      origen: "APARTADO",
    },
  });
  for (const l of apartado.lineas) {
    await tx.lineaDetalleVenta.create({
      data: {
        folioVenta,
        codigoItem: l.codigoItem,
        cantidad: l.cantidad,
        precioMomento: l.precioMomento,
        descuentoLinea: l.descuentoLinea,
        subtotalLinea: l.subtotalLinea,
      },
    });
  }

  // Solo el saldo entra hoy a la caja: el anticipo ya ingresó al apartar.
  if (saldo > 0) {
    const campo = input.metodoPago === "EFECTIVO" ? "totalVentasEfectivo" : "totalVentasDigital";
    await tx.sesionCaja.update({
      where: { idCaja },
      data: { [campo]: { increment: saldo } },
    });
  }

  const puntos = puntosGanadosPorCompra(total, ctx.pesosCompraPorPunto ?? 100);
  if (puntos > 0) {
    await tx.cliente.update({
      where: { idCliente: apartado.idCliente },
      data: { puntosFidelidad: { increment: puntos } },
    });
  }

  await tx.bitacoraLog.create({
    data: {
      idUsuario: ctx.idUsuario,
      accion: `Apartado ${apartado.folio} liquidado → venta ${folioVenta} (saldo cobrado $${saldo})`,
      moduloSistema: "PUNTO_VENTA",
      jsonPayload: {
        folio: apartado.folio,
        folioVenta,
        total,
        anticipo,
        saldo,
        metodoPago: input.metodoPago,
      },
    },
  });

  return {
    folio: apartado.folio,
    folioVenta,
    total,
    anticipo,
    saldoCobrado: saldo,
    metodoPago: input.metodoPago,
  };
}

/**
 * Cancela el apartado: reingresa el stock reservado (kardex ENTRADA) y, si
 * se indica, devuelve el anticipo en efectivo desde la caja abierta.
 */
export async function cancelarApartado(
  tx: Tx,
  idApartado: string,
  input: { reembolsarAnticipo: boolean; motivo?: string | null },
  ctx: ApartadoContext
): Promise<{ folio: string; anticipoReembolsado: number }> {
  const previo = await tx.apartado.findUnique({
    where: { idApartado },
    select: { anticipo: true },
  });
  const reembolsa = input.reembolsarAnticipo && Number(previo?.anticipo ?? 0) > 0;
  const idCaja = reembolsa ? await exigirCajaAbierta(tx, ctx.idCaja) : null;

  const apartado = await tomarApartadoPendiente(tx, idApartado, "CANCELADO");
  const fisicas = apartado.lineas.filter((l) => !l.producto.esServicio);

  for (const l of fisicas) {
    await tx.producto.update({
      where: { codigoItem: l.codigoItem },
      data: { stockActual: { increment: l.cantidad } },
    });
  }
  await registrarMovimientosKardex(
    tx,
    fisicas.map((l) => ({
      codigoItem: l.codigoItem,
      tipo: "ENTRADA" as const,
      cantidad: Number(l.cantidad),
      motivo: `Cancelación de apartado ${apartado.folio}`,
      idUsuario: ctx.idUsuario,
    }))
  );

  const anticipo = round2(Number(apartado.anticipo));
  if (reembolsa && idCaja) {
    await tx.sesionCaja.update({
      where: { idCaja },
      data: { totalEgresos: { increment: anticipo } },
    });
  }

  await tx.bitacoraLog.create({
    data: {
      idUsuario: ctx.idUsuario,
      accion: `Apartado ${apartado.folio} cancelado${
        reembolsa ? ` (anticipo $${anticipo} reembolsado en efectivo)` : " (anticipo retenido)"
      }`,
      moduloSistema: "PUNTO_VENTA",
      jsonPayload: {
        folio: apartado.folio,
        anticipo,
        reembolsado: reembolsa,
        motivo: input.motivo ? String(input.motivo).slice(0, 300) : null,
      },
    },
  });

  return { folio: apartado.folio, anticipoReembolsado: reembolsa ? anticipo : 0 };
}
