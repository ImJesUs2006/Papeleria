import type { Prisma } from "@papeleria/database";
import { round2, IVA_RATE } from "./sales";

export const TIPOS_DEVOLUCION = ["DEVOLUCION", "NOTA_CREDITO"] as const;
export const METODOS_REEMBOLSO = [
  "EFECTIVO",
  "TRANSFERENCIA",
  "TARJETA_TERMINAL",
  "NOTA_CREDITO",
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
  const d = new Date();
  const fecha = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate()
  ).padStart(2, "0")}`;
  const aleatorio = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `D-${fecha}-${aleatorio}`;
}

/** Cantidad ya devuelta por código de artículo para una venta. */
export function calcularDevuelto(
  devoluciones: Array<{ lineas: Array<{ codigoItem: string; cantidad: number }> }>
): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const d of devoluciones) {
    for (const l of d.lineas) {
      mapa.set(l.codigoItem, (mapa.get(l.codigoItem) ?? 0) + l.cantidad);
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

  const originales = new Map<string, { cantidad: number; precio: number; descripcion: string }>();
  for (const l of venta.lineasDetalle) {
    const actual = originales.get(l.codigoItem);
    originales.set(l.codigoItem, {
      cantidad: (actual?.cantidad ?? 0) + l.cantidad,
      precio: Number(l.precioMomento),
      descripcion: l.codigoItem,
    });
  }

  const yaDevuelto = calcularDevuelto(venta.devoluciones);

  let subtotal = 0;
  const lineas: ReturnResult["items"] = [];
  const cantidades: Array<{ codigoItem: string; cantidad: number }> = [];

  for (const item of input.items) {
    const cantidad = Math.round(Number(item.cantidad));
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      throw new ReturnError(`Cantidad inválida para el producto ${item.codigoItem}`);
    }
    const original = originales.get(item.codigoItem);
    if (!original) {
      throw new ReturnError(`El producto ${item.codigoItem} no pertenece a esta venta`);
    }
    const disponible = original.cantidad - (yaDevuelto.get(item.codigoItem) ?? 0);
    if (cantidad > disponible) {
      throw new ReturnError(
        `Solo puedes devolver ${disponible} unidad(es) de ${item.codigoItem}`
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

  const iva = round2(subtotal * IVA_RATE);
  const totalNeto = round2(subtotal + iva);
  const folioDevolucion = generarFolioDevolucion();

  // Reingreso de stock
  for (const c of cantidades) {
    await tx.producto.update({
      where: { codigoItem: c.codigoItem },
      data: { stockActual: { increment: c.cantidad } },
    });
  }

  // Egreso de efectivo de la caja abierta (reembolso).
  let idCaja = ctx.idCaja;
  if (metodoReembolso === "EFECTIVO") {
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
  } else {
    idCaja = null;
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
