import type { DatosFiscales } from "./business-types";
import { z } from "zod";
import { validarRfc } from "./validacion";

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
  .transform((v) => (v ? v.toUpperCase().replace(/[\s-]/g, "") : null))
  // Estructura, fecha real y dígito verificador (lib/validacion).
  .superRefine((v, ctx) => {
    if (!v) return;
    const r = validarRfc(v);
    if (!r.ok) ctx.addIssue({ code: z.ZodIssueCode.custom, message: r.error });
  });

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

// ---- Fase E: cliente (columnas de la BD) ⇄ editor fiscal compartido con el negocio ----

export interface ClienteFiscal {
  rfc?: string | null;
  razonSocial?: string | null;
  regimenFiscal?: string | null;
  usoCfdi?: string | null;
  codigoPostalFiscal?: string | null;
  calle?: string | null;
  numExt?: string | null;
  numInt?: string | null;
  colonia?: string | null;
  municipio?: string | null;
  estado?: string | null;
}

export function clienteADatosFiscales(c: ClienteFiscal): DatosFiscales {
  const v = (x: string | null | undefined) => x || undefined;
  return {
    rfc: v(c.rfc),
    razonSocial: v(c.razonSocial),
    regimenFiscal: v(c.regimenFiscal),
    usoCFDI: v(c.usoCfdi),
    cp: v(c.codigoPostalFiscal),
    calle: v(c.calle),
    numExt: v(c.numExt),
    numInt: v(c.numInt),
    colonia: v(c.colonia),
    municipio: v(c.municipio),
    estado: v(c.estado),
  };
}

export function datosFiscalesACliente(d: DatosFiscales): Required<ClienteFiscal> {
  const v = (x: string | undefined) => x?.trim() || null;
  return {
    rfc: v(d.rfc)?.toUpperCase() ?? null,
    razonSocial: v(d.razonSocial),
    regimenFiscal: v(d.regimenFiscal),
    usoCfdi: v(d.usoCFDI),
    codigoPostalFiscal: v(d.cp),
    calle: v(d.calle),
    numExt: v(d.numExt),
    numInt: v(d.numInt),
    colonia: v(d.colonia),
    municipio: v(d.municipio),
    estado: v(d.estado),
  };
}

/** Errores del esquema del cliente → claves del editor. */
export function erroresClienteAEditor(campos: Record<string, string>): Partial<Record<keyof DatosFiscales, string>> {
  const mapa: Record<string, keyof DatosFiscales> = { usoCfdi: "usoCFDI", codigoPostalFiscal: "cp" };
  const out: Partial<Record<keyof DatosFiscales, string>> = {};
  for (const [k, msg] of Object.entries(campos)) out[(mapa[k] ?? k) as keyof DatosFiscales] = msg;
  return out;
}
