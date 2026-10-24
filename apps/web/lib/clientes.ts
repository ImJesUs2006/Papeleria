import { z } from "zod";
import { CLAVES_REGIMEN, CLAVES_USO, regimenCompatible } from "./sat-catalogos";
import {
  validarCodigoPostal,
  zEmailOpcional,
  zRfcOpcional,
  zTelefonoOpcional,
  zTexto,
  zTextoOpcional,
} from "./validacion";

// ============================================================
// Clientes (Fase B): validación del padrón con datos fiscales del
// receptor (CFDI 4.0), enmascarado de datos sensibles y perfil de compra.
// ============================================================

const opcionalDe = (claves: readonly string[], etiqueta: string) =>
  z.preprocess(
    (v) => (v === "" || v == null ? null : String(v).trim().toUpperCase()),
    z
      .string()
      .nullable()
      .refine((v) => v == null || claves.includes(v), `${etiqueta} inválido: elige uno del catálogo del SAT`)
  );

const cpOpcional = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  z
    .unknown()
    .nullable()
    .transform((v, ctx) => {
      if (v == null) return null;
      const r = validarCodigoPostal(v);
      if (!r.ok) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: r.error });
        return z.NEVER;
      }
      return r.valor;
    })
);

export const CLIENTE_SCHEMA = z
  .object({
    nombre: zTexto("El nombre", 80, 2),
    telefono: zTelefonoOpcional.optional(),
    email: zEmailOpcional.optional(),
    rfc: zRfcOpcional.optional(),
    razonSocial: zTextoOpcional("La razón social", 120).optional(),
    regimenFiscal: opcionalDe(CLAVES_REGIMEN, "Régimen fiscal").optional(),
    codigoPostalFiscal: cpOpcional.optional(),
    usoCfdi: opcionalDe(CLAVES_USO, "Uso de CFDI").optional(),
    notas: zTextoOpcional("Las notas", 500).optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.regimenFiscal && c.rfc && !regimenCompatible(c.regimenFiscal, c.rfc)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["regimenFiscal"],
        message:
          c.rfc.length === 12
            ? "Ese régimen es de persona física y el RFC es de empresa (persona moral)"
            : "Ese régimen es de empresa (persona moral) y el RFC es de persona física",
      });
    }
  });

export const CLIENTE_PATCH_SCHEMA = CLIENTE_SCHEMA.innerType().partial();

/** Lo que el SAT pide del receptor para timbrar (CFDI 4.0). Vacío = completo. */
export function faltantesFiscales(c: {
  rfc?: string | null;
  razonSocial?: string | null;
  regimenFiscal?: string | null;
  codigoPostalFiscal?: string | null;
  usoCfdi?: string | null;
}): string[] {
  const faltan: string[] = [];
  if (!c.rfc) faltan.push("RFC");
  if (!c.razonSocial) faltan.push("Nombre o razón social (como en su constancia fiscal)");
  if (!c.regimenFiscal) faltan.push("Régimen fiscal");
  if (!c.codigoPostalFiscal) faltan.push("Código postal fiscal");
  if (!c.usoCfdi) faltan.push("Uso de CFDI");
  return faltan;
}

// ---------- Enmascarado ----------

const PUNTO = "•";

export const enmascarar = {
  telefono(t: string | null | undefined): string | null {
    if (!t) return null;
    const d = t.replace(/\D/g, "");
    return d.length >= 6 ? `${d.slice(0, 2)}${PUNTO.repeat(d.length - 6)}${d.slice(-4)}` : PUNTO.repeat(d.length);
  },
  email(e: string | null | undefined): string | null {
    if (!e) return null;
    const [usuario, dominio] = e.split("@");
    if (!dominio) return PUNTO.repeat(e.length);
    return `${usuario.slice(0, 2)}${PUNTO.repeat(Math.max(usuario.length - 2, 1))}@${dominio}`;
  },
  rfc(r: string | null | undefined): string | null {
    if (!r) return null;
    return `${r.slice(0, 3)}${PUNTO.repeat(r.length - 6)}${r.slice(-3)}`;
  },
};

// ---------- Perfil de compra ----------

const DIA_MS = 86_400_000;

export interface PerfilCompra {
  visitas: number;
  totalComprado: number;
  ticketPromedio: number;
  ultimaVisita: Date | null;
  /** Días típicos entre compras (mediana); null con menos de 3 compras. */
  frecuenciaDias: number | null;
  proximaVisita: Date | null;
  estado: "NUEVO" | "AL_DIA" | "POR_VOLVER" | "ATRASADO";
}

/**
 * A partir del historial estima cada cuánto compra el cliente y cuándo
 * debería volver (para recordarle surtirse).
 */
export function perfilDeCompra(ventas: Array<{ fechaHora: Date; total: number }>, hoy = new Date()): PerfilCompra {
  const orden = [...ventas].sort((a, b) => a.fechaHora.getTime() - b.fechaHora.getTime());
  const visitas = orden.length;
  const totalComprado = Math.round(orden.reduce((s, v) => s + v.total, 0) * 100) / 100;
  const ultimaVisita = visitas ? orden[visitas - 1].fechaHora : null;
  let frecuenciaDias: number | null = null;
  if (visitas >= 3) {
    const intervalos = orden
      .slice(1)
      .map((v, i) => (v.fechaHora.getTime() - orden[i].fechaHora.getTime()) / DIA_MS)
      .filter((d) => d >= 0.5)
      .sort((a, b) => a - b);
    if (intervalos.length) {
      const m = Math.floor(intervalos.length / 2);
      frecuenciaDias = Math.round(intervalos.length % 2 ? intervalos[m] : (intervalos[m - 1] + intervalos[m]) / 2);
    }
  }
  const proximaVisita =
    ultimaVisita && frecuenciaDias ? new Date(ultimaVisita.getTime() + frecuenciaDias * DIA_MS) : null;
  let estado: PerfilCompra["estado"] = "NUEVO";
  if (proximaVisita && frecuenciaDias) {
    const dias = (proximaVisita.getTime() - hoy.getTime()) / DIA_MS;
    estado = dias < -Math.max(3, frecuenciaDias * 0.5) ? "ATRASADO" : dias <= 3 ? "POR_VOLVER" : "AL_DIA";
  } else if (visitas > 0) {
    estado = "AL_DIA";
  }
  return {
    visitas,
    totalComprado,
    ticketPromedio: visitas ? Math.round((totalComprado / visitas) * 100) / 100 : 0,
    ultimaVisita,
    frecuenciaDias,
    proximaVisita,
    estado,
  };
}
