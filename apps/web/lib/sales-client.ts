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
import { totalesCarrito } from "@/store/cart";

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
  metodoPago: string;
  nombreCliente: string | null;
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
  /** Fase 12: cobra el precio de mayoreo cuando el producto lo tiene. */
  esMayoreo?: boolean;
  idUsuario: string;
  nombreUsuario: string;
}): Promise<ResultadoVenta> {
  const body = {
    items: items.map((i) => ({ codigoItem: i.codigoItem, cantidad: i.cantidad })),
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
            precioUnitario: numeroSeguro(i.precioUnitario),
            importe: numeroSeguro(i.cantidad * i.precioUnitario),
          })),
      subtotal: numeroSeguro(data.subtotal),
      iva: numeroSeguro(data.iva),
      ieps: numeroSeguro(data.ieps),
      metodoPago: data.metodoPago ?? extra.metodoPago,
      nombreCliente: data.nombreCliente ?? null,
      fechaHora: data.fechaHora ?? new Date().toISOString(),
    };
  } catch (e) {
    // Sin red (o 5xx transitorio) → modo offline. 4xx NO se encolan.
    const status = (e as any)?.status;
    if (status && status >= 400 && status < 500) throw e;

    // Monedero: los puntos NO se pueden encolar offline: no existe un
    // idCliente verificado ni un saldo de puntos que el sync pueda validar.
    if (extra.metodoPago === "PUNTOS_MONEDERO") {
      throw new Error(
        "Pago con puntos: requiere conexión para validar el saldo del cliente"
      );
    }

    // Mismo motor fiscal que el servidor (que de todos modos recalcula al
    // sincronizar): IVA por producto, IEPS y precios con impuestos incluidos.
    const fiscal = totalesCarrito(
      items.map((i) => ({
        ...i,
        subtotalLinea: numeroSeguro(i.cantidad) * numeroSeguro(i.precioUnitario),
      }))
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
        precioMomento: i.precioUnitario,
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
        precioUnitario: numeroSeguro(i.precioUnitario),
        importe: numeroSeguro(i.cantidad * i.precioUnitario),
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