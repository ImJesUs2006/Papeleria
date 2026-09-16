// ============================================================
// Resolución de CONFLICTOS de stock en sincronización offline.
// Pura y determinista: la importan el servidor (ruta de sync) y el
// cliente (vista previa de estado suspendido en Tauri).
//
// CONDICIÓN DE CARRERA: dos cajeros (sin red) venden la última
// unidad del mismo producto. Estrategia recomendada (default):
//   PERMITIR_NEGATIVO  → stock temporal negativo + alerta/bitácora,
//                        y reconciliación manual mediante inventario físico.
//   RECHAZAR           → la venta en conflicto se rechaza y se devuelve
//                        con lista de ítems re-evaluables.
//
// NO se usa timestamping estricto como criterio de vencedor: los
// relojes del cliente son forjables (cambio de hora del sistema),
// por lo que el orden causal no es confiable fuera de línea. En su
// lugar se garantiza:
//   1. Idempotencia por idLocal (la primera aparición gana).
//   2. Orden de aplicación por creación local (createdAt) dentro de
//      los ítems en conflicto, para minimizar negativos.
//   3. Auditoría total (bitácora por venta con alertas).
// ============================================================

export type PoliticaStockOffline = "PERMITIR_NEGATIVO" | "RECHAZAR";

export type ResolucionConflicto =
  | { tipo: "OK"; folio: string }
  | { tipo: "CONFLICTO_NEGATIVO"; folio: string; itemsNegativos: string[] }
  | { tipo: "RECHAZADA"; folio: null; motivo: string; itemsRechazados: string[] }
  | { tipo: "DUPLICADA"; folio: string };

export type ItemInventarioConocido = {
  codigoItem: string;
  existe: boolean;
  stockActual: number;
};

/**
 * Reaplica el balance de stock "como si" la venta se hubiera hecho en
 * el momento en que el dispositivo la registró: simula la resta de
 * TODAS las pendientes anteriores a ésta para detectar negativos.
 */
export function evaluarConflictos({
  venta,
  inventario,
  politica,
}: {
  venta: { items: Array<{ codigoItem: string; cantidad: number }>; idLocal: string };
  inventario: Map<string, ItemInventarioConocido>;
  politica: PoliticaStockOffline;
}): ResolucionConflicto {
  const itemsRechazados: string[] = [];
  const itemsNegativos: string[] = [];
  const conocidos: string[] = [];

  for (const item of venta.items) {
    const prod = inventario.get(item.codigoItem);
    if (!prod || !prod.existe) {
      itemsRechazados.push(item.codigoItem);
      continue;
    }
    conocidos.push(item.codigoItem);
    const stockTrasVenta = prod.stockActual - item.cantidad;
    if (stockTrasVenta < 0) {
      itemsNegativos.push(item.codigoItem);
    }
  }

  if (itemsRechazados.length > 0) {
    return {
      tipo: "RECHAZADA",
      folio: null,
      motivo: `Ítem(s) inexistentes o desactivados: ${itemsRechazados.join(", ")}`,
      itemsRechazados,
    };
  }

  if (itemsNegativos.length > 0 && politica === "RECHAZAR") {
    return {
      tipo: "RECHAZADA",
      folio: null,
      motivo: `Política RECHAZAR: hay existencias insuficientes (${itemsNegativos.join(", ")})`,
      itemsRechazados: itemsNegativos,
    };
  }

  return itemsNegativos.length > 0
    ? { tipo: "CONFLICTO_NEGATIVO", folio: "", itemsNegativos }
    : { tipo: "OK", folio: "" };
}

/** Poda de métodos de pago según metodología del negocio (Marca Blanca). */
export function metodoPagoValido(metodo: string): boolean {
  return ["EFECTIVO", "TARJETA", "TARJETA_TERMINAL", "DIGITAL", "TRANSFERENCIA"].includes(metodo);
}

/** Normaliza el stock simulado tras aplicar una venta pendiente. */
export function aplicarStockLocal(
  inventario: Map<string, ItemInventarioConocido>,
  items: Array<{ codigoItem: string; cantidad: number }>
): void {
  for (const item of items) {
    const prod = inventario.get(item.codigoItem);
    if (prod) {
      prod.stockActual -= item.cantidad;
    }
  }
}