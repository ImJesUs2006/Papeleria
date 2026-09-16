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

export const METODOS_PAGO_DISPONIBLES = [
  "EFECTIVO",
  "TARJETA_TERMINAL",
  "TRANSFERENCIA",
] as const;

export type MetodoPagoConfig = (typeof METODOS_PAGO_DISPONIBLES)[number];

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
  configVersion: number;
  setupPendiente: boolean;
}

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