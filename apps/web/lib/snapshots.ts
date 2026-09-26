// ============================================================
// Snapshots de seguridad (Fase 1 — Resiliencia).
//
// Factory Reset NO destructivo: en lugar de un DELETE CASCADE se
// captura la configuración actual + totales operativos en
// `SnapshotSeguridad` y se reinicia el SetupWizard a PENDIENTE.
// Todas las funciones reciben el cliente Prisma (o un mock) como
// parámetro para poder probarse en aislamiento (Vitest).
// ============================================================

export const CONFIG_ID = 1;
export const MOTIVO_REINICIO = "Reinicio de fábrica (factory reset)";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface SnapshotTotalCaja {
  idCaja: string;
  estado: string;
  totalVentasEfectivo: number;
  totalVentasDigital: number;
  totalRecargas: number;
  totalEgresos: number;
  horaApertura: string | null;
  horaCierre: string | null;
}

export interface SnapshotVentasTotales {
  conteo: number;
  subtotal: number;
  iva: number;
  totalNeto: number;
}

export interface SnapshotJson {
  fecha: string;
  configuracion: {
    nombreNegocio: string;
    tipoNegocio: string;
    moneda: string;
    ivaRate: number;
    featureFlags: JsonValue;
    metodosPago: JsonValue;
    politicaStockOffline: string;
    logo: string | null;
    temaBase: string;
    colorAcento: string;
    datosBancarios: JsonValue | null;
    usarImagenesProductos: boolean;
    mensajeTicket: string | null;
    anchoTicket: string;
    vistaDefectoPOS: string;
    datosFiscales: JsonValue | null;
    configVersion: number;
    setupPendiente: boolean;
  };
  totales: {
    ventas: SnapshotVentasTotales;
    sesionCaja: SnapshotTotalCaja[];
  };
}

/** Normaliza un Decimal de Prisma (o número) a number para el JSON. */
function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : fallback;
}

/** Construye el blob JSON del snapshot a partir de las filas crudas. */
export function buildResetJson(
  configRow: any,
  sesiones: any[],
  ventasAgg: any
): SnapshotJson {
  const totales = {
    conteo: Number(ventasAgg?._count ?? 0),
    subtotal: toNumber(ventasAgg?._sum?.subtotal),
    iva: toNumber(ventasAgg?._sum?.iva),
    totalNeto: toNumber(ventasAgg?._sum?.totalNeto),
  };

  return {
    fecha: new Date().toISOString(),
    configuracion: {
      nombreNegocio: configRow?.nombreNegocio ?? "Mi Negocio",
      tipoNegocio: configRow?.tipoNegocio ?? "PAPELERIA_RETAIL",
      moneda: configRow?.moneda ?? "MXN",
      ivaRate: toNumber(configRow?.ivaRate, 16),
      featureFlags: configRow?.featureFlags ?? {},
      metodosPago: configRow?.metodosPago ?? [],
      politicaStockOffline: configRow?.politicaStockOffline ?? "PERMITIR_NEGATIVO",
      logo: configRow?.logo ?? null,
      temaBase: configRow?.temaBase ?? "NEON",
      colorAcento: configRow?.colorAcento ?? "#10b981",
      datosBancarios: configRow?.datosBancarios ?? null,
      usarImagenesProductos: configRow?.usarImagenesProductos !== false,
      mensajeTicket: configRow?.mensajeTicket ?? null,
      anchoTicket: configRow?.anchoTicket ?? "80mm",
      vistaDefectoPOS: configRow?.vistaDefectoPOS ?? "ESCANER",
      datosFiscales: configRow?.datosFiscales ?? null,
      configVersion: Number(configRow?.configVersion ?? 1),
      setupPendiente: Boolean(configRow?.setupPendiente ?? true),
    },
    totales: {
      ventas: totales,
      sesionCaja: (sesiones ?? []).map((s) => ({
        idCaja: s.idCaja,
        estado: s.estado,
        totalVentasEfectivo: toNumber(s.totalVentasEfectivo),
        totalVentasDigital: toNumber(s.totalVentasDigital),
        totalRecargas: toNumber(s.totalRecargas),
        totalEgresos: toNumber(s.totalEgresos),
        horaApertura: s.horaApertura ? new Date(s.horaApertura).toISOString() : null,
        horaCierre: s.horaCierre ? new Date(s.horaCierre).toISOString() : null,
      })),
    },
  };
}

interface SnapshotDb {
  configuracionNegocio: { findUnique: (args: any) => Promise<any> };
  sesionCaja: { findMany: (args?: any) => Promise<any[]> };
  venta: { aggregate: (args: any) => Promise<any> };
}

/**
 * Lee el estado actual (configuración + totales de ventas y cajas) y lo
 * convierte en el JSON que se guardará como snapshot.
 */
export async function captureSnapshotState(db: SnapshotDb): Promise<SnapshotJson> {
  const [configRow, sesiones, ventasAgg] = await Promise.all([
    db.configuracionNegocio.findUnique({ where: { id: CONFIG_ID } }),
    db.sesionCaja.findMany({
      orderBy: { horaApertura: "desc" },
      take: 50,
      select: {
        idCaja: true,
        estado: true,
        totalVentasEfectivo: true,
        totalVentasDigital: true,
        totalRecargas: true,
        totalEgresos: true,
        horaApertura: true,
        horaCierre: true,
      },
    }),
    db.venta.aggregate({
      _count: true,
      _sum: { subtotal: true, iva: true, totalNeto: true },
    }),
  ]);

  return buildResetJson(configRow, sesiones, ventasAgg);
}

interface ResetTx {
  snapshotSeguridad: { create: (args: any) => Promise<any> };
  configuracionNegocio: {
    findUnique: (args: any) => Promise<any>;
    update: (args: any) => Promise<any>;
  };
  sesionCaja: { findMany: (args?: any) => Promise<any[]> };
  venta: { aggregate: (args: any) => Promise<any> };
  bitacoraLog: { create: (args: any) => Promise<any> };
}

export interface ResetInput {
  motivo: string;
  idUsuario: string;
}

/**
 * Factory reset NO destructivo: guarda el snapshot y reinicia el wizard.
 * NO elimina productos/ventas: solo deja la plantilla en PENDIENTE.
 */
export async function resetNegocio(tx: ResetTx, input: ResetInput) {
  const [datosJson, proximaVersion] = await Promise.all([
    captureSnapshotState(tx),
    tx.configuracionNegocio
      .findUnique({ where: { id: CONFIG_ID } })
      .then((r) => r?.configVersion ?? 0),
  ]);

  const snapshot = await tx.snapshotSeguridad.create({
    data: {
      datosJson,
      motivo: input.motivo,
      idUsuario: input.idUsuario,
    },
  });

  await tx.configuracionNegocio.update({
    where: { id: CONFIG_ID },
    data: {
      setupPendiente: true,
      configVersion: proximaVersion + 1,
    },
  });

  await tx.bitacoraLog.create({
    data: {
      idUsuario: input.idUsuario,
      accion: `Reinicio de sistema: snapshot ${snapshot.id} creado`,
      moduloSistema: "SETUP",
      jsonPayload: { snapshotId: snapshot.id, motivo: input.motivo },
    },
  });

  return snapshot.id;
}

interface RestoreTx {
  snapshotSeguridad: { findUnique: (args: any) => Promise<any> };
  configuracionNegocio: {
    findUnique: (args: any) => Promise<any>;
    update: (args: any) => Promise<any>;
  };
  bitacoraLog: { create: (args: any) => Promise<any> };
}

export interface RestoreInput {
  id: string;
  idUsuario: string;
}

export class SnapshotError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * Restaura la configuración guardada en un snapshot. Solo toca la fila de
 * config (nunca facturas/sesiones): los totales quedan como registro.
 */
export async function restoreFromSnapshot(tx: RestoreTx, input: RestoreInput) {
  const [row, configRow] = await Promise.all([
    tx.snapshotSeguridad.findUnique({ where: { id: input.id } }),
    tx.configuracionNegocio.findUnique({ where: { id: CONFIG_ID } }),
  ]);
  if (!row) {
    throw new SnapshotError("Snapshot no encontrado", 404);
  }

  const snap = row.datosJson as SnapshotJson & Record<string, unknown>;
  const cfg = snap.configuracion;
  if (!cfg || typeof cfg !== "object") {
    throw new SnapshotError("El snapshot no contiene una configuración válida");
  }

  const proximaVersion = configRow?.configVersion ?? 0;

  await tx.configuracionNegocio.update({
    where: { id: CONFIG_ID },
    data: {
      nombreNegocio: String(cfg.nombreNegocio ?? "Mi Negocio"),
      tipoNegocio: cfg.tipoNegocio as any,
      moneda: String(cfg.moneda ?? "MXN"),
      ivaRate: cfg.ivaRate,
      featureFlags: cfg.featureFlags as any,
      metodosPago: cfg.metodosPago as any,
      politicaStockOffline: (cfg.politicaStockOffline as any) ?? "PERMITIR_NEGATIVO",
      logo: cfg.logo ?? null,
      temaBase: cfg.temaBase ?? "NEON",
      colorAcento: cfg.colorAcento ?? "#10b981",
      datosBancarios: (cfg.datosBancarios && typeof cfg.datosBancarios === "object"
        ? cfg.datosBancarios
        : {}) as any,
      usarImagenesProductos: cfg.usarImagenesProductos !== false,
      mensajeTicket: cfg.mensajeTicket ?? null,
      anchoTicket: cfg.anchoTicket ?? "80mm",
      vistaDefectoPOS: cfg.vistaDefectoPOS ?? "ESCANER",
      datosFiscales:
        cfg.datosFiscales && typeof cfg.datosFiscales === "object" ? cfg.datosFiscales : null,
      setupPendiente: false,
      configVersion: proximaVersion + 1,
      updatedById: input.idUsuario,
    },
  });

  await tx.bitacoraLog.create({
    data: {
      idUsuario: input.idUsuario,
      accion: `Configuración restaurada desde snapshot ${input.id}`,
      moduloSistema: "CONFIGURACION",
      jsonPayload: { snapshotId: input.id, fecha: snap.fecha },
    },
  });

  return { id: input.id, configVersion: proximaVersion + 1 };
}

interface DeleteTx {
  snapshotSeguridad: { delete: (args: { where: { id: string } }) => Promise<any> };
  bitacoraLog: { create: (args: any) => Promise<any> };
}

export interface DeleteSnapshotInput {
  id: string;
  idUsuario: string;
}

/**
 * Elimina un snapshot del historial (limpieza opcional de la BD).
 * Acción administrativa: se registra en bitácora con el id eliminado.
 */
export async function deleteSnapshot(tx: DeleteTx, input: DeleteSnapshotInput) {
  try {
    await tx.snapshotSeguridad.delete({ where: { id: input.id } });
  } catch {
    throw new SnapshotError("Snapshot no encontrado", 404);
  }

  await tx.bitacoraLog.create({
    data: {
      idUsuario: input.idUsuario,
      accion: `Snapshot eliminado del historial ${input.id}`,
      moduloSistema: "CONFIGURACION",
      jsonPayload: { snapshotId: input.id },
    },
  });
}