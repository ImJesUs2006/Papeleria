// ============================================================
// Ejecutor de venta con respaldo OFFLINE.
// 1) Intenta /api/ventas (online).
// 2) Si la red falla → genera idLocal, calcula totales localmente
//    (IVA del negocio) y ENCOLA en IndexedDB para /api/ventas/sync.
//    El stock cae localmente; el servidor resolverá conflictos.
// ============================================================
import { guardarVentaOffline } from "@/lib/offline/idb";
import { obtenerDispositivoId } from "@/lib/offline/sync";
import { obtenerInventarioLocal } from "@/store/inventory";
import type { CartItem } from "@/store/cart";
import { totalesCarrito, useCartStore } from "@/store/cart";
import type { DescuentoManual } from "@/lib/descuentos";

export interface ResultadoLineaVenta {
  codigoItem: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  importe: number;
}

export interface ResultadoVenta {
  folioVenta: string;
  totalNeto: number;
  cambio: number | null;
  offline: boolean;
  /** Datos de ticket (Fase 12): usados por el modal "Venta Exitosa". */
  items: ResultadoLineaVenta[];
  subtotal: number;
  iva: number;
  /** IEPS de la venta (0 si ningún producto lo causa). */
  ieps: number;
  /** Total descontado (promociones + manuales). */
  descuentoTotal?: number;
  /** Partes del pago (venta mixta). */
  pagos?: Array<{ metodo: string; monto: number }>;
  metodoPago: string;
  nombreCliente: string | null;
  /** Puntos ganados con la compra y saldo del cliente (si hubo cliente). */
  puntosGanados?: number;
  puntosCliente?: number | null;
  fechaHora: string;
}

/**
 * Normaliza cualquier valor a número finito. Evita `undefined.toFixed(2)` en el
 * modal de venta exitosa y en el ticket ante respuestas incompletas.
 */
export function numeroSeguro(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

export async function registrarVentaClient(items: CartItem[], extra: {
  metodoPago: string;
  tipoVenta: "PAPELERIA" | "RECARGA";
  montoRecibido?: number | null;
  referenciaTransferencia?: string | null;
  idCliente?: string | null;
  /** Descuento manual al ticket. */
  descuentoTicket?: DescuentoManual | null;
  /** Pago mixto: varias partes que suman el total. */
  pagos?: Array<{ metodo: string; monto: number; referencia?: string | null }> | null;
  /** Autorización de la administradora (descuento sobre el tope). */
  autorizacion?: { username: string; password: string } | null;
  /** Fase 12: cobra el precio de mayoreo cuando el producto lo tiene. */
  esMayoreo?: boolean;
  idUsuario: string;
  nombreUsuario: string;
}): Promise<ResultadoVenta> {
  const body = {
    items: items.map((i) => ({
      codigoItem: i.codigoItem,
      cantidad: i.cantidad,
      ...(i.descuento ? { descuento: i.descuento } : {}),
      ...(i.series?.length ? { series: i.series } : {}),
    })),
    descuentoTicket: extra.descuentoTicket ?? null,
    pagos: extra.pagos ?? null,
    autorizacion: extra.autorizacion ?? null,
    metodoPago: extra.metodoPago,
    tipoVenta: extra.tipoVenta,
    montoRecibido: extra.montoRecibido ?? null,
    referenciaTransferencia: extra.referenciaTransferencia ?? null,
    idCliente: extra.idCliente ?? null,
    esMayoreo: extra.esMayoreo === true,
  };

  try {
    const res = await fetch("/api/ventas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.error || "Error al procesar la venta");
      (err as any).status = res.status;
      (err as any).codigo = data.codigo;
      throw err;
    }
    // El servidor devuelve items para el ticket (Fase 12); si llegara un
    // backend anterior sin ellos, se reconstruyen desde el carrito.
    // OJO: `executeSale` devuelve `subtotalLinea` por línea; aquí se normaliza
    // a `importe` con fallback para que el modal nunca reciba undefined.
    return {
      folioVenta: data.folioVenta,
      totalNeto: numeroSeguro(data.totalNeto),
      cambio: data.cambio == null ? null : numeroSeguro(data.cambio),
      offline: false,
      items: Array.isArray(data.items)
        ? data.items.map((l: any) => ({
            codigoItem: l.codigoItem ?? "",
            descripcion: l.descripcion ?? "",
            cantidad: numeroSeguro(l.cantidad),
            precioUnitario: numeroSeguro(l.precioUnitario),
            importe: numeroSeguro(l.subtotalLinea ?? l.importe),
          }))
        : items.map((i) => ({
            codigoItem: i.codigoItem,
            descripcion: i.descripcion,
            cantidad: numeroSeguro(i.cantidad),
            precioUnitario: precioEfectivo(i),
            importe: numeroSeguro(i.subtotalLinea),
          })),
      subtotal: numeroSeguro(data.subtotal),
      iva: numeroSeguro(data.iva),
      ieps: numeroSeguro(data.ieps),
      descuentoTotal: numeroSeguro(data.descuentoTotal),
      pagos: Array.isArray(data.pagos) ? data.pagos : undefined,
      metodoPago: data.metodoPago ?? extra.metodoPago,
      nombreCliente: data.nombreCliente ?? null,
      puntosGanados: numeroSeguro(data.puntosGanados),
      puntosCliente: data.puntosCliente == null ? null : numeroSeguro(data.puntosCliente),
      fechaHora: data.fechaHora ?? new Date().toISOString(),
    };
  } catch (e) {
    // Sin red (o 5xx transitorio) → modo offline. 4xx NO se encolan.
    const status = (e as any)?.status;
    if (status && status >= 400 && status < 500) throw e;

    // Monedero: los puntos NO se pueden encolar offline: no existe un
    // idCliente verificado ni un saldo de puntos que el sync pueda validar.
    // Descuentos manuales, pagos divididos y autorizaciones necesitan al
    // servidor (tope de la cajera, contraseña de la administradora).
    if (items.some((i) => i.usaSeries)) {
      throw new Error("Sin conexión: los productos con número de serie requieren conexión");
    }
    if (
      items.some((i) => i.descuento) ||
      extra.descuentoTicket ||
      (extra.pagos && extra.pagos.length > 0)
    ) {
      throw new Error(
        "Sin conexión: los descuentos manuales y el pago dividido requieren conexión"
      );
    }
    if (extra.metodoPago === "PUNTOS_MONEDERO") {
      throw new Error(
        "Pago con puntos: requiere conexión para validar el saldo del cliente"
      );
    }

    // Mismo motor fiscal que el servidor (que de todos modos recalcula al
    // sincronizar): IVA por producto, IEPS y precios con impuestos incluidos.
    // Las promociones vigentes sí aplican offline (el servidor las reaplica).
    // El importe de cada línea ya trae el precio efectivo (escala por
    // cantidad o cliente mayorista); `precioUnitario` es el de lista.
    const fiscal = totalesCarrito(
      items.map((i) => ({ ...i, subtotalLinea: numeroSeguro(i.subtotalLinea) })),
      { promociones: useCartStore.getState().promociones }
    );
    const subtotal = fiscal.subtotal;
    const iva = fiscal.iva;
    const totalNeto = fiscal.total;
    const idLocal = `loc-${crypto.randomUUID()}`;

    // Descuento local de stock para reflejo inmediato del inventario.
    const inv = obtenerInventarioLocal();
    inv.descontarStock(items);

    await guardarVentaOffline({
      idLocal,
      fechaHoraCliente: new Date().toISOString(),
      dispositivoId: obtenerDispositivoId(),
      idUsuario: extra.idUsuario,
      nombreUsuario: extra.nombreUsuario,
      items: items.map((i) => ({
        codigoItem: i.codigoItem,
        cantidad: i.cantidad,
        precioMomento: precioEfectivo(i),
      })),
      metodoPago: extra.metodoPago as any,
      tipoVenta: extra.tipoVenta,
referenciaTransferencia: extra.referenciaTransferencia ?? null,
      esMayoreo: extra.esMayoreo === true,
      subtotal: Math.round(subtotal * 100) / 100,
      // La cola offline guarda un solo campo de impuestos (informativo).
      iva: Math.round((iva + fiscal.ieps) * 100) / 100,
      totalNeto,
      montoRecibido: extra.montoRecibido ?? null,
      intentos: 0,
      estado: "PENDIENTE",
      createdAt: new Date().toISOString(),
    });

    const cambio =
      extra.montoRecibido != null
        ? Math.round((extra.montoRecibido - totalNeto) * 100) / 100
        : null;

    return {
      folioVenta: `OF-${idLocal}`,
      totalNeto,
      cambio,
      offline: true,
      items: items.map((i) => ({
        codigoItem: i.codigoItem,
        descripcion: i.descripcion,
        cantidad: numeroSeguro(i.cantidad),
        precioUnitario: precioEfectivo(i),
        importe: numeroSeguro(i.subtotalLinea),
      })),
      subtotal: Math.round(subtotal * 100) / 100,
      iva: Math.round(iva * 100) / 100,
      ieps: fiscal.ieps,
      metodoPago: extra.metodoPago,
      nombreCliente: null,
      fechaHora: new Date().toISOString(),
    };
  }
}

/** Precio unitario que realmente se cobra en la línea (importe ÷ cantidad). */
function precioEfectivo(i: Pick<CartItem, "cantidad" | "subtotalLinea" | "precioUnitario">): number {
  const cantidad = numeroSeguro(i.cantidad);
  return cantidad > 0
    ? Math.round((numeroSeguro(i.subtotalLinea) / cantidad) * 100) / 100
    : numeroSeguro(i.precioUnitario);
}
