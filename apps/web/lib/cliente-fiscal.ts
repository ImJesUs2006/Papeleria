import { z } from "zod";

// ============================================================
// FASE 12 · Datos fiscales del cliente (para facturación CFDI)
// El RFC se valida con la MISMA expresión que la configuración del
// negocio (`validate-config`), así el padrón y la emisión no se
// contradicen. Ambos son opcionales: un cliente de mostrador existe
// sin ellos, pero no podrá facturarse hasta que los complete.
// ============================================================

export const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

export const RFC_ERROR =
  "RFC inválido (persona física: 13 caracteres; persona moral: 12, sin espacios)";

/** RFC opcional; "" / null se normalizan a null. */
export const RFC_CLIENTE_SCHEMA = z
  .union([z.string().trim().max(13), z.null()])
  .optional()
  .transform((v) => (v ? v.toUpperCase() : null))
  .refine((v) => !v || RFC_REGEX.test(v), RFC_ERROR);

/** Razón social opcional (persona moral). */
export const RAZON_SOCIAL_SCHEMA = z
  .union([z.string().trim().max(120), z.null()])
  .optional()
  .transform((v) => (v || null));

/**
 * Regla de facturación: para emitir CFDI el receptor necesita RFC
 * (persona física) o razón social (persona moral).
 */
export function tieneDatosFiscales(cliente: {
  rfc?: string | null;
  razonSocial?: string | null;
}): boolean {
  return Boolean((cliente.rfc && cliente.rfc.trim()) || (cliente.razonSocial && cliente.razonSocial.trim()));
}