import { prisma } from "@papeleria/database";
import type { Prisma } from "@papeleria/database";
import type {
  BusinessConfig,
  DatosBancarios,
  DatosFiscales,
  FeatureFlags,
  PuntosConfig,
  TemaBase,
} from "@/lib/business-types";
import {
  DEFAULT_FEATURE_FLAGS,
  TEMAS_BASE,
  DEFAULT_TEMA_BASE,
  DEFAULT_COLOR_ACENTO,
  DEFAULT_ANCHO_TICKET,
  DEFAULT_VISTA_POS,
  DEFAULT_USAR_CADUCIDAD,
  DEFAULT_USAR_UBICACIONES,
  DEFAULT_REQUERIR_FONDO_INICIAL,
  DEFAULT_PUNTOS_CONFIG,
} from "@/lib/business-types";
import { buildSignedConfig } from "@/lib/config-signing";

// ============================================================
// Feature Flags con autoridad SERVIDOR.
// requireFeature() se ejecuta en CADA endpoint protegido:
// aunque una cajera manipule el almacenamiento local, el cargo
// queda denegado a nivel API cuando hay conexión.
// ============================================================

const CONFIG_ID = 1;

/**
 * Normaliza flags crudos a una FeatureFlags completa con TODAS las llaves.
 * Solo honra valores booleanos: un JSON parcial (cliente viejo, snapshot
 * antiguo) NO borra los módulos ausentes del estado resultante.
 */
export function normalizeFlags(raw: Prisma.JsonValue | null): FeatureFlags {
  const flags = { ...DEFAULT_FEATURE_FLAGS };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return flags;
  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(flags) as Array<keyof FeatureFlags>) {
    if (typeof obj[key] === "boolean") {
      flags[key] = obj[key];
    }
  }
  return flags;
}

/**
 * Deep merge anti "toggles fantasma": combina los flags PREVIOS con los
 * entrantes, sobrescribiendo SOLO los que llegan como booleano. Un PUT
 * parcial (o un cliente desactualizado que solo manda algunas llaves)
 * jamás borra los demás módulos del estado global (ni el Sidebar).
 */
export function mergeFeatureFlags(
  previous: FeatureFlags,
  incoming: Record<string, unknown>
): FeatureFlags {
  const merged = { ...previous };
  for (const key of Object.keys(merged) as Array<keyof FeatureFlags>) {
    if (typeof incoming[key] === "boolean") {
      merged[key] = incoming[key];
    }
  }
  return merged;
}

function normalizeMetodosPago(raw: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (m): m is string =>
      typeof m === "string" &&
      ["EFECTIVO", "TARJETA_TERMINAL", "TRANSFERENCIA", "PUNTOS_MONEDERO"].includes(m)
  );
}

/** Normaliza la tasa del Puntos Monedero (Fase 12) con valores seguros. */
function normalizePuntosConfig(raw: Prisma.JsonValue | null): PuntosConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_PUNTOS_CONFIG };
  }
  const obj = raw as Record<string, unknown>;
  const pesos =
    typeof obj.pesosCompraPorPunto === "number" && Number.isFinite(obj.pesosCompraPorPunto)
      ? Math.min(Math.max(obj.pesosCompraPorPunto, 1), 100000)
      : DEFAULT_PUNTOS_CONFIG.pesosCompraPorPunto;
  const valor =
    typeof obj.valorPuntoPesos === "number" && Number.isFinite(obj.valorPuntoPesos)
      ? Math.min(Math.max(obj.valorPuntoPesos, 0.01), 10000)
      : DEFAULT_PUNTOS_CONFIG.valorPuntoPesos;
  return { pesosCompraPorPunto: pesos, valorPuntoPesos: valor };
}

/** Normaliza datosBancarios a un objeto tipado (filtra tipos no deseados). */
function normalizeDatosBancarios(raw: Prisma.JsonValue | null): DatosBancarios | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const pick = (k: string) => (typeof obj[k] === "string" ? String(obj[k]) : undefined);
  const out: DatosBancarios = { banco: pick("banco"), titular: pick("titular"), clabe: pick("clabe"), cuenta: pick("cuenta") };
  // JSON descarta `undefined` al transportar: podan los valores ausentes para
  // que la firma firmada == la recibida (evita falso NO_VERIFICADA).
  for (const key of Object.keys(out) as Array<keyof DatosBancarios>) {
    if (out[key] === undefined) delete out[key];
  }
  return out;
}

/** Normaliza datosFiscales a un objeto tipado (Facturación). */
function normalizeDatosFiscales(raw: Prisma.JsonValue | null): DatosFiscales | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const pick = (k: string) => (typeof obj[k] === "string" ? String(obj[k]) : undefined);
  const out: DatosFiscales = {
    rfc: pick("rfc"),
    razonSocial: pick("razonSocial"),
    curp: pick("curp"),
    regimenFiscal: pick("regimenFiscal"),
    usoCFDI: pick("usoCFDI"),
    codigoPostal: pick("codigoPostal"),
    calle: pick("calle"),
    numExt: pick("numExt"),
    numInt: pick("numInt"),
    colonia: pick("colonia"),
    municipio: pick("municipio"),
    estado: pick("estado"),
    cp: pick("cp") || pick("codigoPostal"),
  };
  for (const key of Object.keys(out) as Array<keyof DatosFiscales>) {
    if (out[key] === undefined) delete out[key];
  }
  return out;
}

export async function getBusinessConfig(): Promise<BusinessConfig> {
  const row = await prisma.configuracionNegocio.findUnique({
    where: { id: CONFIG_ID },
  });

  if (!row) {
    return {
      nombreNegocio: "Mi Negocio",
      tipoNegocio: "PAPELERIA_RETAIL",
      moneda: "MXN",
      ivaRate: 16,
      featureFlags: DEFAULT_FEATURE_FLAGS,
      metodosPago: ["EFECTIVO", "TARJETA_TERMINAL", "TRANSFERENCIA"],
      politicaStockOffline: "PERMITIR_NEGATIVO",
      logo: null,
      temaBase: DEFAULT_TEMA_BASE,
      colorAcento: DEFAULT_COLOR_ACENTO,
      datosBancarios: null,
      mensajeTicket: null,
      anchoTicket: DEFAULT_ANCHO_TICKET,
      vistaDefectoPOS: DEFAULT_VISTA_POS,
      datosFiscales: null,
      usarCaducidad: DEFAULT_USAR_CADUCIDAD,
      usarUbicaciones: DEFAULT_USAR_UBICACIONES,
      requerirFondoInicial: DEFAULT_REQUERIR_FONDO_INICIAL,
      puntosConfig: { ...DEFAULT_PUNTOS_CONFIG },
      configVersion: 1,
      setupPendiente: true,
    };
  }

  const temaRaw = String(row.temaBase ?? "").toUpperCase() as TemaBase;
  const anchoRaw = row.anchoTicket as BusinessConfig["anchoTicket"];
  const vistaRaw = row.vistaDefectoPOS as BusinessConfig["vistaDefectoPOS"];

  const base: BusinessConfig = {
    nombreNegocio: row.nombreNegocio,
    tipoNegocio: row.tipoNegocio,
    moneda: row.moneda,
    ivaRate: Number(row.ivaRate),
    featureFlags: normalizeFlags(row.featureFlags),
    metodosPago: normalizeMetodosPago(row.metodosPago) as BusinessConfig["metodosPago"],
    politicaStockOffline: row.politicaStockOffline as BusinessConfig["politicaStockOffline"],
    logo: row.logo ?? null,
    temaBase: temaRaw in TEMAS_BASE ? temaRaw : DEFAULT_TEMA_BASE,
    colorAcento: row.colorAcento || DEFAULT_COLOR_ACENTO,
    datosBancarios: normalizeDatosBancarios(row.datosBancarios),
    mensajeTicket: typeof row.mensajeTicket === "string" && row.mensajeTicket.trim() ? row.mensajeTicket : null,
    anchoTicket: anchoRaw === "58mm" || anchoRaw === "80mm" ? anchoRaw : DEFAULT_ANCHO_TICKET,
    vistaDefectoPOS: vistaRaw === "ESCANER" || vistaRaw === "CATALOGO_TACTIL" ? vistaRaw : DEFAULT_VISTA_POS,
    datosFiscales: normalizeDatosFiscales(row.datosFiscales),
    usarCaducidad:
      typeof row.usarCaducidad === "boolean" ? row.usarCaducidad : DEFAULT_USAR_CADUCIDAD,
    usarUbicaciones:
      typeof row.usarUbicaciones === "boolean" ? row.usarUbicaciones : DEFAULT_USAR_UBICACIONES,
    requerirFondoInicial:
      typeof row.requerirFondoInicial === "boolean"
        ? row.requerirFondoInicial
        : DEFAULT_REQUERIR_FONDO_INICIAL,
    puntosConfig: normalizePuntosConfig(row.puntosConfig),
    configVersion: row.configVersion,
    setupPendiente: row.setupPendiente,
  };

  if (!base.politicaStockOffline || !["PERMITIR_NEGATIVO", "RECHAZAR"].includes(base.politicaStockOffline)) {
    base.politicaStockOffline = "PERMITIR_NEGATIVO";
  }
  return base;
}

export async function isSetupPendiente(): Promise<boolean> {
  const config = await getBusinessConfig();
  return config.setupPendiente;
}

/** Cache firmada para sincronización offline (entrega sessionKey una vez). */
export async function getSignedBusinessConfig() {
  const config = await getBusinessConfig();
  return buildSignedConfig(config);
}

const FLAG_TO_MODULO: Record<string, string> = {
  inventario: "INVENTARIO",
  facturacion: "CAJA",
  dashboard: "REPORTES",
  proveedores: "INVENTARIO",
  bitacora: "BITACORA",
};

/** Middleware de flag: deniega si el módulo no está habilitado en el negocio. */
export async function requireFeature(flag: keyof FeatureFlags) {
  const config = await getBusinessConfig();
  if (!config.featureFlags[flag]) {
    return {
      allowed: false as const,
      error: `El módulo ${FLAG_TO_MODULO[flag]} no está habilitado para este plan/negocio`,
      modulo: FLAG_TO_MODULO[flag],
    };
  }
  return { allowed: true as const };
}

export { CONFIG_ID };