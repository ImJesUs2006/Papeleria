import type { Prisma } from "@papeleria/database";
import { registrarMovimientosKardex } from "./kardex";
import { ivaFraccion, round2, sufijoFolio, fechaFolio } from "./sales";
import { calcularImpuestos, tasasProducto } from "./impuestos";
import { claveProducto } from "./tenant-keys";

// ============================================================
// Sistema de Apartados (Layaways) — Fase 10 / C3.
//
// El cliente deja un anticipo por mercancía apartada; el stock se
// RESERVA con descuento físico inmediato (kardex SALIDA inmutable,
// igual que la venta) y el anticipo ingresa a la caja como venta
// efectivo/digital. La liquidación materializa la venta.
//
// Reglas heredadas de C2:
//  - cantidad Decimal(10,3): granel acepta fracciones; unidades enteras.
//  - esServicio: no valida ni descuenta stock (ni kardex).
//  - el apartado SIEMPRE exige cliente registrado (a crédito/tarjeta o no).
// ============================================================

export class ApartadoError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ApartadoError";
    this.status = status;
  }
}

function generarFolioApartado(): string {
  return `APT-${fechaFolio()}-${sufijoFolio()}`;
}

export interface ApartadoLineaInput {
  codigoItem: string;
  cantidad: number;
}

export interface ApartadoInput {
  items: ApartadoLineaInput[];
  idCliente: string;
  /** Anticipo inicial que el cliente deja en la caja (0 es válido). */
  anticipo: number;
  /** Método con el que se recibe el anticipo: EFECTIVO o cualquier digital. */
  metodoAnticipo?: string;
  notas?: string | null;
}

export interface ApartadoContext {
  idUsuario: string;
  idCaja: string | null;
  /** Tasa de IVA del negocio en porcentaje (ej. 16). Default: 16. */
  ivaRate?: number;
  /** true = los precios de lista ya incluyen impuestos. */
  preciosIncluyenIva?: boolean;
}

export interface ApartadoResult {
  folio: string;
  subtotal: number;
  iva: number;
  total: number;
  anticipo: number;
  saldoPendiente: number;
  items: Array<{
    codigoItem: string;
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    subtotalLinea: number;
    esServicio: boolean;
  }>;
}

type Tx = Prisma.TransactionClient;

export async function crearApartado(
  tx: Tx,
  input: ApartadoInput,
  ctx: ApartadoContext
): Promise<ApartadoResult> {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new ApartadoError("El carrito está vacío");
  }

  const idCliente = String(input.idCliente ?? "").trim();
  if (!idCliente) {
    throw new ApartadoError("Selecciona el cliente al que se le hará el apartado");
  }
  const cliente = await tx.cliente.findUnique({
    where: { idCliente },
    select: { idCliente: true },
  });
  if (!cliente) {
    throw new ApartadoError("Cliente no encontrado", 404);
  }

  const anticipo = round2(Number(input.anticipo) || 0);

  // Validación de stock y totales (mismas reglas que executeSale).
  let subtotal = 0;
  const lineas: Array<{
    codigoItem: string;
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    subtotalLinea: number;
    esServicio: boolean;
    tasaIva: number;
    tasaIeps: number;
    ivaLinea: number;
    iepsLinea: number;
  }> = [];
  const ivaNegocio = ivaFraccion(ctx.ivaRate) * 100;

  for (const item of input.items) {
    const cantidad = Math.round(Number(item.cantidad) * 1000) / 1000;
    if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 999) {
      throw new ApartadoError(`Cantidad inválida para el producto ${item.codigoItem}`);
    }

    const producto = await tx.producto.findUnique({
      where: claveProducto(item.codigoItem),
    });
    if (!producto || !producto.activo) {
      throw new ApartadoError(`Producto no encontrado: ${item.codigoItem}`, 404);
    }

    const esServicio = producto.esServicio;
    if (!esServicio && !producto.permiteDecimales && !Number.isInteger(cantidad)) {
      throw new ApartadoError(
        `La cantidad de "${producto.descripcion}" debe ser un número entero`
      );
    }
    if (!esServicio && Number(producto.stockActual) < cantidad) {
      throw new ApartadoError(
        `Stock insuficiente para "${producto.descripcion}": disponible ${producto.stockActual}, solicitado ${cantidad}`
      );
    }

    const precio = Number(producto.precioUnitario);
    lineas.push({
      codigoItem: item.codigoItem,
      descripcion: producto.descripcion,
      cantidad,
      precioUnitario: precio,
      subtotalLinea: round2(precio * cantidad),
      esServicio,
      ...tasasProducto(producto, ivaNegocio),
      ivaLinea: 0,
      iepsLinea: 0,
    });
  }

  // Mismo motor fiscal que la venta: el apartado congela los impuestos.
  const fiscal = calcularImpuestos(
    lineas.map((l) => ({ importe: l.subtotalLinea, tasaIva: l.tasaIva, tasaIeps: l.tasaIeps })),
    { preciosIncluyenIva: ctx.preciosIncluyenIva === true }
  );
  fiscal.lineas.forEach((f, i) => {
    lineas[i].subtotalLinea = f.base;
    lineas[i].ivaLinea = f.iva;
    lineas[i].iepsLinea = f.ieps;
  });
  subtotal = fiscal.subtotal;
  const iva = round2(fiscal.iva + fiscal.ieps);
  const total = fiscal.total;
  if (anticipo < 0 || anticipo > total) {
    throw new ApartadoError(
      `El anticipo debe estar entre $0 y el total del apartado ($${total})`
    );
  }

  // Bloqueo si la caja indicada no está ABIERTA (misma defensa que la venta).
  if (ctx.idCaja) {
    const sesion = await tx.sesionCaja.findUnique({
      where: { idCaja: ctx.idCaja },
      select: { estado: true },
    });
    if (!sesion || sesion.estado !== "ABIERTA") {
      throw new ApartadoError(
        "La caja está en proceso de cierre; no se pueden crear apartados",
        409
      );
    }
  }

  const folio = generarFolioApartado();

  const apartado = await tx.apartado.create({
    data: {
      folio,
      idCliente,
      idCaja: ctx.idCaja ?? undefined,
      anticipo,
      total,
      estado: "PENDIENTE",
      notas: input.notas ?? undefined,
      idUsuario: ctx.idUsuario,
    },
  });

  for (const l of lineas) {
    await tx.apartadoLinea.create({
      data: {
        idApartado: apartado.idApartado,
        codigoItem: l.codigoItem,
        cantidad: l.cantidad,
        precioMomento: l.precioUnitario,
        descuentoLinea: 0,
        subtotalLinea: l.subtotalLinea,
        tasaIva: l.tasaIva,
        ivaLinea: l.ivaLinea,
        iepsLinea: l.iepsLinea,
      },
    });
  }

  // Reserva física de stock + kardex SALIDA (los servicios no tocan inventario).
  for (const l of lineas) {
    if (l.esServicio) continue;
    // UPDATE condicionado: la reserva no puede sobregirar el stock.
    const r = await tx.producto.updateMany({
      where: { codigoItem: l.codigoItem, stockActual: { gte: l.cantidad } },
      data: { stockActual: { decrement: l.cantidad } },
    });
    if (r.count === 0) {
      throw new ApartadoError(
        `Stock insuficiente para "${l.descripcion}": otra operación tomó la existencia`,
        409
      );
    }
  }
  await registrarMovimientosKardex(
    tx,
    lineas
      .filter((l) => !l.esServicio)
      .map((l) => ({
        codigoItem: l.codigoItem,
        tipo: "SALIDA",
        cantidad: l.cantidad,
        motivo: `Apartado ${folio}`,
        idUsuario: ctx.idUsuario,
      }))
  );

  // El anticipo ingresa a la caja como efectivo o digital.
  if (anticipo > 0 && ctx.idCaja) {
    const campo =
      input.metodoAnticipo === "EFECTIVO" ? "totalVentasEfectivo" : "totalVentasDigital";
    await tx.sesionCaja.update({
      where: { idCaja: ctx.idCaja },
      data: { [campo]: { increment: anticipo } },
    });
  }

  await tx.bitacoraLog.create({
    data: {
      idUsuario: ctx.idUsuario,
      accion: `Apartado ${folio} creado por $${total} (anticipo $${anticipo})`,
      moduloSistema: "PUNTO_VENTA",
      jsonPayload: {
        folio,
        idCliente,
        subtotal,
        iva,
        total,
        anticipo,
        saldoPendiente: round2(total - anticipo),
        numItems: lineas.length,
      },
    },
  });

  return {
    folio,
    subtotal,
    iva,
    total,
    anticipo,
    saldoPendiente: round2(total - anticipo),
    items: lineas,
  };
}