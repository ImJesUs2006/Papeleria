// ============================================================
// Catálogo offline (Paso 8). El POS descarga el catálogo de su sucursal
// mientras hay red y lo guarda en el dispositivo (IndexedDB). Sin red,
// el escáner, la búsqueda y el catálogo táctil leen de esta copia.
// Precios y stock se re-validan en el servidor al sincronizar.
// ============================================================

export interface ProductoCatalogo {
  codigoItem: string;
  codigoBarras: string | null;
  descripcion: string;
  precioUnitario: number;
  precioMayoreo: number | null;
  /** Precios por volumen (lib/precios). */
  escalasPrecio?: Array<{ desde: number; precio: number; nombre?: string | null }> | null;
  stockActual: number;
  stockMinimo: number;
  permiteDecimales: boolean;
  esServicio: boolean;
  usaSeries: boolean;
  favorito: boolean;
  idCategoria: string | null;
  tasaIva: number | null;
  exentoIva: boolean;
  tasaIeps: number | null;
  imagenUrl: string | null;
}

const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Coincidencia exacta por código o código de barras (lo que manda el escáner). */
export function porCodigo(catalogo: ProductoCatalogo[], codigo: string): ProductoCatalogo | null {
  const c = codigo.trim().toUpperCase();
  return (
    catalogo.find((p) => p.codigoItem.toUpperCase() === c) ??
    catalogo.find((p) => (p.codigoBarras ?? "").toUpperCase() === c) ??
    null
  );
}

/** Búsqueda local: código, código de barras o palabras de la descripción. */
export function buscarEnCatalogo(
  catalogo: ProductoCatalogo[],
  texto: string,
  limite = 30
): ProductoCatalogo[] {
  const exacto = porCodigo(catalogo, texto);
  const palabras = normalizar(texto).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return [];
  const resto = catalogo.filter((p) => {
    if (exacto && p.codigoItem === exacto.codigoItem) return false;
    const heno = normalizar(`${p.codigoItem} ${p.codigoBarras ?? ""} ${p.descripcion}`);
    return palabras.every((w) => heno.includes(w));
  });
  return [...(exacto ? [exacto] : []), ...resto].slice(0, limite);
}

/** Para el catálogo táctil sin red: favoritos primero, luego por nombre. */
export function destacadosDelCatalogo(catalogo: ProductoCatalogo[], limite = 20): ProductoCatalogo[] {
  return [...catalogo]
    .sort((a, b) => Number(b.favorito) - Number(a.favorito) || a.descripcion.localeCompare(b.descripcion))
    .slice(0, limite);
}
