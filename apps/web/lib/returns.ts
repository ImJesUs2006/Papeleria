import type { Prisma } from "@papeleria/database";
import { round2, ivaFraccion, sufijoFolio, fechaFolio } from "./sales";
import { registrarMovimientosKardex } from "./kardex";
import { puntosGanadosPorCompra, puntosRequeridos } from "./fidelidad";
import { claveProducto } from "./tenant-keys";

export const TIPOS_DEVOLUCION = ["DEVOLUCION", "NOTA_CREDITO"] as const;
export const METODOS_REEMBOLSO = [
  "EFECTIVO",
  "TRANSFERENCIA",
  "TARJETA_TERMINAL",
  "NOTA_CREDITO",
  "PUNTOS_MONEDERO",
] as const;

export type TipoDevolucion = (typeof TIPOS_DEVOLUCION)[number];
export type MetodoReembolso = (typeof METODOS_REEMBOLSO)[number];

export class ReturnError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ReturnError";
    this.status = status;
  }
}

type Tx = Prisma.TransactionClient;

export interface ReturnLineInput {
  codigoItem: string;
  cantidad: number;
}

export interface ReturnInput {
  folioVenta: string;
  items: ReturnLineInput[];
  tipo?: string;
  metodoReembolso?: string;
  motivo?: string;
}

export interface ReturnContext {
  idUsuario: string;
  idCaja: string | null;
  /**
   * Fase 12: `valorPuntoPesos` de la tasa del Puntos Monedero para
   * reembolsar en puntos de fidelidad (cuántos puntos se restituyen).
   */
  puntos?: { valorPuntoPesos: number; pesosCompraPorPunto?: number };
  /** Tasa de IVA del negocio (porcentaje); solo rige si la venta no la trae. */
  ivaRate?: number;
}

export interface ReturnResult {
  folioDevolucion: string;
  folioVenta: string;
  tipo: TipoDevolucion;
  metodoReembolso: MetodoReembolso;
  subtotal: number;
  iva: number;
  totalNeto: number;
  ventaCompleta: boolean;
  items: Array<{
    codigoItem: string;
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    subtotalLinea: number;
  }>;
}

function generarFolioDevolucion(): string {
  return `D-${fechaFolio()}-${sufijoFolio()}`;
}

/** Cantidad ya devuelta por código de artículo para una venta. */
export function calcularDevuelto(
  devoluciones: Array<{
    lineas: Array<{ codigoItem: string; cantidad: number | Prisma.Decimal }>;
  }>
): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const d of devoluciones) {
    for (const l of d.lineas) {
      mapa.set(l.codigoItem, (mapa.get(l.codigoItem) ?? 0) + Number(l.cantidad));
    }
  }
  return mapa;
}

/**
 * Núcleo transaccional de una devolución / nota de crédito. Ejecuta dentro de
 * prisma.$transaction:
 * 1. Valida que lo devuelto no exceda lo vendido (descontando devoluciones previas).
 * 2. Crea Devolucion + DevolucionLinea usando el precio congelado de la venta.
 * 3. Reingresa el stock de los productos devueltos.
 * 4. Si el reembolso es en EFECTIVO, registra el egreso en la caja abierta.
 * 5. Marca la venta como REEMBOLSADA si se devolvió por completo.
 * 6. Deja log en bitácora.
 */
export async function executeReturn(
  tx: Tx,
  input: ReturnInput,
  ctx: ReturnContext
): Promise<ReturnResult> {
  if (!input.folioVenta) {
    throw new ReturnError("Debes indicar la venta a devolver");
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new ReturnError("No hay artículos por devolver");
  }

  const tipo: TipoDevolucion = input.tipo === "NOTA_CREDITO" ? "NOTA_CREDITO" : "DEVOLUCION";

  let metodoReembolso: MetodoReembolso;
  if (tipo === "NOTA_CREDITO") {
    metodoReembolso = "NOTA_CREDITO";
  } else {
    if (
      !METODOS_REEMBOLSO.includes(input.metodoReembolso as MetodoReembolso) ||
      input.metodoReembolso === "NOTA_CREDITO"
    ) {
      throw new ReturnError("Método de reembolso inválido");
    }
    metodoReembolso = input.metodoReembolso as MetodoReembolso;
  }

  const venta = await tx.venta.findUnique({
    where: { folioVenta: input.folioVenta },
    include: {
      lineasDetalle: true,
      devoluciones: { include: { lineas: true } },
    },
  });
  if (!venta) {
    throw new ReturnError("Venta no encontrada", 404);
  }
  if (venta.estado === "CANCELADA") {
    throw new ReturnError("No se puede devolver una venta cancelada", 409);
  }
  // Monedero (Fase 12): si la venta original se pagó con puntos, el
  // reembolso siempre restituye puntos (jamás efectivo desde la caja).
  // Dato inconsistente heredado: cobro con puntos sin cliente asignado.
  const ventaPagoConPuntos = venta.metodoPago === "PUNTOS_MONEDERO";
  if (ventaPagoConPuntos && !venta.idCliente) {
    throw new ReturnError(
      "No hay cliente asociado para reembolsar en puntos de fidelidad",
      409
    );
  }
  const ventaMonedero = ventaPagoConPuntos && venta.idCliente != null;
  if (ventaMonedero) {
    if (input.metodoReembolso !== "PUNTOS_MONEDERO") {
      throw new ReturnError(
        "Esta venta se pagó con puntos: el reembolso se hace en puntos de fidelidad"
      );
    }
    metodoReembolso = "PUNTOS_MONEDERO";
  } else if (metodoReembolso === "PUNTOS_MONEDERO") {
    // Blindaje financiero: los puntos solo se restituyen si ASÍ se cobró la
    // venta. Sin esto, una venta normal de $1,000 en efectivo podría
    // "reembolsarse" en puntos y convertir dinero en lealtad.
    throw new ReturnError(
      "Los puntos solo se reembolsan en ventas pagadas con puntos: devuelve esta venta con su método de pago original",
      409
    );
  }
  if (metodoReembolso === "PUNTOS_MONEDERO" && !venta.idCliente) {
    // Cubierto arriba; se conserva como red de seguridad.
    throw new ReturnError(
      "No hay cliente asociado para reembolsar en puntos de fidelidad",
      409
    );
  }

  const originales = new Map<string, {
    cantidad: number;
    precio: number;
    descripcion: string;
    esServicio: boolean;
  }>();

  // Identifica los servicios (esServicio) para NO reingresar stock.
  const codigosVenta = venta.lineasDetalle.map((l) => l.codigoItem);
  const productosVenta = await tx.producto.findMany({
    where: { codigoItem: { in: codigosVenta } },
    select: { codigoItem: true, esServicio: true },
  });
  const serviciosMap = new Map(productosVenta.map((p) => [p.codigoItem, p.esServicio]));

  for (const l of venta.lineasDetalle) {
    const actual = originales.get(l.codigoItem);
    originales.set(l.codigoItem, {
      cantidad: (actual?.cantidad ?? 0) + Number(l.cantidad),
      precio: Number(l.precioMomento),
      descripcion: l.codigoItem,
      esServicio: serviciosMap.get(l.codigoItem) === true,
    });
  }

  const yaDevuelto = calcularDevuelto(venta.devoluciones);

  let subtotal = 0;
  const lineas: ReturnResult["items"] = [];
  const cantidades: Array<{ codigoItem: string; cantidad: number }> = [];

  for (const item of input.items) {
    const cantidad = Math.round(Number(item.cantidad) * 1000) / 1000;
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      throw new ReturnError(`Cantidad inválida para el producto ${item.codigoItem}`);
    }
    const original = originales.get(item.codigoItem);
    if (!original) {
      throw new ReturnError(`El producto ${item.codigoItem} no pertenece a esta venta`);
    }
    const disponible = Math.round((original.cantidad - (yaDevuelto.get(item.codigoItem) ?? 0)) * 1000) / 1000;
    if (cantidad > disponible) {
      throw new ReturnError(
        `Solo puedes devolver ${disponible} de ${item.codigoItem}`
      );
    }

    const subtotalLinea = round2(original.precio * cantidad);
    subtotal = round2(subtotal + subtotalLinea);
    lineas.push({
      codigoItem: item.codigoItem,
      descripcion: original.descripcion,
      cantidad,
      precioUnitario: original.precio,
      subtotalLinea,
    });
    cantidades.push({ codigoItem: item.codigoItem, cantidad });
  }

  // El IVA devuelto usa la MISMA tasa con la que se cobró la venta (si el
  // negocio cambió su tasa después, el reembolso no debe diferir del cobro).
  const subtotalVenta = Number((venta as any).subtotal);
  const ivaVenta = Number((venta as any).iva);
  const tasaIva =
    Number.isFinite(subtotalVenta) && subtotalVenta > 0 && Number.isFinite(ivaVenta)
      ? ivaVenta / subtotalVenta
      : ivaFraccion(ctx.ivaRate);
  const iva = round2(subtotal * tasaIva);
  const totalNeto = round2(subtotal + iva);
  const folioDevolucion = generarFolioDevolucion();

  // Reingreso de stock (nunca para servicios).
  const cantidadesReales = cantidades.filter(
    (c) => originales.get(c.codigoItem)?.esServicio !== true
  );
  for (const c of cantidadesReales) {
    await tx.producto.update({
      where: claveProducto(c.codigoItem),
      data: { stockActual: { increment: c.cantidad } },
    });
  }

  // Kardex inmutable (ENTRADA por línea).
  await registrarMovimientosKardex(
    tx,
    cantidadesReales.map((c) => ({
      codigoItem: c.codigoItem,
      tipo: "ENTRADA",
      cantidad: c.cantidad,
      motivo: `${tipo === "NOTA_CREDITO" ? "Nota de crédito" : "Devolución"} ${folioDevolucion}`,
      idUsuario: ctx.idUsuario,
    }))
  );

  // Devolución o abono a la deuda del cliente (venta original a crédito).
  let idCaja = ctx.idCaja;
  if (metodoReembolso === "PUNTOS_MONEDERO" && venta.idCliente) {
    // Monedero (Fase 12): el reembolso restituye los puntos que el cliente
    // habría usado para pagar la venta (al valor vigente de la tasa).
    // No toca la caja.
    const valorPunto = ctx.puntos?.valorPuntoPesos ?? 1;
    await tx.cliente.update({
      where: { idCliente: venta.idCliente },
      data: {
        puntosFidelidad: { increment: puntosRequeridos(totalNeto, valorPunto) },
      },
    });
    idCaja = null;
  } else if (metodoReembolso === "EFECTIVO") {
    if (!idCaja) {
      throw new ReturnError(
        "La caja no está abierta; no se puede reembolsar en efectivo",
        409
      );
    }
    const sesion = await tx.sesionCaja.findUnique({
      where: { idCaja },
      select: { estado: true },
    });
    if (!sesion || sesion.estado !== "ABIERTA") {
      throw new ReturnError(
        "La caja no está abierta; no se puede reembolsar en efectivo",
        409
      );
    }
    await tx.sesionCaja.update({
      where: { idCaja },
      data: { totalEgresos: { increment: totalNeto } },
    });
  } else if (
    (metodoReembolso === "TRANSFERENCIA" || metodoReembolso === "TARJETA_TERMINAL") &&
    idCaja
  ) {
    // Reembolso digital: reduce lo que la terminal/banco reportará en el
    // corte de vouchers de la caja abierta. Sin caja abierta no se asigna.
    const sesion = await tx.sesionCaja.findUnique({
      where: { idCaja },
      select: { estado: true },
    });
    if (sesion?.estado === "ABIERTA") {
      await tx.sesionCaja.update({
        where: { idCaja },
        data: { totalVentasDigital: { decrement: totalNeto } },
      });
    } else {
      idCaja = null;
    }
  } else {
    idCaja = null;
  }

  // Fidelización: la venta original (no monedero) generó puntos; al
  // devolverla se retiran en proporción para que comprar-y-devolver no
  // regale puntos. Nunca deja el saldo en negativo.
  let puntosRevertidos = 0;
  if (!ventaMonedero && venta.idCliente && ctx.puntos?.pesosCompraPorPunto) {
    const aRevertir = puntosGanadosPorCompra(totalNeto, ctx.puntos.pesosCompraPorPunto);
    if (aRevertir > 0) {
      const cliente = await tx.cliente.findUnique({
        where: { idCliente: venta.idCliente },
        select: { puntosFidelidad: true },
      });
      puntosRevertidos = Math.min(aRevertir, Math.max(cliente?.puntosFidelidad ?? 0, 0));
      if (puntosRevertidos > 0) {
        await tx.cliente.update({
          where: { idCliente: venta.idCliente },
          data: { puntosFidelidad: { decrement: puntosRevertidos } },
        });
      }
    }
  }

  await tx.devolucion.create({
    data: {
      folioDevolucion,
      folioVenta: input.folioVenta,
      tipo,
      motivo: input.motivo || null,
      subtotal,
      iva,
      totalNeto,
      metodoReembolso,
      idUsuario: ctx.idUsuario,
      idCaja: idCaja ?? undefined,
      lineas: {
        create: lineas.map((l) => ({
          codigoItem: l.codigoItem,
          cantidad: l.cantidad,
          precioMomento: l.precioUnitario,
          subtotalLinea: l.subtotalLinea,
        })),
      },
    },
  });

  // ¿Quedó devuelta por completo la venta?
  const ventaCompleta = [...originales.entries()].every(
    ([codigo, o]) => (yaDevuelto.get(codigo) ?? 0) + (cantidades.find((c) => c.codigoItem === codigo)?.cantidad ?? 0) >= o.cantidad
  );

  if (ventaCompleta && venta.estado !== "REEMBOLSADA") {
    await tx.venta.update({
      where: { folioVenta: input.folioVenta },
      data: { estado: "REEMBOLSADA" },
    });
  }

  await tx.bitacoraLog.create({
    data: {
      idUsuario: ctx.idUsuario,
      accion: `${tipo === "NOTA_CREDITO" ? "Nota de crédito" : "Devolución"} ${folioDevolucion} sobre ${input.folioVenta}: $${totalNeto}`,
      moduloSistema: "PUNTO_VENTA",
      jsonPayload: {
        folioDevolucion,
        folioVenta: input.folioVenta,
        tipo,
        metodoReembolso,
        totalNeto,
        ventaCompleta,
        puntosRestituidos: ventaMonedero ? venta.idCliente : undefined,
        puntosRevertidos: puntosRevertidos || undefined,
        items: cantidades,
      },
    },
  });

  return {
    folioDevolucion,
    folioVenta: input.folioVenta,
    tipo,
    metodoReembolso,
    subtotal,
    iva,
    totalNeto,
    ventaCompleta,
    items: lineas,
  };
}
