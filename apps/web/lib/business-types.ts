// ============================================================
// Tipos puros de configuración de negocio (seguros para cliente)
// ============================================================

export const TIPO_NEGOCIO = {
  PAPELERIA_RETAIL: "Papelería / Retail",
  ABARROTES: "Abarrotes",
  SERVICIOS: "Servicios",
  MIXTO: "Mixto",
  FERRETERIA: "Ferretería",
  FARMACIA: "Farmacia",
  BOUTIQUE: "Boutique",
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
  "PUNTOS_MONEDERO",
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

/**
 * Datos fiscales para la emisión de comprobantes/CFDI (JSON de configuración).
 * Fase 11 (SAT): RFC/CURP validados, catálogos de Régimen Fiscal y Uso de
 * CFDI, y dirección fragmentada en campos individuales (calle, c.p., etc.).
 */
export interface DatosFiscales {
  rfc?: string;
  razonSocial?: string;
  curp?: string;
  regimenFiscal?: string;
  usoCFDI?: string;
  /** @deprecated reemplazado por `cp` (dirección fragmentada), se conserva por retrocompatibilidad. */
  codigoPostal?: string;
  calle?: string;
  numExt?: string;
  numInt?: string;
  colonia?: string;
  municipio?: string;
  estado?: string;
  cp?: string;
}

/** Anchos de ticket térmico soportados (58mm | 80mm). */
export const ANCHOS_TICKET = ["58mm", "80mm"] as const;
export type AnchoTicket = (typeof ANCHOS_TICKET)[number];

/**
 * Programa de fidelización "Puntos Monedero" (Fase 12).
 * - `pesosCompraPorPunto`: cuánto debe gastar el cliente (MXN) para GANAR 1
 *   punto. Ej. 100 → 1 punto por cada $100 de compra.
 * - `valorPuntoPesos`: cuánto cubre 1 punto al PAGAR una venta. Ej. 1 → cada
 *   punto equivale a $1 MXN.
 */
export interface PuntosConfig {
  pesosCompraPorPunto: number;
  valorPuntoPesos: number;
}

/** Tasa por defecto del monedero: 1 punto por cada $100 y 1 punto = $1. */
export const DEFAULT_PUNTOS_CONFIG: PuntosConfig = {
  pesosCompraPorPunto: 100,
  valorPuntoPesos: 1,
};

/** Vista inicial del POS: lector enfocado o catálogo táctil inmediato. */
export const VISTAS_POS = ["ESCANER", "CATALOGO_TACTIL"] as const;
export type VistaPOS = (typeof VISTAS_POS)[number];

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
  /** Panel de Recargas (telefónicas) en el Control de Caja */
  recargas: boolean;
  /** Imágenes de producto en la nube (Cloudinary) */
  imagenesCloudinary: boolean;
};

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  inventario: true,
  facturacion: false,
  dashboard: true,
  proveedores: false,
  bitacora: true,
  recargas: false,
  imagenesCloudinary: false,
};

export interface BusinessConfig {
  nombreNegocio: string;
  tipoNegocio: TipoNegocio;
  moneda: string;
  ivaRate: number;
  /** true = los precios de lista ya incluyen impuestos (se desglosan en el ticket). */
  preciosIncluyenIva: boolean;
  /** % máximo de descuento manual que una CAJERA aplica sin autorización. */
  descuentoMaxCajera: number;
  /** Vocabulario, nombres de rol y campos de producto del giro. */
  personalizacion: import("./personalizacion").Personalizacion;
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
  // Hiper-personalización (Fase de Pulido) -------------------------------
  // Mensaje opcional que se imprime al final del ticket (políticas, gracias).
  mensajeTicket: string | null;
  // Ancho de papel del ticket térmico: "58mm" | "80mm".
  anchoTicket: AnchoTicket;
  // Vista inicial del POS: "ESCANER" (input enfocado) | "CATALOGO_TACTIL" (grid).
  vistaDefectoPOS: VistaPOS;
  // Datos fiscales (RFC, razón social, régimen y CP) para Facturación.
  datosFiscales: DatosFiscales | null;
  // Programa de fidelización "Puntos Monedero": tasa de ganancia y valor del
  // punto al pagar (los define la administradora en Configuración).
  puntosConfig: PuntosConfig;
  // ---- Configuración Personalizable (Fase 10) ----
  // El negocio decide si su inventario usa fechas de caducidad (farmacias,
  // abarrotes) y/o ubicaciones en estante; y si la caja exige fondo inicial.
  usarCaducidad: boolean;
  usarUbicaciones: boolean;
  requerirFondoInicial: boolean;
  /** Días que se guarda un apartado antes de considerarse vencido. */
  diasApartado: number;
  /** Corte de caja: true = se muestra lo esperado mientras se cuenta. */
  corteConReferencia: boolean;
  /** Días máximos para aceptar una devolución (la administradora puede pasar por alto). */
  diasDevolucion: number;
  /** Devoluciones desde este monto requieren autorización (null = nunca). */
  montoAutorizarDevolucion: number | null;
  configVersion: number;
  setupPendiente: boolean;
}

export const DEFAULT_TEMA_BASE: TemaBase = "NEON";
export const DEFAULT_COLOR_ACENTO = "#10b981";
export const DEFAULT_ANCHO_TICKET: AnchoTicket = "80mm";
export const DEFAULT_VISTA_POS: VistaPOS = "ESCANER";

// Configuración personalizable (Fase 10): la caducidad apagada es la pauta
// (papelería), la ubicación se muestra por defecto y la caja pide fondo.
export const DEFAULT_USAR_CADUCIDAD = false;
export const DEFAULT_USAR_UBICACIONES = true;
export const DEFAULT_REQUERIR_FONDO_INICIAL = true;
export const DEFAULT_DIAS_APARTADO = 30;

/** Para qué sirve cada módulo (Configuración y asistente inicial). */
export const MODULOS_INFO: Record<keyof FeatureFlags, { label: string; desc: string }> = {
  inventario: {
    label: "Inventario",
    desc: "Catálogo, existencias, etiquetas y carga masiva. Apágalo solo si no vendes artículos físicos.",
  },
  facturacion: { label: "Facturación electrónica", desc: "Emisión de comprobantes a partir de las ventas." },
  dashboard: { label: "Dashboard y reportes", desc: "Métricas del día, gráficas y reportes exportables." },
  proveedores: {
    label: "Proveedores y compras",
    desc: "Pedidos a proveedores, recepción de mercancía, costos y cuentas por pagar.",
  },
  bitacora: { label: "Bitácora de auditoría", desc: "Quién hizo qué y cuándo (las acciones se registran siempre)." },
  recargas: { label: "Recargas y servicios", desc: "Panel de recargas telefónicas / pago de servicios en Caja." },
  imagenesCloudinary: {
    label: "Imágenes en la nube",
    desc: "Fotos de producto en Cloudinary (requiere credenciales del servidor).",
  },
};

/**
 * Plantilla por giro (Marca Blanca): módulos, pagos y preferencias con las
 * que arranca cada tipo de negocio. Todo se puede ajustar después en
 * Configuración; "Aplicar plantilla" vuelve a estos valores.
 */
export const PRESETS_POR_NEGOCIO: Record<
  TipoNegocio,
  Pick<
    BusinessConfig,
    | "featureFlags"
    | "metodosPago"
    | "politicaStockOffline"
    | "usarCaducidad"
    | "usarUbicaciones"
  >
> = {
  // Papelería: resurte con proveedores y es común que venda recargas.
  PAPELERIA_RETAIL: {
    featureFlags: { ...DEFAULT_FEATURE_FLAGS, proveedores: true, recargas: true },
    metodosPago: ["EFECTIVO", "TARJETA_TERMINAL", "TRANSFERENCIA"],
    politicaStockOffline: "PERMITIR_NEGATIVO",
    usarCaducidad: false,
    usarUbicaciones: true,
  },
  // Abarrotes: la vigencia de comestibles es crítica; recargas muy comunes.
  ABARROTES: {
    featureFlags: { ...DEFAULT_FEATURE_FLAGS, facturacion: true, proveedores: true, recargas: true },
    metodosPago: ["EFECTIVO", "TARJETA_TERMINAL", "TRANSFERENCIA"],
    politicaStockOffline: "PERMITIR_NEGATIVO",
    usarCaducidad: true,
    usarUbicaciones: true,
  },
  // Servicios: el catálogo sigue disponible (los servicios no llevan
  // existencias), sin proveedores ni ubicaciones.
  SERVICIOS: {
    featureFlags: { ...DEFAULT_FEATURE_FLAGS, facturacion: true },
    metodosPago: ["EFECTIVO", "TARJETA_TERMINAL", "TRANSFERENCIA"],
    politicaStockOffline: "PERMITIR_NEGATIVO",
    usarCaducidad: false,
    usarUbicaciones: false,
  },
  MIXTO: {
    featureFlags: { ...DEFAULT_FEATURE_FLAGS, facturacion: true, proveedores: true, recargas: true },
    metodosPago: ["EFECTIVO", "TARJETA_TERMINAL", "TRANSFERENCIA"],
    politicaStockOffline: "PERMITIR_NEGATIVO",
    usarCaducidad: false,
    usarUbicaciones: true,
  },
  FERRETERIA: {
    featureFlags: { ...DEFAULT_FEATURE_FLAGS, facturacion: true, proveedores: true },
    metodosPago: ["EFECTIVO", "TARJETA_TERMINAL", "TRANSFERENCIA"],
    politicaStockOffline: "PERMITIR_NEGATIVO",
    usarCaducidad: false,
    usarUbicaciones: true,
  },
  // Farmacia: lote/caducidad visibles y nunca vender sin existencia.
  FARMACIA: {
    featureFlags: { ...DEFAULT_FEATURE_FLAGS, facturacion: true, proveedores: true },
    metodosPago: ["EFECTIVO", "TARJETA_TERMINAL", "TRANSFERENCIA"],
    politicaStockOffline: "RECHAZAR",
    usarCaducidad: true,
    usarUbicaciones: true,
  },
  // Boutique: variantes por talla/color; no bloquea una venta si la prenda
  // aún no fue cargada al inventario.
  BOUTIQUE: {
    featureFlags: { ...DEFAULT_FEATURE_FLAGS, facturacion: true, proveedores: true },
    metodosPago: ["EFECTIVO", "TARJETA_TERMINAL", "TRANSFERENCIA"],
    politicaStockOffline: "PERMITIR_NEGATIVO",
    usarCaducidad: false,
    usarUbicaciones: false,
  },
};

export const VALID_FLAG_KEYS = Object.keys(DEFAULT_FEATURE_FLAGS) as Array<
  keyof FeatureFlags
>;