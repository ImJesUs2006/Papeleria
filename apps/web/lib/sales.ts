import { precioPorCantidad, type ProductoConPrecios } from "./precios";
import type { Prisma } from "@papeleria/database";
import { registrarMovimientosKardex } from "./kardex";
import { calcularImpuestos, tasasProducto } from "./impuestos";
import {
  puntosGanadosPorCompra,
  puntosRequeridos,
} from "./fidelidad";
import { claveProducto } from "./tenant-keys";
import { moverStock, stockEnSucursal } from "./existencias";
import { consumirLotesFEFO, type ConsumoLote } from "./lotes";
import { normalizarSeries, SerieError, venderSeries } from "./series";
import {
  aplicarDescuentos,
  normalizarDescuento,
  type DescuentoManual,
  type PromocionVigente,
} from "./descuentos";
import {
  normalizarPagos,
  PagoError,
  rubroCaja,
  esTransferencia as esTransferenciaPago,
} from "./pagos";

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
  /** Código para que el POS reaccione (ej. "REQUIERE_AUTORIZACION"). */
  readonly codigo?: string;

  constructor(message: string, status = 400, codigo?: string) {
    super(message);
    this.name = "SaleError";
    this.status = status;
    this.codigo = codigo;
  }
}

export const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Precio unitario que se cobra (el servidor es la autoridad del precio):
 * menudeo, o la escala por volumen que alcanza `cantidad`, o —con venta a
 * mayoreo— el mejor precio del producto. Nunca 0 ni NaN si hay precio.
 * Reglas en lib/precios.ts (las mismas que usa el carrito).
 */
export function elegirPrecioUnitario(
  producto: ProductoConPrecios,
  esMayoreo: boolean,
  cantidad = 1
): number {
  return precioPorCantidad(producto, cantidad, esMayoreo);
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
  /** Descuento manual de la línea (porcentaje o monto). */
  descuento?: DescuentoManual | null;
  /** Números de serie vendidos (productos con `usaSeries`). */
  series?: string[];
}

export interface SaleInput {
  items: SaleLineInput[];
  /** Método único (compatibilidad). Con `pagos` se ignora. */
  metodoPago: string;
  tipoVenta?: string;
  montoRecibido?: number | null;
  /**
   * Cliente registrado asociado al ticket.
   * - Pago con PUNTOS_MONEDERO (total o parcial): obligatorio.
   * - Cualquier otro método: opcional; si viene, la venta acumula puntos.
   */
  idCliente?: string | null;
  /** Cobra `precioMayoreo` en los productos que lo tengan. */
  esMayoreo?: boolean;
  /** Últimos 4 dígitos de la referencia (pago único por transferencia). */
  referenciaTransferencia?: string | null;
  /** Descuento manual al ticket completo (se prorratea entre líneas). */
  descuentoTicket?: DescuentoManual | null;
  /** Pago mixto: varias partes que suman el total. */
  pagos?: Array<{ metodo: string; monto: number; referencia?: string | null }> | null;
}

export interface SaleContext {
  idUsuario: string;
  idCaja: string | null;
  /** Tasa de IVA del negocio en porcentaje (ej. 16). Default: 16. */
  ivaRate?: number;
  /** true = los precios de lista ya incluyen impuestos (se desglosan). */
  preciosIncluyenIva?: boolean;
  /** Tasa del Puntos Monedero (`BusinessConfig.puntosConfig`). */
  puntos?: {
    pesosCompraPorPunto: number;
    valorPuntoPesos: number;
    /** false = el negocio no usa el monedero: la venta no acumula puntos. */
    acumula?: boolean;
  };
  /** Rol de quien cobra: la CAJERA tiene tope de descuento manual. */
  rol?: string;
  /** % máximo de descuento manual sin autorización (default 10). */
  descuentoMaxCajera?: number;
  /** idPersona de la ADMINISTRADORA que autorizó un descuento mayor. */
  autorizadoPor?: string | null;
  /** Promociones vigentes del negocio (se aplican solas). */
  promociones?: PromocionVigente[];
  /** Sucursal donde se vende (su existencia es la que se descuenta). */
  idSucursal?: string | null;
}

export interface SaleResult {
  folioVenta: string;
  subtotal: number;
  iva: number;
  /** IEPS total de la venta (0 si ningún producto lo causa). */
  ieps: number;
  /** Total descontado (promociones + manuales). */
  descuentoTotal: number;
  totalNeto: number;
  /** Método único, o "MIXTO" con varios pagos. */
  metodoPago: MetodoPago | "MIXTO";
  pagos: Array<{ metodo: string; monto: number }>;
  tipoVenta: TipoVenta;
  cambio: number | null;
  items: Array<{
    codigoItem: string;
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    subtotalLinea: number;
    descuento: number;
    promocion: string | null;
  }>;
  nombreCliente: string | null;
  /** Puntos que ganó el cliente con esta compra (0 sin cliente o sin monedero). */
  puntosGanados: number;
  /** Saldo de puntos del cliente después de la venta (null sin cliente). */
  puntosCliente: number | null;
  fechaHora: string;
}

type Tx = Prisma.TransactionClient;

/**
 * Núcleo transaccional de la venta. Ejecuta dentro de prisma.$transaction:
 * 1. Valida productos, cantidades y stock.
 * 2. Aplica promociones y descuentos (con tope de cajera) y calcula impuestos.
 * 3. Valida los pagos (uno o varios) contra el total.
 * 4. Descuenta stock de forma atómica (sin sobreventa concurrente).
 * 5. Registra Venta + líneas + pagos y kardex.
 * 6. Asigna cada pago a su rubro de caja; canjea y acumula puntos.
 * 7. Deja log en bitácora.
 */
export async function executeSale(
  tx: Tx,
  input: SaleInput,
  ctx: SaleContext
): Promise<SaleResult> {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new SaleError("El carrito está vacío");
  }
  const usaPagosMixtos = Array.isArray(input.pagos) && input.pagos.length > 0;
  if (!usaPagosMixtos && !METODOS_PAGO.includes(input.metodoPago as MetodoPago)) {
    throw new SaleError("Método de pago inválido");
  }
  const metodosSolicitados = usaPagosMixtos
    ? input.pagos!.map((p) => String(p.metodo))
    : [input.metodoPago];
  const usaPuntos = metodosSolicitados.includes("PUNTOS_MONEDERO");
  const soloPuntos = metodosSolicitados.every((m) => m === "PUNTOS_MONEDERO");

  // CRM / Monedero: el canje de puntos exige cliente registrado; en el resto
  // de los métodos el cliente es opcional y únicamente acumula fidelidad.
  const idCliente: string | null = String(input.idCliente ?? "").trim() || null;
  let puntosDisponibles = 0;
  let nombreCliente: string | null = null;
  if (usaPuntos && !idCliente) {
    throw new SaleError("Pago con puntos: selecciona el cliente dueño del monedero");
  }
  if (idCliente) {
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

  // Blindaje Financiero (pago único): la transferencia exige la referencia.
  if (!usaPagosMixtos && esTransferenciaPago(input.metodoPago)) {
    const ref = String(input.referenciaTransferencia ?? "").trim();
    if (!/^\d{4}$/.test(ref)) {
      throw new SaleError(
        "Pago por transferencia: se requieren los últimos 4 dígitos de la referencia/rastreo"
      );
    }
  }

  let descuentoTicket: DescuentoManual | null = null;
  try {
    descuentoTicket = normalizarDescuento(input.descuentoTicket);
  } catch (e: any) {
    throw new SaleError(e.message);
  }

  const tipoVenta: TipoVenta = input.tipoVenta === "RECARGA" ? "RECARGA" : "PAPELERIA";

  // 1. Productos, cantidades y stock.
  const lineas: Array<{
    codigoItem: string;
    idCategoria: string | null;
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    descuento: DescuentoManual | null;
    subtotalLinea: number;
    descuentoLinea: number;
    promocion: string | null;
    esServicio: boolean;
    usaLotes: boolean;
    series: string[];
    lotes: ConsumoLote[];
    /** Costo unitario congelado (promedio; si no hay, el último costo). */
    costoUnitario: number | null;
    tasaIva: number;
    tasaIeps: number;
    ivaLinea: number;
    iepsLinea: number;
  }> = [];
  const ivaNegocio = ivaFraccion(ctx.ivaRate) * 100;

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
    const disponible = ctx.idSucursal
      ? (await stockEnSucursal(tx, ctx.idSucursal, [item.codigoItem])).get(item.codigoItem) ?? 0
      : Number(producto.stockActual);
    if (!esServicio && disponible < cantidad) {
      throw new SaleError(
        `Stock insuficiente para "${producto.descripcion}": disponible ${disponible}, solicitado ${cantidad}`
      );
    }

    let descuento: DescuentoManual | null = null;
    let series: string[] = [];
    try {
      descuento = normalizarDescuento(item.descuento);
      series = producto.usaSeries ? normalizarSeries(item.series) : [];
    } catch (e: any) {
      throw new SaleError(`${producto.descripcion}: ${e.message}`);
    }
    // Productos con número de serie: una serie por unidad vendida.
    if (producto.usaSeries && (!Number.isInteger(cantidad) || series.length !== cantidad)) {
      throw new SaleError(
        `"${producto.descripcion}" lleva número de serie: indica ${cantidad} serie(s) (capturaste ${series.length})`,
        400,
        "REQUIERE_SERIES"
      );
    }

    lineas.push({
      codigoItem: item.codigoItem,
      idCategoria: producto.idCategoria ?? null,
      descripcion: producto.descripcion,
      cantidad,
      precioUnitario: elegirPrecioUnitario(producto, input.esMayoreo === true, cantidad),
      descuento,
      subtotalLinea: 0,
      descuentoLinea: 0,
      promocion: null,
      esServicio,
      usaLotes: producto.usaLotes === true,
      series,
      lotes: [],
      costoUnitario:
        producto.costoPromedio != null
          ? Number(producto.costoPromedio)
          : producto.precioCompra != null
            ? Number(producto.precioCompra)
            : null,
      ...tasasProducto(producto, ivaNegocio),
      ivaLinea: 0,
      iepsLinea: 0,
    });
  }

  // 2. Promociones (automáticas) y descuentos manuales.
  const precios = aplicarDescuentos(
    lineas.map((l) => ({
      codigoItem: l.codigoItem,
      idCategoria: l.idCategoria,
      cantidad: l.cantidad,
      precio: l.precioUnitario,
      descuento: l.descuento,
    })),
    ctx.promociones ?? [],
    descuentoTicket
  );
  // Tope de la cajera: arriba de él, una administradora debe autorizar.
  const tope = Number.isFinite(Number(ctx.descuentoMaxCajera)) ? Number(ctx.descuentoMaxCajera) : 10;
  const exigeAutorizacion =
    ctx.rol !== undefined && ctx.rol !== "ADMINISTRADORA" && precios.porcentajeManual > tope;
  if (exigeAutorizacion && !ctx.autorizadoPor) {
    throw new SaleError(
      `El descuento (${precios.porcentajeManual}%) excede tu tope de ${tope}%: requiere autorización de la administradora`,
      403,
      "REQUIERE_AUTORIZACION"
    );
  }

  // Impuestos sobre el importe YA descontado (el descuento reduce la base).
  const fiscal = calcularImpuestos(
    precios.lineas.map((pl, i) => ({
      importe: pl.importeNeto,
      tasaIva: lineas[i].tasaIva,
      tasaIeps: lineas[i].tasaIeps,
    })),
    { preciosIncluyenIva: ctx.preciosIncluyenIva === true }
  );
  fiscal.lineas.forEach((f, i) => {
    lineas[i].subtotalLinea = f.base;
    lineas[i].ivaLinea = f.iva;
    lineas[i].iepsLinea = f.ieps;
    lineas[i].descuentoLinea = precios.lineas[i].descuentoTotal;
    lineas[i].promocion = precios.lineas[i].promocion;
  });
  const subtotal = fiscal.subtotal;
  const iva = fiscal.iva;
  const ieps = fiscal.ieps;
  const totalNeto = fiscal.total;
  const descuentoTotal = round2(precios.totalPromociones + precios.totalManual);
  const folioVenta = generarFolio();

  // 3. Pagos (uno o varios) contra el total.
  let pagosVenta;
  try {
    pagosVenta = normalizarPagos(
      {
        metodoPago: input.metodoPago,
        pagos: input.pagos,
        montoRecibido: input.montoRecibido,
        referenciaTransferencia: input.referenciaTransferencia,
      },
      totalNeto
    );
  } catch (e) {
    if (e instanceof PagoError) throw new SaleError(e.message);
    throw e;
  }

  // Monedero: los puntos deben cubrir su parte (redondeado arriba).
  const pagoPuntos = pagosVenta.pagos.find((p) => p.metodo === "PUNTOS_MONEDERO");
  const valorPunto = ctx.puntos?.valorPuntoPesos ?? PUNTOS_VALOR_DEFAULT;
  const puntosACanjear = pagoPuntos ? puntosRequeridos(pagoPuntos.monto, valorPunto) : 0;
  if (pagoPuntos && puntosDisponibles < puntosACanjear) {
    throw new SaleError(
      `Puntos insuficientes: el cliente tiene ${puntosDisponibles} pts y esta venta requiere ${puntosACanjear} pts`
    );
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
  } else if (!soloPuntos) {
    // Sin caja abierta el ingreso no entraría a ningún arqueo.
    throw new SaleError("No hay una caja abierta; abre la caja para registrar ventas", 409);
  }

  // 4. Descuento de stock ATÓMICO: el UPDATE solo aplica si aún hay
  //    existencia suficiente. Dos ventas concurrentes de la última unidad no
  //    pueden pasar ambas (la segunda obtiene count = 0 y se revierte).
  for (const l of lineas) {
    if (l.esServicio) continue;
    const ok = await moverStock(tx, {
      codigoItem: l.codigoItem,
      delta: -l.cantidad,
      idSucursal: ctx.idSucursal,
      exigirDisponible: true,
    });
    if (!ok) {
      throw new SaleError(
        `Stock insuficiente para "${l.descripcion}": otra venta tomó la existencia`,
        409
      );
    }
    // Trazabilidad: series vendidas y lotes consumidos (primero lo que
    // caduca antes; nunca lotes vencidos).
    if (l.series.length > 0) {
      try {
        await venderSeries(tx, {
          codigoItem: l.codigoItem,
          idSucursal: ctx.idSucursal ?? null,
          series: l.series,
          folioVenta,
        });
      } catch (e) {
        if (e instanceof SerieError) throw new SaleError(`${l.descripcion}: ${e.message}`, e.status);
        throw e;
      }
    }
    if (l.usaLotes && ctx.idSucursal) {
      l.lotes = await consumirLotesFEFO(tx, {
        codigoItem: l.codigoItem,
        idSucursal: ctx.idSucursal,
        cantidad: l.cantidad,
      });
    }
  }

  // 5. Venta, líneas, pagos y kardex.
  const referenciaUnica =
    pagosVenta.pagos.length === 1 ? pagosVenta.pagos[0].referencia : null;
  await tx.venta.create({
    data: {
      folioVenta,
      subtotal: round2(subtotal),
      iva,
      ieps,
      descuentoTotal,
      idAutorizoDescuento: exigeAutorizacion ? ctx.autorizadoPor ?? null : null,
      totalNeto,
      idUsuario: ctx.idUsuario,
      idCaja: ctx.idCaja ?? undefined,
      ...(ctx.idSucursal ? { idSucursal: ctx.idSucursal } : {}),
      idCliente: idCliente ?? undefined,
      estado: "COMPLETADA",
      metodoPago: pagosVenta.metodoVenta,
      referenciaTransferencia: referenciaUnica,
      pagos: {
        create: pagosVenta.pagos.map((p) => ({
          metodo: p.metodo,
          monto: p.monto,
          referencia: p.referencia,
          puntos: p.metodo === "PUNTOS_MONEDERO" ? puntosACanjear : null,
        })),
      },
    },
  });

  for (const l of lineas) {
    await tx.lineaDetalleVenta.create({
      data: {
        folioVenta,
        codigoItem: l.codigoItem,
        cantidad: l.cantidad,
        precioMomento: l.precioUnitario,
        ...(l.costoUnitario != null ? { costoUnitario: l.costoUnitario } : {}),
        descuentoLinea: l.descuentoLinea,
        promocion: l.promocion,
        ...(l.lotes.length ? { lotes: l.lotes as unknown as Prisma.InputJsonValue } : {}),
        ...(l.series.length ? { series: l.series } : {}),
        subtotalLinea: l.subtotalLinea,
        tasaIva: l.tasaIva,
        ivaLinea: l.ivaLinea,
        iepsLinea: l.iepsLinea,
      },
    });
  }

  // Kardex inmutable (SALIDA por línea). Los servicios no tocan inventario.
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
        idSucursal: ctx.idSucursal,
      }))
  );

  // 6. Caja: cada pago a su rubro (las recargas van completas a su rubro).
  if (ctx.idCaja) {
    let efectivo = 0;
    let digital = 0;
    let recargas = 0;
    for (const p of pagosVenta.pagos) {
      const rubro = rubroCaja(p.metodo);
      if (!rubro) continue;
      if (tipoVenta === "RECARGA") recargas = round2(recargas + p.monto);
      else if (rubro === "EFECTIVO") efectivo = round2(efectivo + p.monto);
      else digital = round2(digital + p.monto);
    }
    const data: Record<string, { increment: number }> = {};
    if (efectivo > 0) data.totalVentasEfectivo = { increment: efectivo };
    if (digital > 0) data.totalVentasDigital = { increment: digital };
    if (recargas > 0) data.totalRecargas = { increment: recargas };
    if (Object.keys(data).length > 0) {
      await tx.sesionCaja.update({ where: { idCaja: ctx.idCaja }, data });
    }
  }

  // Monedero: canje con UPDATE condicionado (dos canjes simultáneos no dejan
  // saldo negativo). Solo la parte pagada con dinero acumula puntos.
  if (idCliente && puntosACanjear > 0) {
    const r = await tx.cliente.updateMany({
      where: { idCliente, puntosFidelidad: { gte: puntosACanjear } },
      data: { puntosFidelidad: { decrement: puntosACanjear } },
    });
    if (r.count === 0) {
      throw new SaleError("Puntos insuficientes: el saldo del cliente cambió", 409);
    }
  }
  let puntosGanados = 0;
  let puntosCliente: number | null = null;
  if (idCliente) {
    const pagadoConDinero = round2(totalNeto - (pagoPuntos?.monto ?? 0));
    const pesoPunto = ctx.puntos?.pesosCompraPorPunto ?? PESOS_POR_PUNTO;
    puntosGanados = ctx.puntos?.acumula === false ? 0 : puntosGanadosPorCompra(pagadoConDinero, pesoPunto);
    const actualizado =
      puntosGanados > 0
        ? await tx.cliente.update({
            where: { idCliente },
            data: { puntosFidelidad: { increment: puntosGanados } },
            select: { puntosFidelidad: true },
          })
        : await tx.cliente.findUnique({ where: { idCliente }, select: { puntosFidelidad: true } });
    puntosCliente = actualizado?.puntosFidelidad ?? null;
  }

  // 7. Bitácora
  await tx.bitacoraLog.create({
    data: {
      idUsuario: ctx.idUsuario,
      accion: `Venta ${folioVenta} registrada: $${totalNeto}`,
      moduloSistema: "PUNTO_VENTA",
      jsonPayload: {
        folioVenta,
        subtotal,
        iva,
        ...(ieps > 0 ? { ieps } : {}),
        totalNeto,
        metodoPago: pagosVenta.metodoVenta,
        ...(pagosVenta.pagos.length > 1
          ? { pagos: pagosVenta.pagos.map((p) => ({ metodo: p.metodo, monto: p.monto })) }
          : {}),
        tipoVenta,
        referenciaTransferencia: referenciaUnica,
        numItems: lineas.length,
        ...(descuentoTotal > 0
          ? {
              descuentoTotal,
              descuentoManual: precios.totalManual,
              promociones: precios.totalPromociones,
              ...(exigeAutorizacion ? { autorizadoPor: ctx.autorizadoPor } : {}),
            }
          : {}),
        ...(puntosACanjear > 0 ? { puntosCanjeados: puntosACanjear } : {}),
      },
    },
  });

  return {
    folioVenta,
    subtotal,
    iva,
    ieps,
    descuentoTotal,
    totalNeto,
    metodoPago: pagosVenta.metodoVenta,
    pagos: pagosVenta.pagos.map((p) => ({ metodo: p.metodo, monto: p.monto })),
    tipoVenta,
    cambio: pagosVenta.cambio,
    items: lineas.map((l) => ({
      codigoItem: l.codigoItem,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      precioUnitario: l.precioUnitario,
      subtotalLinea: l.subtotalLinea,
      descuento: l.descuentoLinea,
      promocion: l.promocion,
    })),
    nombreCliente: nombreCliente ?? null,
    puntosGanados,
    puntosCliente,
    fechaHora: new Date().toISOString(),
  };
}
