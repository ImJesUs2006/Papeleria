import type { Prisma } from "@papeleria/database";
import { registrarMovimientosKardex } from "./kardex";
import {
  puntosGanadosPorCompra,
  puntosRequeridos,
} from "./fidelidad";
import { claveProducto } from "./tenant-keys";

export const METODOS_PAGO = [
  "EFECTIVO",
  "TARJETA",
  "DIGITAL",
  "TRANSFERENCIA",
  "PUNTOS_MONEDERO",
] as const;
export const TIPOS_VENTA = ["PAPELERIA", "RECARGA"] as const;
/** Tasa por defecto (fracción). La vigente vive en `BusinessConfig.ivaRate`. */
export const IVA_RATE = 0.16;

/**
 * Convierte la tasa configurada del negocio (porcentaje, ej. 16) a fracción
 * (0.16). Si no llega o es inválida, rige la tasa por defecto.
 */
export function ivaFraccion(ivaRatePct?: number | null): number {
  const pct = Number(ivaRatePct);
  if (ivaRatePct == null || !Number.isFinite(pct) || pct < 0 || pct > 100) {
    return IVA_RATE;
  }
  return pct / 100;
}
/**
 * Tasa por defecto del programa de fidelización (1 punto por cada $100).
 * La tasa configurable vive en `BusinessConfig.puntosConfig` (Fase 12);
 * esta constante solo rige cuando el endpoint no inyecta configuración.
 */
export const PESOS_POR_PUNTO = 100;
/** Valor por defecto de 1 punto al pagar (cuando no llega configuración). */
export const PUNTOS_VALOR_DEFAULT = 1;

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

/**
 * Fase 12 · Precio de mayoreo.
 * El servidor es la autoridad del precio: si la venta va a mayoreo y el
 * producto tiene `precioMayoreo` válido, se cobra ese precio. Si no lo tiene,
 * se cobra el precio de menudeo (nunca 0 ni NaN).
 */
export function elegirPrecioUnitario(
  producto: { precioUnitario: unknown; precioMayoreo?: unknown },
  esMayoreo: boolean
): number {
  const menudeo = Number(producto.precioUnitario);
  const base = Number.isFinite(menudeo) && menudeo >= 0 ? menudeo : 0;
  if (!esMayoreo) return base;
  const mayoreo = Number(producto.precioMayoreo);
  return Number.isFinite(mayoreo) && mayoreo > 0 ? mayoreo : base;
}

const ALFABETO_FOLIO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Sufijo aleatorio criptográfico para folios (sin caracteres ambiguos).
 * 6 caracteres ⇒ ~1,000 millones de combinaciones por día y prefijo, lo que
 * vuelve despreciable la colisión de llave primaria.
 */
export function sufijoFolio(longitud = 6): string {
  const bytes = new Uint8Array(longitud);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALFABETO_FOLIO[b % ALFABETO_FOLIO.length];
  return out;
}

export function fechaFolio(d = new Date()): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function generarFolio(): string {
  return `F-${fechaFolio()}-${sufijoFolio()}`;
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
   * Cliente registrado associated a the ticket (Fase 12).
   * - `PUNTOS_MONEDERO`: obligatorio (dueño del monedero).
   * - Cualquier otro método: opcional; si viene, la venta acumula puntos
   *   de fidelidad con la tasa configurable del negocio.
   * El "Crédito de tienda" fue eliminado en la Fase 12.
   */
  idCliente?: string | null;
  /**
   * Fase 12: cuando es `true` el servidor cobra el `precioMayoreo` de cada
   * producto que lo tenga (los que no, su precio de menudeo).
   */
  esMayoreo?: boolean;
  /**
   * Blindaje Financiero: últimos 4 dígitos de la referencia/rastreo,
   * obligatorio cuando el método de pago es transferencia (DIGITAL/TRANSFERENCIA).
   */
  referenciaTransferencia?: string | null;
}

export interface SaleContext {
  idUsuario: string;
  idCaja: string | null;
  /** Tasa de IVA del negocio en porcentaje (ej. 16). Default: 16. */
  ivaRate?: number;
  /**
   * Fase 12: tasa del Puntos Monedero inyectada por el endpoint
   * (`BusinessConfig.puntosConfig`). Si no llega, se usan los defaults.
   */
  puntos?: {
    pesosCompraPorPunto: number;
    valorPuntoPesos: number;
  };
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
  /** Fase 12: nombre del cliente (ventas a crédito/puntos) y marca de tiempo. */
  nombreCliente: string | null;
  fechaHora: string;
}

type Tx = Prisma.TransactionClient;

/**
 * Núcleo transaccional de la venta. Ejecuta dentro de prisma.$transaction:
 * 1. Valida stock exacto (revierte con SaleError si no alcanza).
 * 2. Descuenta stock de forma atómica (UPDATE condicionado: sin sobreventa
 *    aunque dos cajas cobren la última unidad a la vez).
 * 3. Registra Venta + LineaDetalleVenta.
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

  // CRM / Monedero: el canje de puntos exige cliente registrado; en el resto
  // de los métodos el cliente es opcional y únicamente acumula fidelidad.
  const esMonedero = input.metodoPago === "PUNTOS_MONEDERO";
  let idCliente: string | null = String(input.idCliente ?? "").trim() || null;
  let puntosDisponibles = 0;
  let nombreCliente: string | null = null;
  if (!esMonedero && !idCliente) {
    idCliente = null;
  } else {
    if (!idCliente) {
      throw new SaleError(
        "Pago con puntos: selecciona el cliente dueño del monedero"
      );
    }
    const cliente = await tx.cliente.findUnique({
      where: { idCliente },
      select: { idCliente: true, nombre: true, puntosFidelidad: true },
    });
    if (!cliente) {
      throw new SaleError("Cliente no encontrado", 404);
    }
    puntosDisponibles = cliente.puntosFidelidad;
    nombreCliente = cliente.nombre;
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
    esServicio: boolean;
  }> = [];

  for (const item of input.items) {
    // Granel (permiteDecimales) soporta hasta 3 decimales; lo demás es entero.
    const cantidad = Math.round(Number(item.cantidad) * 1000) / 1000;
    if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 999) {
      throw new SaleError(`Cantidad inválida para el producto ${item.codigoItem}`);
    }

    const producto = await tx.producto.findUnique({
      where: claveProducto(item.codigoItem),
    });

    if (!producto || !producto.activo) {
      throw new SaleError(`Producto no encontrado: ${item.codigoItem}`, 404);
    }

    // Un servicio no lleva inventario: no se valida ni descuenta stock.
    const esServicio = producto.esServicio;
    if (!esServicio && !producto.permiteDecimales && !Number.isInteger(cantidad)) {
      throw new SaleError(
        `La cantidad de "${producto.descripcion}" debe ser un número entero`
      );
    }
    if (!esServicio && Number(producto.stockActual) < cantidad) {
      throw new SaleError(
        `Stock insuficiente para "${producto.descripcion}": disponible ${producto.stockActual}, solicitado ${cantidad}`
      );
    }

    const precio = elegirPrecioUnitario(producto, input.esMayoreo === true);
    const subtotalLinea = round2(precio * cantidad);
    subtotal = round2(subtotal + subtotalLinea);

    lineas.push({
      codigoItem: item.codigoItem,
      descripcion: producto.descripcion,
      cantidad,
      precioUnitario: precio,
      subtotalLinea,
      esServicio,
    });
  }

  const iva = round2(subtotal * ivaFraccion(ctx.ivaRate));
  const totalNeto = round2(subtotal + iva);
  const folioVenta = generarFolio();

  // El efectivo recibido debe cubrir el total (el cambio nunca es negativo).
  if (
    input.metodoPago === "EFECTIVO" &&
    input.montoRecibido != null &&
    Number.isFinite(Number(input.montoRecibido)) &&
    round2(Number(input.montoRecibido)) < totalNeto
  ) {
    throw new SaleError(
      `El monto recibido ($${round2(Number(input.montoRecibido)).toFixed(2)}) no cubre el total ($${totalNeto.toFixed(2)})`
    );
  }

  // Monedero (Fase 12): sin saldo de puntos suficiente la venta no procede.
  // El canje cubre la venta a `valorPuntoPesos` por punto (redondeado arriba).
  let puntosACanjear = 0;
  if (esMonedero) {
    puntosACanjear = puntosRequeridos(
      totalNeto,
      ctx.puntos?.valorPuntoPesos ?? PUNTOS_VALOR_DEFAULT
    );
    if (puntosDisponibles < puntosACanjear) {
      throw new SaleError(
        `Puntos insuficientes: el cliente tiene ${puntosDisponibles} pts y esta venta requiere ${puntosACanjear} pts`
      );
    }
  }

  // Bloqueo de ventas si la caja indicada no está ABIERTA (defensa en profundidad).
  if (ctx.idCaja) {
    const sesion = await tx.sesionCaja.findUnique({
      where: { idCaja: ctx.idCaja },
      select: { estado: true },
    });
    if (!sesion || sesion.estado !== "ABIERTA") {
      throw new SaleError("La caja está en proceso de cierre; no se pueden registrar ventas", 409);
    }
  } else if (!esMonedero) {
    // Sin caja abierta el ingreso no entraría a ningún arqueo.
    throw new SaleError("No hay una caja abierta; abre la caja para registrar ventas", 409);
  }

  // 1. Descuento de stock ATÓMICO: el UPDATE solo aplica si aún hay
  //    existencia suficiente. Dos ventas concurrentes de la última unidad no
  //    pueden pasar ambas (la segunda obtiene count = 0 y se revierte).
  for (const l of lineas) {
    if (l.esServicio) continue;
    const r = await tx.producto.updateMany({
      where: { codigoItem: l.codigoItem, stockActual: { gte: l.cantidad } },
      data: { stockActual: { decrement: l.cantidad } },
    });
    if (r.count === 0) {
      throw new SaleError(
        `Stock insuficiente para "${l.descripcion}": otra venta tomó la existencia`,
        409
      );
    }
  }

  // 2. Cabecera de venta
  await tx.venta.create({
    data: {
      folioVenta,
      subtotal: round2(subtotal),
      iva,
      totalNeto,
      idUsuario: ctx.idUsuario,
      idCaja: ctx.idCaja ?? undefined,
      idCliente: idCliente ?? undefined,
      estado: "COMPLETADA",
      metodoPago: input.metodoPago as MetodoPago,
      referenciaTransferencia,
    },
  });

  // 2b. Líneas de detalle
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

  // 3. Kardex inmutable (SALIDA por línea).
  //    Los servicios (esServicio) no tocan inventario ni kardex.
  await registrarMovimientosKardex(
    tx,
    lineas
      .filter((l) => !l.esServicio)
      .map((l) => ({
        codigoItem: l.codigoItem,
        tipo: "SALIDA",
        cantidad: l.cantidad,
        motivo: `Venta ${folioVenta}`,
        idUsuario: ctx.idUsuario,
      }))
  );

  // 4. Asignación financiera
  if (esMonedero && idCliente) {
    // Monedero (Fase 12): el cliente paga con PUNTOS. No toca la caja ni
    // genera puntos (un canje no gana fidelidad): solo descuenta saldo.
    // UPDATE condicionado: dos canjes simultáneos no dejan saldo negativo.
    const r = await tx.cliente.updateMany({
      where: { idCliente, puntosFidelidad: { gte: puntosACanjear } },
      data: { puntosFidelidad: { decrement: puntosACanjear } },
    });
    if (r.count === 0) {
      throw new SaleError("Puntos insuficientes: el saldo del cliente cambió", 409);
    }
  } else {
    if (ctx.idCaja) {
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

    // Fidelización: cualquier venta con cliente registrado acumula puntos
    // con la tasa del negocio (1 punto por cada `pesosCompraPorPunto`).
    if (idCliente) {
      const pesoPunto = ctx.puntos?.pesosCompraPorPunto ?? PESOS_POR_PUNTO;
      const puntosGanados = puntosGanadosPorCompra(totalNeto, pesoPunto);
      if (puntosGanados > 0) {
        await tx.cliente.update({
          where: { idCliente },
          data: { puntosFidelidad: { increment: puntosGanados } },
        });
      }
    }
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
        ...(esMonedero ? { puntosCanjeados: puntosACanjear } : {}),
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
    // Fase 12: nombre del cliente (cuando la venta queda vinculada a uno) y
    // marca de tiempo de la venta, para que el POS imprima el ticket fiel al
    // momento.
    nombreCliente: nombreCliente ?? null,
    fechaHora: new Date().toISOString(),
  };
}