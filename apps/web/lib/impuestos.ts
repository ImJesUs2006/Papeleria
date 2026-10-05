// ============================================================
// Motor de impuestos (puro: lo usan servidor y cliente).
//
// Cada producto puede llevar su propia tasa de IVA (16, 8, 0), estar
// exento, y además causar IEPS. Si no define tasa, hereda la del negocio.
// El negocio decide si sus precios de lista YA incluyen impuestos
// (`preciosIncluyenIva`, lo usual en mostrador) o si se suman al cobrar.
//
// Los impuestos se calculan por GRUPO de tasa y luego se reparten entre
// las líneas, de modo que:
//   - con una sola tasa el resultado es idéntico al cálculo por ticket;
//   - la suma de las líneas cuadra al centavo con los totales;
//   - con precios que incluyen impuestos, el total es exactamente la suma
//     de los precios de lista (el cliente paga lo que dice la etiqueta).
// El IVA se causa sobre la base MÁS el IEPS.
// ============================================================

export interface TasasLinea {
  /** IVA en porcentaje (0 para tasa cero o exento). */
  tasaIva: number;
  /** IEPS en porcentaje (0 si no aplica). */
  tasaIeps: number;
}

export interface LineaFiscalInput extends TasasLinea {
  /** Importe de la línea a precio de lista (precio × cantidad), 2 decimales. */
  importe: number;
}

export interface LineaFiscal extends TasasLinea {
  /** Base gravable (sin impuestos). */
  base: number;
  ieps: number;
  iva: number;
  /** Lo que paga el cliente por la línea. */
  total: number;
}

export interface ResumenFiscal {
  lineas: LineaFiscal[];
  subtotal: number;
  ieps: number;
  iva: number;
  total: number;
}

const aCentavos = (n: number) => Math.round(n * 100);
const dePesos = (c: number) => c / 100;

const pct = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
};

/**
 * Tasas efectivas de un producto: exento ⇒ IVA 0; sin tasa propia ⇒ la del
 * negocio. `ivaNegocio` es porcentaje (ej. 16).
 */
export function tasasProducto(
  producto: { tasaIva?: unknown; exentoIva?: boolean | null; tasaIeps?: unknown },
  ivaNegocio: number
): TasasLinea {
  const negocio = pct(ivaNegocio) ?? 16;
  return {
    tasaIva: producto.exentoIva === true ? 0 : pct(producto.tasaIva) ?? negocio,
    tasaIeps: pct(producto.tasaIeps) ?? 0,
  };
}

/** Reparte `total` (centavos) proporcional a `pesos`, cuadrando al centavo. */
function repartir(total: number, pesos: number[]): number[] {
  const suma = pesos.reduce((a, b) => a + b, 0);
  if (suma <= 0) return pesos.map(() => 0);
  const exactos = pesos.map((p) => (total * p) / suma);
  const partes = exactos.map(Math.floor);
  let resto = total - partes.reduce((a, b) => a + b, 0);
  const orden = exactos
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; resto > 0 && k < orden.length; k++, resto--) partes[orden[k].i]++;
  return partes;
}

export function calcularImpuestos(
  lineas: LineaFiscalInput[],
  opts: { preciosIncluyenIva: boolean }
): ResumenFiscal {
  const out: LineaFiscal[] = lineas.map((l) => ({
    tasaIva: l.tasaIva,
    tasaIeps: l.tasaIeps,
    base: 0,
    ieps: 0,
    iva: 0,
    total: 0,
  }));

  const grupos = new Map<string, number[]>();
  lineas.forEach((l, i) => {
    const k = `${l.tasaIva}|${l.tasaIeps}`;
    grupos.set(k, [...(grupos.get(k) ?? []), i]);
  });

  for (const indices of grupos.values()) {
    const { tasaIva, tasaIeps } = lineas[indices[0]];
    const fIva = tasaIva / 100;
    const fIeps = tasaIeps / 100;
    const importes = indices.map((i) => aCentavos(lineas[i].importe));
    const importeGrupo = importes.reduce((a, b) => a + b, 0);

    let bases: number[];
    let iepsLineas: number[];
    let ivaLineas: number[];

    if (opts.preciosIncluyenIva) {
      // El precio de lista ya trae impuestos: se desglosa hacia atrás.
      const baseGrupo = Math.round(importeGrupo / ((1 + fIeps) * (1 + fIva)));
      const iepsGrupo = Math.round(baseGrupo * fIeps);
      bases = repartir(baseGrupo, importes);
      iepsLineas = repartir(iepsGrupo, importes);
      ivaLineas = importes.map((imp, k) => imp - bases[k] - iepsLineas[k]);
    } else {
      // El precio de lista es la base: los impuestos se suman.
      bases = importes;
      const iepsGrupo = Math.round(importeGrupo * fIeps);
      const ivaGrupo = Math.round((importeGrupo + iepsGrupo) * fIva);
      iepsLineas = repartir(iepsGrupo, importes);
      ivaLineas = repartir(ivaGrupo, importes);
    }

    indices.forEach((i, k) => {
      out[i].base = dePesos(bases[k]);
      out[i].ieps = dePesos(iepsLineas[k]);
      out[i].iva = dePesos(ivaLineas[k]);
      out[i].total = dePesos(bases[k] + iepsLineas[k] + ivaLineas[k]);
    });
  }

  const sumar = (campo: "base" | "ieps" | "iva" | "total") =>
    dePesos(out.reduce((a, l) => a + aCentavos(l[campo]), 0));

  return {
    lineas: out,
    subtotal: sumar("base"),
    ieps: sumar("ieps"),
    iva: sumar("iva"),
    total: sumar("total"),
  };
}
