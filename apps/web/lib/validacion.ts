import { z } from "zod";

// ============================================================
// Validación compartida (pantalla y servidor). Un solo lugar define qué
// es un precio, una cantidad, un teléfono, un RFC o una CURP válidos, para
// que ningún formulario ni API acepte datos donde no van.
// ============================================================

/** Quita caracteres de control y espacios repetidos. */
export function limpiarTexto(v: unknown): string {
  return String(v ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** El cuerpo de una petición debe ser un objeto JSON (no null, texto ni arreglo). */
export function esObjetoJson(v: unknown): boolean {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Fecha de un parámetro de consulta; null si viene vacía o no es fecha real.
 * Un día solo ("2026-10-23") es la medianoche LOCAL de ese día: `new Date`
 * lo leería como medianoche UTC (en México, las 18:00 del día anterior).
 */
export function fechaParametro(v: string | null | undefined): Date | null {
  if (!v) return null;
  const dia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  const d = dia ? new Date(Number(dia[1]), Number(dia[2]) - 1, Number(dia[3])) : new Date(v);
  if (dia && (d.getMonth() !== Number(dia[2]) - 1 || d.getDate() !== Number(dia[3]))) return null;
  return Number.isNaN(d.getTime()) ? null : d;
}

// ---------- RFC ----------

const VALOR_RFC = "0123456789ABCDEFGHIJKLMN&OPQRSTUVWXYZ Ñ";

/** RFC genéricos del SAT: público en general y extranjeros. */
export const RFC_GENERICOS = ["XAXX010101000", "XEXX010101000"];

function fechaValida(aammdd: string): boolean {
  const mm = Number(aammdd.slice(2, 4));
  const dd = Number(aammdd.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1) return false;
  // El año no cambia el resultado salvo en febrero: se prueba un bisiesto.
  const diasMes = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mm - 1];
  return dd <= diasMes;
}

/** Dígito verificador del RFC (algoritmo del SAT, módulo 11). */
export function digitoVerificadorRfc(rfcSinDigito: string): string {
  // Persona moral (11 caracteres sin dígito) se alinea con un espacio.
  const base = rfcSinDigito.length === 11 ? ` ${rfcSinDigito}` : rfcSinDigito;
  let suma = 0;
  for (let i = 0; i < 12; i++) {
    const valor = VALOR_RFC.indexOf(base[i]);
    if (valor < 0) return "?";
    suma += valor * (13 - i);
  }
  const resto = suma % 11;
  if (resto === 0) return "0";
  const d = 11 - resto;
  return d === 10 ? "A" : String(d);
}

export type ResultadoValidacion = { ok: true; valor: string } | { ok: false; error: string };

/** RFC de persona física (13) o moral (12): estructura, fecha y dígito verificador. */
export function validarRfc(entrada: unknown): ResultadoValidacion {
  const rfc = limpiarTexto(entrada).toUpperCase().replace(/[\s-]/g, "");
  if (RFC_GENERICOS.includes(rfc)) return { ok: true, valor: rfc };
  if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{2}[0-9A]$/.test(rfc)) {
    return {
      ok: false,
      error: "RFC inválido: 12 caracteres (empresa) o 13 (persona física), p. ej. GODE561231GR8",
    };
  }
  const letras = rfc.length === 13 ? 4 : 3;
  if (!fechaValida(rfc.slice(letras, letras + 6))) {
    return { ok: false, error: "RFC inválido: la fecha que contiene no existe" };
  }
  if (digitoVerificadorRfc(rfc.slice(0, -1)) !== rfc.slice(-1)) {
    return { ok: false, error: "RFC inválido: el último carácter (dígito verificador) no coincide" };
  }
  return { ok: true, valor: rfc };
}

// ---------- CURP ----------

const VALOR_CURP = "0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";
const ESTADOS_CURP =
  "AS|BC|BS|CC|CL|CM|CS|CH|DF|DG|GT|GR|HG|JC|MC|MN|MS|NT|NL|OC|PL|QT|QR|SP|SL|SR|TC|TS|TL|VZ|YN|ZS|NE";

export function digitoVerificadorCurp(curp17: string): string {
  let suma = 0;
  for (let i = 0; i < 17; i++) {
    const valor = VALOR_CURP.indexOf(curp17[i]);
    if (valor < 0) return "?";
    suma += valor * (18 - i);
  }
  return String((10 - (suma % 10)) % 10);
}

/** CURP: 18 caracteres, fecha real, sexo, entidad y dígito verificador. */
export function validarCurp(entrada: unknown): ResultadoValidacion {
  const curp = limpiarTexto(entrada).toUpperCase().replace(/\s/g, "");
  const re = new RegExp(`^[A-Z][AEIOUX][A-Z]{2}\\d{6}[HMX](${ESTADOS_CURP})[B-DF-HJ-NP-TV-Z]{3}[0-9A-Z]\\d$`);
  if (!re.test(curp)) {
    return { ok: false, error: "CURP inválida: deben ser 18 caracteres con el formato oficial" };
  }
  if (!fechaValida(curp.slice(4, 10))) {
    return { ok: false, error: "CURP inválida: la fecha de nacimiento no existe" };
  }
  if (digitoVerificadorCurp(curp.slice(0, 17)) !== curp[17]) {
    return { ok: false, error: "CURP inválida: el dígito verificador no coincide" };
  }
  return { ok: true, valor: curp };
}

// ---------- Contacto ----------

/** Teléfono de México: 10 dígitos (acepta espacios, guiones, paréntesis y +52). */
export function validarTelefono(entrada: unknown): ResultadoValidacion {
  let digitos = String(entrada ?? "").replace(/[\s\-().]/g, "");
  if (digitos.startsWith("+52")) digitos = digitos.slice(3);
  if (!/^\d{10}$/.test(digitos)) {
    return { ok: false, error: "Teléfono inválido: deben ser 10 dígitos" };
  }
  return { ok: true, valor: digitos };
}

export function validarEmail(entrada: unknown): ResultadoValidacion {
  const email = limpiarTexto(entrada).toLowerCase();
  if (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(email)) {
    return { ok: false, error: "Correo electrónico inválido" };
  }
  return { ok: true, valor: email };
}

export function validarCodigoPostal(entrada: unknown): ResultadoValidacion {
  const cp = String(entrada ?? "").trim();
  if (!/^\d{5}$/.test(cp)) return { ok: false, error: "Código postal inválido: deben ser 5 dígitos" };
  return { ok: true, valor: cp };
}

// ---------- Esquemas zod reutilizables ----------

const vacioANull = (v: unknown) => (v === "" || v === undefined ? null : v);

/** Texto obligatorio, sin caracteres de control. */
export const zTexto = (etiqueta: string, max = 120, min = 1) =>
  z.preprocess(
    limpiarTexto,
    z
      .string()
      .min(min, min <= 1 ? `${etiqueta} es obligatorio` : `${etiqueta}: mínimo ${min} caracteres`)
      .max(max, `${etiqueta}: máximo ${max} caracteres`)
  );

/** Texto opcional ("" → null). */
export const zTextoOpcional = (etiqueta: string, max = 200) =>
  z.preprocess(
    (v) => {
      const t = limpiarTexto(v);
      return t === "" ? null : t;
    },
    z.string().max(max, `${etiqueta}: máximo ${max} caracteres`).nullable()
  );

/** Importe en pesos: número ≥ min, a 2 decimales. */
export const zDinero = (etiqueta: string, opciones: { min?: number; max?: number } = {}) => {
  const { min = 0, max = 9_999_999 } = opciones;
  return z.preprocess(
    (v) => (typeof v === "string" ? Number(v.replace(/[$,\s]/g, "")) : v),
    z
      .number({ invalid_type_error: `${etiqueta} debe ser un número` })
      .finite(`${etiqueta} debe ser un número`)
      .min(min, `${etiqueta} no puede ser menor a ${min}`)
      .max(max, `${etiqueta} es demasiado grande`)
      .transform((n) => Math.round(n * 100) / 100)
  );
};

export const zDineroOpcional = (etiqueta: string, opciones: { min?: number; max?: number } = {}) =>
  z.preprocess(vacioANull, zDinero(etiqueta, opciones).nullable());

/** Entero dentro de un rango. */
export const zEntero = (etiqueta: string, min = 0, max = 1_000_000) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v),
    z
      .number({ invalid_type_error: `${etiqueta} debe ser un número entero` })
      .int(`${etiqueta} debe ser un número entero`)
      .min(min, `${etiqueta} no puede ser menor a ${min}`)
      .max(max, `${etiqueta} no puede ser mayor a ${max}`)
  );

const desdeResultado =
  (fn: (v: unknown) => ResultadoValidacion) =>
  (v: unknown, ctx: z.RefinementCtx) => {
    const r = fn(v);
    if (!r.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: r.error });
      return z.NEVER;
    }
    return r.valor;
  };

const opcional = (fn: (v: unknown) => ResultadoValidacion) =>
  z.preprocess(vacioANull, z.unknown().transform((v, ctx) => (v == null ? null : desdeResultado(fn)(v, ctx))));

export const zRfc = z.unknown().transform(desdeResultado(validarRfc));
export const zRfcOpcional = opcional(validarRfc);
export const zCurpOpcional = opcional(validarCurp);
export const zTelefonoOpcional = opcional(validarTelefono);
export const zEmailOpcional = opcional(validarEmail);
export const zCodigoPostal = z.unknown().transform(desdeResultado(validarCodigoPostal));

/**
 * Valida y devuelve el primer error en español (lo que muestra la pantalla)
 * y el detalle por campo.
 */
export function validar<T extends z.ZodTypeAny>(
  esquema: T,
  datos: unknown
): { ok: true; datos: z.output<T> } | { ok: false; error: string; campos: Record<string, string> } {
  const r = esquema.safeParse(datos);
  if (r.success) return { ok: true, datos: r.data };
  const campos: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const clave = issue.path.join(".") || "_";
    if (!campos[clave]) campos[clave] = issue.message;
  }
  return { ok: false, error: r.error.issues[0]?.message ?? "Datos inválidos", campos };
}
