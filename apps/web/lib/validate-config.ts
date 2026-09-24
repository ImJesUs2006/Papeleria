import { z } from "zod";
import {
  TIPO_NEGOCIO,
  METODOS_PAGO_DISPONIBLES,
  VALID_FLAG_KEYS,
  TEMAS_BASE,
  DEFAULT_TEMA_BASE,
  DEFAULT_COLOR_ACENTO,
  type TemaBase,
} from "@/lib/business-types";

const FEATURE_FLAGS_SCHEMA = z.object(
  Object.fromEntries(
    VALID_FLAG_KEYS.map((k) => [k, z.boolean()])
  ) as Record<string, z.ZodBoolean>
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