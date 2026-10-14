import type { Prisma } from "@papeleria/database";
import { moverStock } from "./existencias";
import { registrarMovimientosKardex } from "./kardex";
import { claveProducto } from "./tenant-keys";
import { fechaFolio, sufijoFolio } from "./sales";

// ============================================================
// Traspaso entre sucursales (Paso 5): sale de la existencia de origen
// (sin sobregirar) y entra a la de destino en la misma transacción. El
// total del negocio no cambia. Kardex SALIDA en origen y ENTRADA en destino.
// ============================================================

type Tx = Prisma.TransactionClient;

export class TraspasoError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface TraspasoInput {
  idOrigen: string;
  idDestino: string;
  items: Array<{ codigoItem: string; cantidad: number }>;
  notas?: string | null;
}

export async function ejecutarTraspaso(tx: Tx, input: TraspasoInput, idUsuario: string) {
  if (!input.idOrigen || !input.idDestino || input.idOrigen === input.idDestino) {
    throw new TraspasoError("Elige sucursales de origen y destino distintas");
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new TraspasoError("Agrega al menos un producto");
  }
  const sucursales = await tx.sucursal.findMany({
    where: { idSucursal: { in: [input.idOrigen, input.idDestino] }, activa: true },
    select: { idSucursal: true, nombre: true },
  });
  const nombre = new Map(sucursales.map((s) => [s.idSucursal, s.nombre]));
  if (!nombre.has(input.idOrigen) || !nombre.has(input.idDestino)) {
    throw new TraspasoError("Sucursal no encontrada o inactiva", 404);
  }

  const folio = `T-${fechaFolio()}-${sufijoFolio()}`;
  const lineas: Array<{ codigoItem: string; descripcion: string; cantidad: number }> = [];

  for (const item of input.items) {
    const cantidad = Math.round(Number(item.cantidad) * 1000) / 1000;
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      throw new TraspasoError(`Cantidad inválida para ${item.codigoItem}`);
    }
    const producto = await tx.producto.findUnique({ where: claveProducto(item.codigoItem) });
    if (!producto || !producto.activo) {
      throw new TraspasoError(`Producto no encontrado: ${item.codigoItem}`, 404);
    }
    if (producto.esServicio) {
      throw new TraspasoError(`"${producto.descripcion}" es un servicio: no tiene existencia`);
    }
    if (!producto.permiteDecimales && !Number.isInteger(cantidad)) {
      throw new TraspasoError(`La cantidad de "${producto.descripcion}" debe ser entera`);
    }

    const salio = await moverStock(tx, {
      codigoItem: item.codigoItem,
      delta: -cantidad,
      idSucursal: input.idOrigen,
      exigirDisponible: true,
    });
    if (!salio) {
      throw new TraspasoError(
        `No hay suficiente "${producto.descripcion}" en ${nombre.get(input.idOrigen)}`,
        409
      );
    }
    await moverStock(tx, { codigoItem: item.codigoItem, delta: cantidad, idSucursal: input.idDestino });
    lineas.push({ codigoItem: item.codigoItem, descripcion: producto.descripcion, cantidad });
  }

  await registrarMovimientosKardex(
    tx,
    lineas.flatMap((l) => [
      {
        codigoItem: l.codigoItem,
        tipo: "SALIDA" as const,
        cantidad: l.cantidad,
        motivo: `Traspaso ${folio} a ${nombre.get(input.idDestino)}`,
        idUsuario,
        idSucursal: input.idOrigen,
      },
      {
        codigoItem: l.codigoItem,
        tipo: "ENTRADA" as const,
        cantidad: l.cantidad,
        motivo: `Traspaso ${folio} desde ${nombre.get(input.idOrigen)}`,
        idUsuario,
        idSucursal: input.idDestino,
      },
    ])
  );

  const traspaso = await tx.traspaso.create({
    data: {
      folio,
      idOrigen: input.idOrigen,
      idDestino: input.idDestino,
      notas: input.notas ? String(input.notas).slice(0, 300) : null,
      idUsuario,
      lineas,
    },
  });

  await tx.bitacoraLog.create({
    data: {
      idUsuario,
      accion: `Traspaso ${folio}: ${nombre.get(input.idOrigen)} → ${nombre.get(input.idDestino)} (${lineas.length} productos)`,
      moduloSistema: "INVENTARIO",
      jsonPayload: { folio, idOrigen: input.idOrigen, idDestino: input.idDestino, lineas },
    },
  });

  return { folio, idTraspaso: traspaso.idTraspaso, lineas };
}
