import type { Prisma } from "@papeleria/database";
import { registrarMovimientosKardex } from "./kardex";

export const METODOS_PAGO = [
  "EFECTIVO",
  "TARJETA",
  "DIGITAL",
  "TRANSFERENCIA",
  "CREDITO_TIENDA",
] as const;
export const TIPOS_VENTA = ["PAPELERIA", "RECARGA"] as const;
export const IVA_RATE = 0.16;
/** Programa de fidelización: 1 punto por cada $100 de compra. */
export const PESOS_POR_PUNTO = 100;

export type MetodoPago = (typeof METODOS_PAGO)[number];
export type TipoVenta = (typeof TIPOS_VENTA)[number];

export class SaleError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "SaleError";
    this.status = status;
  }
}

export const round2 = (n: number): number => Math.round(n * 100) / 100;

function generarFolio(): string {
  const d = new Date();
  const fecha = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate()
  ).padStart(2, "0")}`;
  const aleatorio = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `F-${fecha}-${aleatorio}`;
}

export interface SaleLineInput {
  codigoItem: string;
  cantidad: number;
}

export interface SaleInput {
  items: SaleLineInput[];
  metodoPago: string;
  tipoVenta?: string;
  montoRecibido?: number | null;
  /**
   * CRM (Fase 3): obligatorio cuando `metodoPago === "CREDITO_TIENDA"`.
   * El total se suma al `saldoDeudor` del cliente y acumula puntos de
   * fidelidad (1 por cada $100) en lugar de ingresar a la caja.
   */
  idCliente?: string | null;
  /**
   * Blindaje Financiero: últimos 4 dígitos de la referencia/rastreo,
   * obligatorio cuando el método de pago es transferencia (DIGITAL/TRANSFERENCIA).
   */
  referenciaTransferencia?: string | null;
}

export interface SaleContext {
  idUsuario: string;
  idCaja: string | null;
}

export interface SaleResult {
  folioVenta: string;
  subtotal: number;
  iva: number;
  totalNeto: number;
  metodoPago: MetodoPago;
  tipoVenta: TipoVenta;
  cambio: number | null;
  items: Array<{
    codigoItem: string;
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    subtotalLinea: number;
  }>;
}

type Tx = Prisma.TransactionClient;

/**
 * Núcleo transaccional de la venta. Ejecuta dentro de prisma.$transaction:
 * 1. Valida stock exacto (revierte con SaleError si no alcanza).
 * 2. Registra Venta + LineaDetalleVenta.
 * 3. Descuenta stock.
 * 4. Asigna el ingreso a la caja abierta (efectivo / digital / recargas).
 * 5. Deja log en bitácora.
 */
export async function executeSale(
  tx: Tx,
  input: SaleInput,
  ctx: SaleContext
): Promise<SaleResult> {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new SaleError("El carrito está vacío");
  }
  if (!METODOS_PAGO.includes(input.metodoPago as MetodoPago)) {
    throw new SaleError("Método de pago inválido");
  }

  // CRM: la venta a crédito exige cliente registrado y NO ingresa a caja.
  const esCredito = input.metodoPago === "CREDITO_TIENDA";
  let idCliente: string | null = null;
  if (esCredito) {
    idCliente = String(input.idCliente ?? "").trim() || null;
    if (!idCliente) {
      throw new SaleError(
        "Venta a crédito: selecciona el cliente al que se le cargará el saldo"
      );
    }
    const cliente = await tx.cliente.findUnique({
      where: { idCliente },
      select: { idCliente: true },
    });
    if (!cliente) {
      throw new SaleError("Cliente no encontrado", 404);
    }
  }

  // Blindaje Financiero: la transferencia exige la referencia de pago.
  const esTransferencia =
    input.metodoPago === "DIGITAL" || input.metodoPago === "TRANSFERENCIA";
  let referenciaTransferencia: string | null = null;
  if (esTransferencia) {
    referenciaTransferencia = String(input.referenciaTransferencia ?? "").trim();
    if (!/^\d{4}$/.test(referenciaTransferencia)) {
      throw new SaleError(
        "Pago por transferencia: se requieren los últimos 4 dígitos de la referencia/rastreo"
      );
    }
  }

  const tipoVenta: TipoVenta = input.tipoVenta === "RECARGA" ? "RECARGA" : "PAPELERIA";

  // Validación de stock y cálculo de totales
  let subtotal = 0;
  const lineas: Array<{
    codigoItem: string;
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    subtotalLinea: number;
  }> = [];

  for (const item of input.items) {
    const cantidad = Math.round(Number(item.cantidad));
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      throw new SaleError(`Cantidad inválida para el producto ${item.codigoItem}`);
    }

    const producto = await tx.producto.findUnique({
      where: { codigoItem: item.codigoItem },
    });

    if (!producto || !producto.activo) {
      throw new SaleError(`Producto no encontrado: ${item.codigoItem}`, 404);
    }
    if (producto.stockActual < cantidad) {
      throw new SaleError(
        `Stock insuficiente para "${producto.descripcion}": disponible ${producto.stockActual}, solicitado ${cantidad}`
      );
    }

    const precio = Number(producto.precioUnitario);
    const subtotalLinea = round2(precio * cantidad);
    subtotal = round2(subtotal + subtotalLinea);

    lineas.push({
      codigoItem: item.codigoItem,
      descripcion: producto.descripcion,
      cantidad,
      precioUnitario: precio,
      subtotalLinea,
    });
  }

  const iva = round2(subtotal * IVA_RATE);
  const totalNeto = round2(subtotal + iva);
  const folioVenta = generarFolio();

  // Bloqueo de ventas si la caja indicada no está ABIERTA (defensa en profundidad).
  if (ctx.idCaja) {
    const sesion = await tx.sesionCaja.findUnique({
      where: { idCaja: ctx.idCaja },
      select: { estado: true },
    });
    if (!sesion || sesion.estado !== "ABIERTA") {
      throw new SaleError("La caja está en proceso de cierre; no se pueden registrar ventas", 409);
    }
  }

  // 1. Cabecera de venta
  await tx.venta.create({
    data: {
      folioVenta,
      subtotal: round2(subtotal),
      iva,
      totalNeto,
      idUsuario: ctx.idUsuario,
      idCaja: ctx.idCaja ?? undefined,
      idCliente: esCredito ? idCliente : undefined,
      estado: "COMPLETADA",
      metodoPago: input.metodoPago as MetodoPago,
      referenciaTransferencia,
    },
  });

  // 2. Líneas de detalle
  for (const l of lineas) {
    await tx.lineaDetalleVenta.create({
      data: {
        folioVenta,
        codigoItem: l.codigoItem,
        cantidad: l.cantidad,
        precioMomento: l.precioUnitario,
        descuentoLinea: 0,
        subtotalLinea: l.subtotalLinea,
      },
    });
  }

  // 3. Descuento de stock + Kardex inmutable (SALIDA por línea)
  for (const l of lineas) {
    await tx.producto.update({
      where: { codigoItem: l.codigoItem },
      data: { stockActual: { decrement: l.cantidad } },
    });
  }
  await registrarMovimientosKardex(
    tx,
    lineas.map((l) => ({
      codigoItem: l.codigoItem,
      tipo: "SALIDA",
      cantidad: l.cantidad,
      motivo: `Venta ${folioVenta}`,
      idUsuario: ctx.idUsuario,
    }))
  );

  // 4. Asignación financiera
  if (esCredito && idCliente) {
    // CRM: el importe NO toca la caja; va al saldo del cliente + puntos.
    const puntos = Math.floor(totalNeto / PESOS_POR_PUNTO);
    await tx.cliente.update({
      where: { idCliente },
      data: {
        saldoDeudor: { increment: totalNeto },
        puntosFidelidad: { increment: puntos },
      },
    });
  } else if (ctx.idCaja) {
    const campo =
      tipoVenta === "RECARGA"
        ? "totalRecargas"
        : input.metodoPago === "EFECTIVO"
          ? "totalVentasEfectivo"
          : "totalVentasDigital";

    await tx.sesionCaja.update({
      where: { idCaja: ctx.idCaja },
      data: { [campo]: { increment: totalNeto } },
    });
  }

  // 5. Bitácora
  await tx.bitacoraLog.create({
    data: {
      idUsuario: ctx.idUsuario,
      accion: `Venta ${folioVenta} registrada: $${totalNeto}`,
      moduloSistema: "PUNTO_VENTA",
      jsonPayload: {
        folioVenta,
        subtotal,
        iva,
        totalNeto,
        metodoPago: input.metodoPago,
        tipoVenta,
        referenciaTransferencia,
        numItems: lineas.length,
      },
    },
  });

  const cambio =
    input.montoRecibido != null && !isNaN(Number(input.montoRecibido))
      ? round2(Number(input.montoRecibido) - totalNeto)
      : null;

  return {
    folioVenta,
    subtotal,
    iva,
    totalNeto,
    metodoPago: input.metodoPago as MetodoPago,
    tipoVenta,
    cambio,
    items: lineas,
  };
}