import { prisma } from "@papeleria/database";
import type { Prisma } from "@papeleria/database";
import type { BusinessConfig, DatosBancarios, FeatureFlags, TemaBase } from "@/lib/business-types";
import {
  DEFAULT_FEATURE_FLAGS,
  TEMAS_BASE,
  DEFAULT_TEMA_BASE,
  DEFAULT_COLOR_ACENTO,
} from "@/lib/business-types";
import { buildSignedConfig } from "@/lib/config-signing";

// ============================================================
// Feature Flags con autoridad SERVIDOR.
// requireFeature() se ejecuta en CADA endpoint protegido:
// aunque una cajera manipule el almacenamiento local, el cargo
// queda denegado a nivel API cuando hay conexión.
// ============================================================

const CONFIG_ID = 1;

function normalizeFlags(raw: Prisma.JsonValue | null): FeatureFlags {
  const flags = DEFAULT_FEATURE_FLAGS;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return flags;
  const obj = raw as Record<string, unknown>;
  return {
    inventario: obj.inventario === true,
    facturacion: obj.facturacion === true,
    dashboard: obj.dashboard === true,
    proveedores: obj.proveedores === true,
    bitacora: obj.bitacora === true,
  };
}

function normalizeMetodosPago(raw: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (m): m is string =>
      typeof m === "string" &&
      ["EFECTIVO", "TARJETA_TERMINAL", "TRANSFERENCIA", "CREDITO_TIENDA"].includes(m)
  );
}

/** Normaliza datosBancarios a un objeto tipado (filtra tipos no deseados). */
function normalizeDatosBancarios(raw: Prisma.JsonValue | null): DatosBancarios | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const pick = (k: string) => (typeof obj[k] === "string" ? String(obj[k]) : undefined);
  return { banco: pick("banco"), titular: pick("titular"), clabe: pick("clabe"), cuenta: pick("cuenta") };
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
      configVersion: 1,
      setupPendiente: true,
    };
  }

  const temaRaw = String(row.temaBase ?? "").toUpperCase() as TemaBase;

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