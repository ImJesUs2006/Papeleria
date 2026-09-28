import { z } from "zod";

export const TIPO_IMPRESION_OPCIONES = ["BLANCO_NEGRO", "COLOR", "PLOTTER"] as const;
export type TipoImpresion = (typeof TIPO_IMPRESION_OPCIONES)[number];

/**
 * Limpia texto proveniente del usuario para prevenir XSS almacenado.
 * Elimina etiquetas HTML, ángulos sueltos y caracteres de control.
 * La UI además escapa por defecto (React), esto es defensa en profundidad.
 */
export function sanitizeText(input: string): string {
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const textoOpcional = (max: number) =>
  z.string().trim().max(max, `Máximo ${max} caracteres`).nullable().optional();

const precioSchema = (campo: string) =>
  z
    .number({ invalid_type_error: `${campo} inválido` })
    .min(0, `El ${campo.toLowerCase()} no puede ser negativo`)
    .max(9_999_999, `${campo} demasiado alto`)
    .refine((v) => Number.isFinite(v), { message: `${campo} inválido` });

const enteroSchema = (campo: string) =>
  z
    .number({ invalid_type_error: `${campo} inválido` })
    .int(`El ${campo.toLowerCase()} debe ser un número entero`)
    .min(0, `El ${campo.toLowerCase()} no puede ser negativo`)
    .max(1_000_000, `${campo} demasiado alto`);

/**
 * Cantidad de stock. Permite fracciones para productos a granel
 * (permiteDecimales), exactamente 3 decimales como limita la BD.
 */
const stockSchema = (campo: string) =>
  z
    .number({ invalid_type_error: `${campo} inválido` })
    .min(0, `El ${campo.toLowerCase()} no puede ser negativo`)
    .max(1_000_000, `${campo} demasiado alto`)
    .refine((v) => Number.isFinite(v), { message: `${campo} inválido` })
    .refine((v) => Math.round(v * 1000) / 1000 === v, {
      message: `El ${campo.toLowerCase()} admite hasta 3 decimales`,
    });

const BASE_PRODUCTO = z.object({
  codigoItem: z
    .string()
    .trim()
    .min(1, "El código es obligatorio")
    .max(40, "Máximo 40 caracteres")
    .regex(/^[A-Za-z0-9._-]+$/, "Solo letras, números, punto, guion y guion bajo"),
  descripcion: z
    .string()
    .trim()
    .min(2, "Mínimo 2 caracteres")
    .max(120, "Máximo 120 caracteres"),
  precioUnitario: precioSchema("Precio de venta"),
  precioCompra: precioSchema("Precio de compra").nullable().optional(),
  stockActual: stockSchema("Stock actual").default(0),
  stockMinimo: stockSchema("Stock mínimo").default(5),
  // Granel (permiteDecimales) y servicios no son exclusivos: un servicio
  // puede vender fracciones de tiempo; un producto a granel jamás es servicio.
  permiteDecimales: z.boolean().optional(),
  esServicio: z.boolean().optional(),
  // Categoría opcional (Fase 10); se valida contra la BD al crear/editar.
  idCategoria: z.string().trim().max(40).nullable().optional(),
  codigoBarras: textoOpcional(64),
  ubicacionEstante: textoOpcional(60),
  proveedor: textoOpcional(120),
  tipoImpresion: z.enum(TIPO_IMPRESION_OPCIONES).nullable().optional(),
  // Configuración personalizable (Fase 10): caducidad opcional por producto.
  fechaCaducidad: z
    .string()
    .trim()
    .max(10, "Fecha de caducidad inválida")
    .optional()
    .or(z.literal(""))
    .or(z.null()),
});

const ventaMayorOIgualCompra = (d: {
  precioUnitario?: number;
  precioCompra?: number | null;
}) => d.precioCompra == null || d.precioUnitario == null || d.precioUnitario >= d.precioCompra;

const caducidadValida = (v?: string | null) => {
  if (v == null || v === "") return true;
  const fecha = new Date(v);
  return !isNaN(fecha.getTime());
};

const reglasProducto = (d: {
  precioUnitario?: number;
  precioCompra?: number | null;
  fechaCaducidad?: string | null;
}) =>
  ventaMayorOIgualCompra(d) &&
  caducidadValida(d.fechaCaducidad ?? null);

export const PRODUCTO_INPUT_SCHEMA = BASE_PRODUCTO.refine(ventaMayorOIgualCompra, {
  message: "El precio de venta no puede ser menor al de compra",
  path: ["precioUnitario"],
}).refine((d) => caducidadValida(d.fechaCaducidad ?? null), {
  message: "Fecha de caducidad inválida",
  path: ["fechaCaducidad"],
});

export const PRODUCTO_PATCH_SCHEMA = BASE_PRODUCTO.partial().refine(ventaMayorOIgualCompra, {
  message: "El precio de venta no puede ser menor al de compra",
  path: ["precioUnitario"],
}).refine((d) => caducidadValida(d.fechaCaducidad ?? null), {
  message: "Fecha de caducidad inválida",
  path: ["fechaCaducidad"],
});

/** Normaliza "yyyy-mm-dd" (o vacío/null) a un Date para la BD. */
export function normalizarFechaCaducidad(
  v?: string | null
): Date | null {
  if (v == null || v === "") return null;
  const fecha = new Date(v);
  if (isNaN(fecha.getTime())) return null;
  return fecha;
}

export type ProductoInput = z.infer<typeof PRODUCTO_INPUT_SCHEMA>;

export function validateProductoInput(
  body: unknown
): { success: true; data: ProductoInput } | { success: false; error: string } {
  const result = PRODUCTO_INPUT_SCHEMA.safeParse(body);
  if (!result.success) {
    return { success: false, error: result.error.issues[0]?.message ?? "Producto inválido" };
  }
  return { success: true, data: result.data };
}
