import { z } from "zod";
import {
  TIPO_NEGOCIO,
  METODOS_PAGO_DISPONIBLES,
  VALID_FLAG_KEYS,
} from "@/lib/business-types";

const FEATURE_FLAGS_SCHEMA = z.object(
  Object.fromEntries(
    VALID_FLAG_KEYS.map((k) => [k, z.boolean()])
  ) as Record<string, z.ZodBoolean>
);

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