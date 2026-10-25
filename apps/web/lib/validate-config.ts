import { z } from "zod";
import { validarCurp, validarRfc } from "./validacion";
import { CLAVES_REGIMEN, CLAVES_USO } from "./sat-catalogos";
import {
  TIPO_NEGOCIO,
  METODOS_PAGO_DISPONIBLES,
  VALID_FLAG_KEYS,
  TEMAS_BASE,
  ANCHOS_TICKET,
  VISTAS_POS,
  DEFAULT_TEMA_BASE,
  DEFAULT_COLOR_ACENTO,
  DEFAULT_USAR_CADUCIDAD,
  DEFAULT_USAR_UBICACIONES,
  DEFAULT_REQUERIR_FONDO_INICIAL,
  DEFAULT_PUNTOS_CONFIG,
  type AnchoTicket,
  type TemaBase,
  type VistaPOS,
  type PuntosConfig,
} from "@/lib/business-types";

const FEATURE_FLAGS_SCHEMA = z.object(
  Object.fromEntries(
    // `.default(false)`: los flags nuevos (p. ej. Fase 12) NO pueden romper
    // clientes viejoso configs guardadas que aún no los envían.
    VALID_FLAG_KEYS.map((k) => [k, z.boolean().default(false)])
  ) as Record<string, z.ZodDefault<z.ZodBoolean>>
);

// Logo de marca blanca: data URI de imagen (base64) o URL http(s), máx 1 MB.
const LOGO_MAX_CHARS = 1_000_000;
const LOGO_SCHEMA = z
  .string()
  .max(LOGO_MAX_CHARS, "El logo excede el límite de 1 MB")
  .refine(
    (v) => v === "" || v.startsWith("data:image/") || /^https?:\/\//i.test(v),
    "El logo debe ser un data URI de imagen o una URL http(s)"
  );

// Datos bancarios del negocio para cobros por transferencia (Blindaje Financiero).
const STRING_OPCIONAL = z.string().trim().max(60).optional();
const DATOS_BANCARIOS_SCHEMA = z
  .object({
    banco: STRING_OPCIONAL,
    titular: STRING_OPCIONAL,
    clabe: z.string().trim().max(22).optional(),
    cuenta: STRING_OPCIONAL,
  })
  .strict();

// ============================================================
// Validaciones SAT (Fase 11): RFC, CURP, catálogos de Régimen
// Fiscal / Uso de CFDI y dirección fragmentada. El negocio puede
// guardar datos fiscales incompletos, pero cuando un campo se
// llena debe cumplir el formato oficial para emitir CFDI.
// ============================================================
// RFC y CURP: estructura, fecha real y dígito verificador en lib/validacion.

// Catálogo del SAT de Clave de Régimen Fiscal (sat.gob.mx).
export const CLAVES_REGIMEN_FISCAL = CLAVES_REGIMEN as readonly string[];

/**
 * Catálogo del SAT de Uso de CFDI (códigos de 3 caracteres).
 * Exportado para que la emisión de facturas (Fase 12) reutilice EXACTAMENTE
 * la misma lista que valida la configuración: una sola fuente de verdad.
 */
export const CLAVES_USO_CFDI = CLAVES_USO as readonly string[];

/** Extrae el código SAT (ej. "601" de "601 - General de Ley Personas Morales"). */
function codigoSat(valor: string): string {
  const primerToken = valor.trim().split(/\s+/)[0];
  if (/^CP\d{2}$/i.test(primerToken)) return "CP01";
  return primerToken.toUpperCase();
}

/** Campo opcional de catálogo SAT: acepta el código o "código - descripción". */
function catSat(cat: readonly string[], mensaje: string) {
  return z
    .string()
    .trim()
    .max(80)
    .optional()
    .refine(
      (v) => !v || (cat as readonly string[]).includes(codigoSat(v)),
      mensaje
    );
}

const TEXTO_DIRECCION = (campo: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `${campo} excede los ${max} caracteres`)
    .optional();

const NUM_EXTERIOR = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9-]{1,10}$/, "Número exterior inválido (ej: 12, 12A, S/N)")
  .optional();

const CPDIRECCION = z
  .string()
  .trim()
  .regex(/^\d{5}$/, "Código postal inválido (5 dígitos)")
  .optional();

// Programa de fidelización (Fase 12): tasa de ganancia de puntos y valor de
// cada punto al pagar. Con defaults: un cliente viejo no los rompe.
const PUNTOS_CONFIG_SCHEMA = z
  .object({
    // Peso mínimo gastado para ganar 1 punto (ej. 100 → 1 punto por $100).
    pesosCompraPorPunto: z
      .number()
      .min(1, "La compra mínima por punto debe ser al menos $1")
      .max(100000, "La compra mínima por punto no puede superar $100,000")
      .default(DEFAULT_PUNTOS_CONFIG.pesosCompraPorPunto),
    // Cuánto cubre 1 punto al pagar (ej. 1 → cada punto vale $1).
    valorPuntoPesos: z
      .number()
      .min(0.01, "El valor del punto debe ser positivo")
      .max(10000, "El valor del punto no puede superar $10,000")
      .default(DEFAULT_PUNTOS_CONFIG.valorPuntoPesos),
  })
  .strict();

// Datos fiscales para la emisión de comprobantes (módulo Facturación).
const DATOS_FISCALES_SCHEMA = z
  .object({
    rfc: z
      .string()
      .trim()
      .max(13, "RFC inválido (máx 13 caracteres)")
      .optional()
      .superRefine((v, ctx) => {
        if (!v) return;
        const r = validarRfc(v);
        if (!r.ok) ctx.addIssue({ code: z.ZodIssueCode.custom, message: r.error });
      }),
    razonSocial: TEXTO_DIRECCION("Razón social", 120),
    curp: z
      .string()
      .trim()
      .max(18)
      .optional()
      .superRefine((v, ctx) => {
        if (!v) return;
        const r = validarCurp(v);
        if (!r.ok) ctx.addIssue({ code: z.ZodIssueCode.custom, message: r.error });
      }),
    regimenFiscal: catSat(
      CLAVES_REGIMEN_FISCAL,
      "Régimen fiscal inválido (usa una clave del catálogo SAT: 601, 612, 626, …)"
    ),
    usoCFDI: catSat(
      CLAVES_USO_CFDI,
      "Uso de CFDI inválido (usa una clave del catálogo SAT: G03, P01, …)"
    ),
    codigoPostal: CPDIRECCION,
    // Dirección fragmentada (reemplaza el campo libre).
    calle: TEXTO_DIRECCION("Calle", 120),
    numExt: NUM_EXTERIOR,
    numInt: NUM_EXTERIOR,
    colonia: TEXTO_DIRECCION("Colonia", 80),
    municipio: TEXTO_DIRECCION("Municipio", 80),
    estado: TEXTO_DIRECCION("Estado", 60),
    cp: CPDIRECCION,
  })
  .strict();

export const CONFIG_INPUT_SCHEMA = z
  .object({
    nombreNegocio: z.string().trim().min(2).max(80).default("Mi Negocio"),
    tipoNegocio: z.enum(
      Object.keys(TIPO_NEGOCIO) as [
        keyof typeof TIPO_NEGOCIO,
        ...(keyof typeof TIPO_NEGOCIO)[]
      ]
    ),
    moneda: z.string().trim().min(3).max(8).default("MXN"),
    ivaRate: z.number().min(0).max(100).default(16),
    preciosIncluyenIva: z.boolean().default(false),
    descuentoMaxCajera: z.number().min(0).max(100).default(10),
    // Vocabulario / roles / campos del giro (se normaliza y valida al guardar).
    personalizacion: z.record(z.unknown()).nullable().optional(),
    featureFlags: FEATURE_FLAGS_SCHEMA,
    metodosPago: z.array(z.enum(METODOS_PAGO_DISPONIBLES)).min(1),
    politicaStockOffline: z.enum(["PERMITIR_NEGATIVO", "RECHAZAR"]).default("PERMITIR_NEGATIVO"),
    logo: LOGO_SCHEMA.nullable().optional(),
    // Sistema de temas: tema base visual (neon | minimalista | brutalista |
    // corporativo) y color de acento en HEX para botones/acentos.
    temaBase: z
      .enum(Object.keys(TEMAS_BASE) as [TemaBase, ...TemaBase[]])
      .default(DEFAULT_TEMA_BASE),
    colorAcento: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "El color de acento debe ser un HEX (#rrggbb)")
      .default(DEFAULT_COLOR_ACENTO),
    datosBancarios: DATOS_BANCARIOS_SCHEMA.nullable().optional(),
    // Hiper-personalización (Fase de Pulido).
    mensajeTicket: z.string().trim().max(500).nullable().optional(),
    anchoTicket: z
      .enum(ANCHOS_TICKET as unknown as [AnchoTicket, ...AnchoTicket[]])
      .default("80mm"),
    vistaDefectoPOS: z
      .enum(VISTAS_POS as unknown as [VistaPOS, ...VistaPOS[]])
      .default("ESCANER"),
    datosFiscales: DATOS_FISCALES_SCHEMA.nullable().optional(),
    // Programa de fidelización (Fase 12): tasas del Puntos Monedero.
    puntosConfig: PUNTOS_CONFIG_SCHEMA
      .default(DEFAULT_PUNTOS_CONFIG)
      .optional(),
    // Configuración personalizable (Fase 10): el negocio decide si su
    // inventario exige caducidad, si muestra ubicaciones y si la caja
    // solicita fondo inicial. Con default: un cliente viejo no los rompe.
    usarCaducidad: z.boolean().default(DEFAULT_USAR_CADUCIDAD),
    usarUbicaciones: z.boolean().default(DEFAULT_USAR_UBICACIONES),
    requerirFondoInicial: z.boolean().default(DEFAULT_REQUERIR_FONDO_INICIAL),
    diasApartado: z
      .number({ invalid_type_error: "Los días de apartado deben ser un número" })
      .int("Los días de apartado deben ser un número entero")
      .min(1, "Un apartado se guarda al menos 1 día")
      .max(365, "Máximo 365 días de apartado")
      .default(30),
    corteConReferencia: z.boolean().default(false),
    imprimirCorteAuto: z.boolean().default(false),
    diasDevolucion: z
      .number({ invalid_type_error: "Los días para devoluciones deben ser un número" })
      .int("Los días para devoluciones deben ser un número entero")
      .min(1, "El plazo de devolución es de al menos 1 día")
      .max(365, "Máximo 365 días para devoluciones")
      .default(30),
    montoAutorizarDevolucion: z
      .number({ invalid_type_error: "El monto de autorización debe ser un número" })
      .min(0, "El monto de autorización no puede ser negativo")
      .max(9_999_999, "Monto de autorización demasiado grande")
      .nullable()
      .default(null),
  })
  .strict();

export function validateConfigInput(body: unknown):
  | { success: true; data: z.infer<typeof CONFIG_INPUT_SCHEMA> }
  | { success: false; error: string } {
  const result = CONFIG_INPUT_SCHEMA.safeParse(body);
  if (!result.success) {
    return { success: false, error: result.error.issues[0]?.message ?? "Configuración inválida" };
  }
  return { success: true, data: result.data };
}