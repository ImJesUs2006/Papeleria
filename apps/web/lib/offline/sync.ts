// ============================================================
// Orquestador de sincronización CLIENTE (Tauri/Web offline).
// Encolado → reintento (backoff) → POST /api/ventas/sync.
// ============================================================
import {
  obtenerVentasPendientes,
  marcarVentaComo,
  contarVentasPendientes,
  type VentaOffline,
} from "@/lib/offline/idb";

const MAX_INTENTOS = 5;
const SLEEP_MS = [0, 2_000, 5_000, 15_000, 45_000];

export async function flushSyncQueue(opts?: { signal?: AbortSignal }): Promise<{
  sincronizadas: number;
  rechazadas: number;
  errores: string[];
}> {
  const pendientes = await obtenerVentasPendientes();
  if (pendientes.length === 0) return { sincronizadas: 0, rechazadas: 0, errores: [] };

  const res = await fetch("/api/ventas/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dispositivoId: obtenerDispositivoId(),
      ventas: pendientes.map((v) => serializarVenta(v)),
    }),
    signal: opts?.signal,
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      return { sincronizadas: 0, rechazadas: 0, errores: ["Sesión no válida para sincronizar"] };
    }
    throw new Error(`Sync ${res.status}`);
  }

  const resultado = await res.json();
  const errores: string[] = [];

  for (const item of resultado.resultados ?? []) {
    if (item.estado === "aplicada" || item.estado === "duplicada") {
      await marcarVentaComo(item.idLocal, "SINCRONIZADA", item.folio);
    } else {
      await marcarVentaComo(item.idLocal, "RECHAZADA", undefined, item.error);
      errores.push(`${item.idLocal}: ${item.error}`);
    }
  }

  return {
    sincronizadas: (resultado.resultados ?? []).filter(
      (r: any) => r.estado === "aplicada" || r.estado === "duplicada"
    ).length,
    rechazadas: (resultado.resultados ?? []).filter((r: any) => r.estado === "rechazada").length,
    errores,
  };
}

export async function sincronizarConReintentos(): Promise<{
  sincronizadas: number;
  rechazadas: number;
  pendientes: number;
}> {
  const total = await contarVentasPendientes();
  if (total === 0) return { sincronizadas: 0, rechazadas: 0, pendientes: 0 };

  for (let intento = 0; intento < MAX_INTENTOS; intento++) {
    try {
      const r = await flushSyncQueue();
      return {
        sincronizadas: r.sincronizadas,
        rechazadas: r.rechazadas,
        pendientes: await contarVentasPendientes(),
      };
    } catch (e) {
      await new Promise((r) => setTimeout(r, SLEEP_MS[intento] ?? 60_000));
    }
  }
  return { sincronizadas: 0, rechazadas: 0, pendientes: await contarVentasPendientes() };
}

function serializarVenta(v: VentaOffline) {
  return {
    idLocal: v.idLocal,
    fechaHoraCliente: v.fechaHoraCliente,
    dispositivoId: v.dispositivoId,
    idUsuario: v.idUsuario,
    nombreUsuario: v.nombreUsuario,
    items: v.items,
    metodoPago: v.metodoPago,
    tipoVenta: v.tipoVenta,
    subtotal: v.subtotal,
    iva: v.iva,
    totalNeto: v.totalNeto,
    montoRecibido: v.montoRecibido ?? null,
  };
}

let cachedDevId: string | null = null;
export function obtenerDispositivoId(): string {
  if (cachedDevId) return cachedDevId;
  try {
    let id = localStorage.getItem("papeleria-dispositivo");
    if (!id) {
      id = `dev-${crypto.randomUUID()}`;
      localStorage.setItem("papeleria-dispositivo", id);
    }
    cachedDevId = id;
    return id;
  } catch {
    return `dev-${Math.random().toString(36).slice(2, 10)}`;
  }
}