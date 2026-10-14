import type { Prisma } from "@papeleria/database";
import { claveProducto } from "./tenant-keys";

// ============================================================
// Variantes (Paso 6): un modelo (playera, tornillo) con ejes como talla y
// color. Cada combinación es un PRODUCTO propio —con su código, código de
// barras, existencia y kardex— que comparte `grupoVariante` con el modelo.
// Así todo lo demás (venta, stock por sucursal, reportes) funciona igual.
// ============================================================

type Tx = Prisma.TransactionClient;

export class VarianteError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface EjeVariante {
  nombre: string;
  valores: string[];
}

const MAX_COMBINACIONES = 60;

/** Abreviatura para el código: "Rojo" → "ROJO", "Extra grande" → "EXTRAGRANDE". */
export function sufijoCodigo(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 12);
}

export function validarEjes(raw: unknown): EjeVariante[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 3) {
    throw new VarianteError("Define de 1 a 3 ejes (ej. Talla y Color)");
  }
  return raw.map((e: any) => {
    const nombre = String(e?.nombre ?? "").trim().slice(0, 30);
    const valores = Array.isArray(e?.valores)
      ? [...new Set<string>(e.valores.map((v: unknown) => String(v).trim().slice(0, 30)).filter(Boolean))]
      : [];
    if (nombre.length < 2) throw new VarianteError("Cada eje necesita un nombre (ej. Talla)");
    if (valores.length === 0) throw new VarianteError(`El eje "${nombre}" no tiene valores`);
    if (valores.some((v) => !sufijoCodigo(v))) {
      throw new VarianteError(`Valor inválido en "${nombre}"`);
    }
    return { nombre, valores };
  });
}

/** Producto cartesiano de los ejes: [{Talla:"M", Color:"Rojo"}, …]. */
export function combinaciones(ejes: EjeVariante[]): Array<Record<string, string>> {
  return ejes.reduce<Array<Record<string, string>>>(
    (acc, eje) => acc.flatMap((c) => eje.valores.map((v) => ({ ...c, [eje.nombre]: v }))),
    [{}]
  );
}

/**
 * Crea las variantes que falten de un producto modelo. Copia precios,
 * impuestos, categoría y banderas; arranca sin existencia. Las que ya
 * existen (mismo código) se omiten.
 */
export async function generarVariantes(tx: Tx, codigoModelo: string, rawEjes: unknown) {
  const ejes = validarEjes(rawEjes);
  const combos = combinaciones(ejes);
  if (combos.length > MAX_COMBINACIONES) {
    throw new VarianteError(`Son ${combos.length} combinaciones: el máximo es ${MAX_COMBINACIONES}`);
  }

  const modelo = await tx.producto.findUnique({ where: claveProducto(codigoModelo) });
  if (!modelo || !modelo.activo) throw new VarianteError("Producto modelo no encontrado", 404);
  if (modelo.esServicio) throw new VarianteError("Un servicio no tiene variantes");
  const grupo = modelo.grupoVariante ?? modelo.codigoItem;

  const creadas: string[] = [];
  const omitidas: string[] = [];
  for (const combo of combos) {
    const codigoItem = [modelo.codigoItem, ...ejes.map((e) => sufijoCodigo(combo[e.nombre]))]
      .join("-")
      .slice(0, 40);
    const existe = await tx.producto.findUnique({ where: claveProducto(codigoItem) });
    if (existe) {
      omitidas.push(codigoItem);
      continue;
    }
    await tx.producto.create({
      data: {
        codigoItem,
        descripcion: `${modelo.descripcion} · ${ejes.map((e) => combo[e.nombre]).join(" · ")}`.slice(0, 120),
        precioUnitario: modelo.precioUnitario,
        precioCompra: modelo.precioCompra,
        precioMayoreo: modelo.precioMayoreo,
        tasaIva: modelo.tasaIva,
        exentoIva: modelo.exentoIva,
        tasaIeps: modelo.tasaIeps,
        idCategoria: modelo.idCategoria,
        stockMinimo: modelo.stockMinimo,
        permiteDecimales: modelo.permiteDecimales,
        usaLotes: modelo.usaLotes,
        usaSeries: modelo.usaSeries,
        imagenUrl: modelo.imagenUrl,
        proveedor: modelo.proveedor,
        ...(modelo.atributos ? { atributos: modelo.atributos as Prisma.InputJsonValue } : {}),
        grupoVariante: grupo,
        atributosVariante: combo,
        stockActual: 0,
      },
    });
    creadas.push(codigoItem);
  }
  if (!modelo.grupoVariante) {
    await tx.producto.update({
      where: claveProducto(modelo.codigoItem),
      data: { grupoVariante: grupo },
    });
  }
  return { grupo, creadas, omitidas };
}
