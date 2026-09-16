// ============================================================
// Capa de persistencia IndexedDB para operación offline (Tauri).
// Almacenes:
//   ventas:       ventas hechas sin conexión (cola de sync)
//   config-cache: replica firmada de ConfiguracionNegocio
// ============================================================
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export interface VentaOffline {
  idLocal: string;
  fechaHoraCliente: string;
  dispositivoId: string;
  idUsuario: string;
  nombreUsuario: string;
  items: Array<{ codigoItem: string; cantidad: number; precioMomento: number }>;
  metodoPago: "EFECTIVO" | "TARJETA" | "DIGITAL" | "TRANSFERENCIA";
  tipoVenta: "PAPELERIA" | "RECARGA";
  subtotal: number;
  iva: number;
  totalNeto: number;
  montoRecibido?: number | null;
  intentos: number;
  ultimoError?: string;
  folioVentaServer?: string;
  estado: "PENDIENTE" | "SINCRONIZADA" | "RECHAZADA";
  createdAt: string;
}

interface PapeleriaDB extends DBSchema {
  ventas: {
    key: string;
    value: VentaOffline;
    indexes: { "por-estado": string; "por-fecha": string };
  };
  config: {
    key: string;
    value: { key: string; config: unknown; firma: string; guardadaEn: string };
  };
}

let dbPromise: Promise<IDBPDatabase<PapeleriaDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<PapeleriaDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PapeleriaDB>("papeleria-offline", 1, {
      upgrade(db) {
        const ventas = db.createObjectStore("ventas", { keyPath: "idLocal" });
        ventas.createIndex("por-estado", "estado");
        ventas.createIndex("por-fecha", "createdAt");
        db.createObjectStore("config", { keyPath: "key" });
      },
    });
  }
  return dbPromise;
}

export async function guardarVentaOffline(venta: VentaOffline): Promise<void> {
  const db = await getDB();
  await db.put("ventas", venta);
}

export async function obtenerVentasPendientes(): Promise<VentaOffline[]> {
  const db = await getDB();
  const todas = await db.getAllFromIndex("ventas", "por-estado", "PENDIENTE");
  return todas.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function obtenerTodasVentasOffline(): Promise<VentaOffline[]> {
  const db = await getDB();
  return db.getAll("ventas");
}

export async function marcarVentaComo(
  idLocal: string,
  estado: VentaOffline["estado"],
  folio?: string,
  error?: string
): Promise<void> {
  const db = await getDB();
  const actual = await db.get("ventas", idLocal);
  if (!actual) return;
  await db.put("ventas", {
    ...actual,
    estado,
    folioVentaServer: folio,
    ultimoError: error,
    intentos: actual.intentos + 1,
  });
}

export async function contarVentasPendientes(): Promise<number> {
  const db = await getDB();
  return (await db.getAllKeysFromIndex("ventas", "por-estado", "PENDIENTE")).length;
}

export async function guardarConfigCache(
  key: string,
  value: { config: unknown; firma: string; guardadaEn: string }
): Promise<void> {
  const db = await getDB();
  await db.put("config", { key, ...value });
}

export async function limpiarDbOffline(): Promise<void> {
  const db = await getDB();
  await db.clear("ventas");
}