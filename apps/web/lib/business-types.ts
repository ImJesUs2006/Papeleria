// ============================================================
// Tipos puros de configuración de negocio (seguros para cliente)
// ============================================================

export const TIPO_NEGOCIO = {
  PAPELERIA_RETAIL: "Papelería / Retail",
  ABARROTES: "Abarrotes",
  SERVICIOS: "Servicios",
  MIXTO: "Mixto",
} as const;

export type TipoNegocio = keyof typeof TIPO_NEGOCIO;

/**
 * Temas base visuales. `BrandTheme` inyecta `data-theme="<temaBase>"` en
 * `<html>` y las variables CSS semánticas (bg-surface, shadow-card, texto)
 * cambian sus valores nativos según el tema. El `colorAcento` (hex) se
 * mantiene en botones principales en cualquier tema.
 */
export const TEMAS_BASE = {
  NEON: "Neón",
  MINIMALISTA: "Minimalista",
  BRUTALISTA: "Brutalista",
  CORPORATIVO: "Corporativo",
} as const;

export type TemaBase = keyof typeof TEMAS_BASE;

export const METODOS_PAGO_DISPONIBLES = [
  "EFECTIVO",
  "TARJETA_TERMINAL",
  "TRANSFERENCIA",
  "CREDITO_TIENDA",
] as const;

export type MetodoPagoConfig = (typeof METODOS_PAGO_DISPONIBLES)[number];

/**
 * Cuenta de transferencia del negocio (Blindaje Financiero).
 * El POS la muestra en el modal de pago "Transferencia" y exige los
 * últimos 4 dígitos de la referencia/rastreo para cobrar.
 */
export interface DatosBancarios {
  banco?: string;
  titular?: string;
  clabe?: string;
  cuenta?: string;
}

export type FeatureFlags = {
  /** Inventario: productos, stock, etiquetas, carga masiva */
  inventario: boolean;
  /** Facturación electrónica y emisión de comprobantes */
  facturacion: boolean;
  /** Dashboard de métricas */
  dashboard: boolean;
  /** Proveedores y pedidos (cadena de suministro) */
  proveedores: boolean;
  /** Bitácora de auditoría */
  bitacora: boolean;
};

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  inventario: true,
  facturacion: false,
  dashboard: true,
  proveedores: false,
  bitacora: true,
};

export interface BusinessConfig {
  nombreNegocio: string;
  tipoNegocio: TipoNegocio;
  moneda: string;
  ivaRate: number;
  featureFlags: FeatureFlags;
  metodosPago: MetodoPagoConfig[];
  politicaStockOffline: "PERMITIR_NEGATIVO" | "RECHAZAR";
  // Marca Blanca: logo (data URI base64 ≤1 MB o URL) + sistema de temas.
  logo: string | null;
  // Tema base visual: NEON | MINIMALISTA | BRUTALISTA | CORPORATIVO.
  temaBase: TemaBase;
  // Color de acento (hex #rrggbb) para botones principales y acentos.
  colorAcento: string;
  // Blindaje Financiero: cuenta bancaria para cobros por transferencia.
  datosBancarios: DatosBancarios | null;
  configVersion: number;
  setupPendiente: boolean;
}

export const DEFAULT_TEMA_BASE: TemaBase = "NEON";
export const DEFAULT_COLOR_ACENTO = "#10b981";

/** Pre-configuración por tipo de negocio (Marca Blanca). */
export const PRESETS_POR_NEGOCIO: Record<
  TipoNegocio,
  Pick<
    BusinessConfig,
    "featureFlags" | "metodosPago" | "politicaStockOffline"
  >
> = {
  PAPELERIA_RETAIL: {
    featureFlags: { ...DEFAULT_FEATURE_FLAGS },
    metodosPago: ["EFECTIVO", "TARJETA_TERMINAL", "TRANSFERENCIA"],
    politicaStockOffline: "PERMITIR_NEGATIVO",
  },
  ABARROTES: {
    featureFlags: { ...DEFAULT_FEATURE_FLAGS, facturacion: true, proveedores: true },
    metodosPago: ["EFECTIVO", "TARJETA_TERMINAL", "TRANSFERENCIA"],
    politicaStockOffline: "PERMITIR_NEGATIVO",
  },
  SERVICIOS: {
    featureFlags: {
      inventario: false,
      facturacion: true,
      dashboard: true,
      proveedores: false,
      bitacora: true,
    },
    metodosPago: ["TRANSFERENCIA", "TARJETA_TERMINAL"],
    politicaStockOffline: "RECHAZAR",
  },
  MIXTO: {
    featureFlags: {
      inventario: true,
      facturacion: true,
      dashboard: true,
      proveedores: true,
      bitacora: true,
    },
    metodosPago: ["EFECTIVO", "TARJETA_TERMINAL", "TRANSFERENCIA"],
    politicaStockOffline: "PERMITIR_NEGATIVO",
  },
};

export const VALID_FLAG_KEYS = Object.keys(DEFAULT_FEATURE_FLAGS) as Array<
  keyof FeatureFlags
>;