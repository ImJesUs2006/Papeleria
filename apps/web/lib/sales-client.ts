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

export interface ResultadoVenta {
  folioVenta: string;
  totalNeto: number;
  cambio: number | null;
  offline: boolean;
}

const IVA_RATE = 0.16;

export async function registrarVentaClient(items: CartItem[], extra: {
  metodoPago: string;
  tipoVenta: "PAPELERIA" | "RECARGA";
  montoRecibido?: number | null;
  referenciaTransferencia?: string | null;
  idCliente?: string | null;
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
    return {
      folioVenta: data.folioVenta,
      totalNeto: data.totalNeto,
      cambio: data.cambio,
      offline: false,
    };
  } catch (e) {
    // Sin red (o 5xx transitorio) → modo offline. 4xx NO se encolan.
    const status = (e as any)?.status;
    if (status && status >= 400 && status < 500) throw e;

    // CRM: el crédito de tienda NO se puede encolar offline: no existe un
    // idCliente verificado ni caja para que el sync re-liquide la deuda.
    if (extra.metodoPago === "CREDITO_TIENDA") {
      throw new Error(
        "Venta a crédito: requiere conexión para registrar el saldo del cliente"
      );
    }

    const subtotal = items.reduce((s, i) => s + i.cantidad * i.precioUnitario, 0);
    const iva = subtotal * IVA_RATE;
    const totalNeto = Math.round((subtotal + iva) * 100) / 100;
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
      subtotal: Math.round(subtotal * 100) / 100,
      iva: Math.round(iva * 100) / 100,
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

    return { folioVenta: `OF-${idLocal}`, totalNeto, cambio, offline: true };
  }
}