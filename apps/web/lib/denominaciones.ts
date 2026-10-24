// ============================================================
// Conteo de caja por denominaciones (puro: pantalla y servidor).
// La cajera escribe cuántas piezas hay de cada billete y moneda; el total
// se calcula solo. El servidor recalcula el total a partir del conteo, así
// que el efectivo declarado siempre coincide con las piezas capturadas.
// ============================================================

export interface Denominacion {
  clave: string;
  valor: number;
  tipo: "billete" | "moneda";
  etiqueta: string;
}

/** Peso mexicano: billetes y monedas en circulación. */
export const DENOMINACIONES_MXN: Denominacion[] = [
  { clave: "b1000", valor: 1000, tipo: "billete", etiqueta: "$1,000" },
  { clave: "b500", valor: 500, tipo: "billete", etiqueta: "$500" },
  { clave: "b200", valor: 200, tipo: "billete", etiqueta: "$200" },
  { clave: "b100", valor: 100, tipo: "billete", etiqueta: "$100" },
  { clave: "b50", valor: 50, tipo: "billete", etiqueta: "$50" },
  { clave: "b20", valor: 20, tipo: "billete", etiqueta: "$20" },
  { clave: "m20", valor: 20, tipo: "moneda", etiqueta: "$20" },
  { clave: "m10", valor: 10, tipo: "moneda", etiqueta: "$10" },
  { clave: "m5", valor: 5, tipo: "moneda", etiqueta: "$5" },
  { clave: "m2", valor: 2, tipo: "moneda", etiqueta: "$2" },
  { clave: "m1", valor: 1, tipo: "moneda", etiqueta: "$1" },
  { clave: "m050", valor: 0.5, tipo: "moneda", etiqueta: "50¢" },
];

export type ConteoDenominaciones = Record<string, number>;

const r2 = (n: number) => Math.round(n * 100) / 100;

export class ConteoError extends Error {}

/** Valida el conteo: solo denominaciones conocidas y piezas enteras ≥ 0. */
export function validarConteo(raw: unknown): ConteoDenominaciones {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ConteoError("Conteo de billetes y monedas inválido");
  }
  const salida: ConteoDenominaciones = {};
  for (const [clave, valor] of Object.entries(raw as Record<string, unknown>)) {
    const d = DENOMINACIONES_MXN.find((x) => x.clave === clave);
    if (!d) throw new ConteoError(`Denominación desconocida: ${clave}`);
    if (valor === "" || valor == null) continue;
    const piezas = Number(valor);
    if (!Number.isInteger(piezas) || piezas < 0 || piezas > 100_000) {
      throw new ConteoError(`${d.tipo === "billete" ? "Billetes" : "Monedas"} de ${d.etiqueta}: escribe un número entero de piezas`);
    }
    if (piezas > 0) salida[clave] = piezas;
  }
  return salida;
}

/** Total en pesos de un conteo. */
export function totalConteo(conteo: ConteoDenominaciones): number {
  let total = 0;
  for (const d of DENOMINACIONES_MXN) total += (conteo[d.clave] ?? 0) * d.valor;
  return r2(total);
}

/**
 * Explica una diferencia del arqueo en palabras.
 * `faltante` positivo = falta dinero; negativo = sobra.
 */
export function explicarDiferencia(faltante: number, rubro: string): { texto: string; tono: "ok" | "falta" | "sobra" } {
  const f = r2(faltante);
  if (Math.abs(f) < 0.01) return { texto: `${rubro}: cuadra`, tono: "ok" };
  const monto = `$${Math.abs(f).toFixed(2)}`;
  return f > 0
    ? { texto: `${rubro}: faltan ${monto}`, tono: "falta" }
    : { texto: `${rubro}: sobran ${monto}`, tono: "sobra" };
}
