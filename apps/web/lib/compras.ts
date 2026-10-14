import type { Prisma } from "@papeleria/database";
import { moverStock } from "./existencias";
import { registrarMovimientosKardex } from "./kardex";
import { registrarEntradaLote } from "./lotes";
import { claveProducto } from "./tenant-keys";

// ============================================================
// Compras (Paso 7): recepción de pedidos a proveedor, total o PARCIAL.
//
// Cada renglón recibido entra a la existencia de la sucursal (con lote si
// el producto lo controla), deja kardex y recalcula el COSTO PROMEDIO
// ponderado del producto. `precioCompra` queda como el último costo.
// El pedido pasa a PARCIAL o, cuando todo llegó, a ENTREGADO.
// ============================================================

type Tx = Prisma.TransactionClient;

export class CompraError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface RenglonRecepcion {
  idItemPedido: string;
  cantidad: number;
  /** Costo real pagado (por defecto, el cotizado). */
  costoUnitario?: number | null;
  /** Para productos con lotes. */
  numeroLote?: string | null;
  caducidad?: Date | null;
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Costo promedio ponderado tras recibir `cantidad` a `costo`.
 * Con existencia en cero (o negativa) el nuevo costo es el de la compra.
 */
export function costoPromedioPonderado(
  existenciaPrevia: number,
  costoPrevio: number | null,
  cantidad: number,
  costo: number
): number {
  const previa = Math.max(existenciaPrevia, 0);
  if (costoPrevio == null || previa === 0) return r4(costo);
  return r4((previa * costoPrevio + cantidad * costo) / (previa + cantidad));
}

/**
 * Recibe un pedido. `renglones = "TODO"` recibe todo lo pendiente al costo
 * cotizado (sin lote).
 */
export async function recibirPedido(
  tx: Tx,
  r: {
    idPedido: string;
    renglones: RenglonRecepcion[] | "TODO";
    idUsuario: string;
    idSucursal: string | null;
  }
) {
  const pedido = await tx.pedidoProveedor.findUnique({
    where: { idPedido: r.idPedido },
    include: {
      proveedor: { select: { nombre: true } },
      items: {
        include: {
          producto: {
            select: {
              descripcion: true,
              esServicio: true,
              usaLotes: true,
              usaSeries: true,
              stockActual: true,
              costoPromedio: true,
            },
          },
        },
      },
    },
  });
  if (!pedido) throw new CompraError("Pedido no encontrado", 404);
  if (pedido.estado === "ENTREGADO" || pedido.estado === "CANCELADO") {
    throw new CompraError(`El pedido ya está ${pedido.estado}`, 409);
  }

  const renglones: RenglonRecepcion[] =
    r.renglones === "TODO"
      ? pedido.items
          .filter((i) => i.cantidad - i.cantidadRecibida > 0)
          .map((i) => ({ idItemPedido: i.idItemPedido, cantidad: i.cantidad - i.cantidadRecibida }))
      : r.renglones;
  if (renglones.length === 0) throw new CompraError("No hay nada pendiente por recibir");

  const recibidos: Array<{ codigoItem: string; cantidad: number; costo: number }> = [];
  for (const ren of renglones) {
    const item = pedido.items.find((i) => i.idItemPedido === ren.idItemPedido);
    if (!item) throw new CompraError("Renglón que no pertenece al pedido", 404);
    const cantidad = Number(ren.cantidad);
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      throw new CompraError(`Cantidad inválida para ${item.producto.descripcion}`);
    }
    if (item.producto.usaSeries) {
      throw new CompraError(
        `"${item.producto.descripcion}" lleva número de serie: recíbelo registrando sus series en Lotes y series`
      );
    }
    const costo = r4(Number(ren.costoUnitario ?? item.precioCotizado));
    if (!Number.isFinite(costo) || costo < 0) {
      throw new CompraError(`Costo inválido para ${item.producto.descripcion}`);
    }

    // No recibir más de lo pedido; condicionado contra recepciones simultáneas.
    const marca = await tx.itemPedidoProveedor.updateMany({
      where: { idItemPedido: item.idItemPedido, cantidadRecibida: { lte: item.cantidad - cantidad } },
      data: { cantidadRecibida: { increment: cantidad } },
    });
    if (marca.count === 0) {
      throw new CompraError(
        `Solo quedan ${item.cantidad - item.cantidadRecibida} por recibir de ${item.producto.descripcion}`,
        409
      );
    }
    if (item.producto.esServicio) continue;

    // Costo promedio con la existencia total ANTES de esta entrada.
    const actual = await tx.producto.findUnique({
      where: claveProducto(item.codigoItem),
      select: { stockActual: true, costoPromedio: true },
    });
    const nuevoCosto = costoPromedioPonderado(
      Number(actual?.stockActual ?? 0),
      actual?.costoPromedio != null ? Number(actual.costoPromedio) : null,
      cantidad,
      costo
    );

    if (item.producto.usaLotes && ren.numeroLote && r.idSucursal) {
      await registrarEntradaLote(tx, {
        codigoItem: item.codigoItem,
        idSucursal: r.idSucursal,
        numeroLote: ren.numeroLote,
        caducidad: ren.caducidad ?? null,
        cantidad,
        idUsuario: r.idUsuario,
      });
    } else {
      await moverStock(tx, { codigoItem: item.codigoItem, delta: cantidad, idSucursal: r.idSucursal });
      await registrarMovimientosKardex(tx, [
        {
          codigoItem: item.codigoItem,
          tipo: "ENTRADA",
          cantidad,
          motivo: `Recepción de pedido a ${pedido.proveedor.nombre}`.slice(0, 190),
          idUsuario: r.idUsuario,
          idSucursal: r.idSucursal,
        },
      ]);
    }
    await tx.producto.update({
      where: claveProducto(item.codigoItem),
      data: { costoPromedio: nuevoCosto, precioCompra: costo },
    });
    recibidos.push({ codigoItem: item.codigoItem, cantidad, costo });
  }

  const items = await tx.itemPedidoProveedor.findMany({
    where: { idPedido: r.idPedido },
    select: { cantidad: true, cantidadRecibida: true },
  });
  const completo = items.every((i) => i.cantidadRecibida >= i.cantidad);
  const estado = completo ? "ENTREGADO" : "PARCIAL";
  await tx.pedidoProveedor.update({
    where: { idPedido: r.idPedido },
    data: { estado, ...(completo && !pedido.fechaEntrega ? { fechaEntrega: new Date() } : {}) },
  });
  await tx.bitacoraLog.create({
    data: {
      idUsuario: r.idUsuario,
      accion: `Recepción ${completo ? "total" : "parcial"} de pedido a ${pedido.proveedor.nombre}`,
      moduloSistema: "INVENTARIO",
      jsonPayload: { idPedido: r.idPedido, estado, recibidos },
    },
  });
  return { estado, recibidos };
}
