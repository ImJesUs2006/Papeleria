import { z } from "zod";
import {
  zDinero,
  zDineroOpcional,
  zEmailOpcional,
  zEntero,
  zTelefonoOpcional,
  zTexto,
  zTextoOpcional,
} from "./validacion";

// ============================================================
// Esquemas de entrada por entidad (servidor y formularios). Usan las
// piezas de lib/validacion para que un mismo dato se valide igual en
// todos lados.
// ============================================================

export const PROVEEDOR_SCHEMA = z.object({
  nombre: zTexto("El nombre del proveedor", 120, 2),
  telefono: zTelefonoOpcional.optional(),
  email: zEmailOpcional.optional(),
  direccion: zTextoOpcional("La dirección", 200).optional(),
  contacto: zTextoOpcional("El nombre del contacto", 120).optional(),
  limiteCredito: zDineroOpcional("El límite de crédito").optional(),
  diasCredito: zEntero("Los días de crédito", 0, 365).optional(),
  activo: z.boolean().optional(),
});

/** Edición: todos los campos son opcionales, pero los enviados se validan igual. */
export const PROVEEDOR_PATCH_SCHEMA = PROVEEDOR_SCHEMA.partial();

const FECHA_DIA = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (usa AAAA-MM-DD)")
  .transform((v) => {
    const [a, m, d] = v.split("-").map(Number);
    return new Date(a, m - 1, d, 12);
  })
  .refine((d) => !isNaN(d.getTime()), "Fecha inválida");

export const PEDIDO_SCHEMA = z
  .object({
    idProveedor: z.string({ required_error: "Debes seleccionar un proveedor" }).min(1, "Debes seleccionar un proveedor"),
    fechaEntrega: z.preprocess((v) => (v === "" || v == null ? undefined : v), FECHA_DIA.optional()),
    notas: zTextoOpcional("Las notas", 500).optional(),
    condicionPago: z.enum(["CONTADO", "CREDITO"]).default("CONTADO"),
    items: z
      .array(
        z.object({
          codigoItem: zTexto("El código del producto", 40),
          cantidad: zEntero("La cantidad", 1, 100_000),
          precioCotizado: zDinero("El precio cotizado"),
        }),
        { required_error: "El pedido debe tener al menos un producto" }
      )
      .min(1, "El pedido debe tener al menos un producto")
      .max(300, "Máximo 300 productos por pedido"),
  })
  .superRefine((p, ctx) => {
    const vistos = new Set<string>();
    p.items.forEach((it, i) => {
      const clave = it.codigoItem;
      if (vistos.has(clave)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items", i, "codigoItem"],
          message: `El producto ${it.codigoItem} está repetido en el pedido`,
        });
      }
      vistos.add(clave);
    });
  });
