import { validarEscalas, type EscalaPrecio } from "./precios";
import { banderasDeTipo, validarUnidadCompra, validarUnidadVenta, type ControlExtra, type ModoVenta } from "./unidades";

// ============================================================
// Carga masiva de productos (Excel / CSV) — puro y probado.
//
// Una sola definición de columnas alimenta tres cosas: el reconocimiento de
// encabezados (con sinónimos), la validación de cada renglón y la plantilla
// descargable con su hoja de instrucciones. Al ACTUALIZAR un producto solo
// se tocan las columnas que vienen en el archivo (antes, una columna ausente
// borraba ese dato en todos los productos).
// ============================================================

export type CampoCarga =
  | "codigoItem"
  | "descripcion"
  | "precioUnitario"
  | "precioCompra"
  | "stockActual"
  | "stockMinimo"
  | "categoria"
  | "seVende"
  | "unidadVenta"
  | "control"
  | "unidadCompra"
  | "piezasPorUnidad"
  | "mayoreoDesde"
  | "mayoreoPrecio"
  | "codigoBarras"
  | "ubicacionEstante"
  | "proveedor"
  | "fechaCaducidad";

export interface ColumnaCarga {
  campo: CampoCarga;
  /** Encabezado de la plantilla. */
  encabezado: string;
  /** Otros nombres aceptados (se comparan sin acentos ni símbolos). */
  alias: string[];
  requerido?: boolean;
  ayuda: string;
  ejemplo: string | number;
  /** Lista cerrada de valores (se ofrece como desplegable en la plantilla). */
  opciones?: string[];
}

export const COLUMNAS_CARGA: ColumnaCarga[] = [
  { campo: "codigoItem", encabezado: "Código", alias: ["codigo", "cod", "sku", "clave"], requerido: true, ayuda: "Clave única del producto (letras, números, guion, punto).", ejemplo: "CUAD-100" },
  { campo: "descripcion", encabezado: "Descripción", alias: ["descripcion", "nombre", "producto"], requerido: true, ayuda: "Nombre como aparece en el ticket.", ejemplo: "Cuaderno profesional 100 hojas" },
  { campo: "precioUnitario", encabezado: "Precio de venta", alias: ["precio", "precio unitario", "precioventa", "precio venta"], requerido: true, ayuda: "Precio por pieza (o por kg/m si es a granel).", ejemplo: 45 },
  { campo: "precioCompra", encabezado: "Costo por pieza", alias: ["costo", "precio compra", "preciocompra", "costo unitario"], ayuda: "Lo que te cuesta UNA pieza (no el paquete).", ejemplo: 30 },
  { campo: "stockActual", encabezado: "Existencia", alias: ["stock", "existencia", "cantidad", "inventario"], ayuda: "Piezas en la sucursal activa. Vacío = no se cambia.", ejemplo: 50 },
  { campo: "stockMinimo", encabezado: "Stock mínimo", alias: ["stockminimo", "minimo", "stock min"], ayuda: "Debajo de esto avisa que hay que resurtir.", ejemplo: 10 },
  { campo: "categoria", encabezado: "Categoría", alias: ["categoria", "familia", "departamento"], ayuda: "Nombre de la categoría; si no existe se crea.", ejemplo: "Escolar" },
  { campo: "seVende", encabezado: "Se vende", alias: ["se vende", "tipo", "tipo venta"], ayuda: "pieza · granel · servicio (vacío = pieza).", ejemplo: "pieza", opciones: ["pieza", "granel", "servicio"] },
  { campo: "unidadVenta", encabezado: "Unidad a granel", alias: ["unidad venta", "unidad granel", "unidad"], ayuda: "Solo a granel: kg, g, m, cm, L, ml.", ejemplo: "", opciones: ["kg", "g", "m", "cm", "L", "ml"] },
  { campo: "control", encabezado: "Control extra", alias: ["control", "control extra"], ayuda: "ninguno · lotes · series (variantes se generan en la ficha).", ejemplo: "ninguno", opciones: ["ninguno", "lotes", "series"] },
  { campo: "unidadCompra", encabezado: "Se compra por", alias: ["unidad compra", "se compra por", "presentacion compra"], ayuda: "Pieza, Paquete, Caja… (vacío = pieza).", ejemplo: "Paquete" },
  { campo: "piezasPorUnidad", encabezado: "Piezas por unidad", alias: ["piezas por unidad", "piezas", "contenido", "factor"], ayuda: "Cuántas piezas trae el paquete o caja.", ejemplo: 5 },
  { campo: "mayoreoDesde", encabezado: "Mayoreo desde", alias: ["mayoreo desde", "desde"], ayuda: "Piezas a partir de las cuales baja el precio.", ejemplo: 12 },
  { campo: "mayoreoPrecio", encabezado: "Precio mayoreo", alias: ["precio mayoreo", "mayoreo"], ayuda: "Precio por pieza al llegar a esa cantidad.", ejemplo: 40 },
  { campo: "codigoBarras", encabezado: "Código de barras", alias: ["codigobarras", "codigo barras", "barcode", "ean"], ayuda: "EAN/UPC tal como lo lee el escáner.", ejemplo: "7501234567890" },
  { campo: "ubicacionEstante", encabezado: "Ubicación", alias: ["ubicacion", "estante", "ubicacionestante", "pasillo"], ayuda: "Dónde está en la tienda.", ejemplo: "Estante A-1" },
  { campo: "proveedor", encabezado: "Proveedor", alias: ["proveedor", "proveedora", "marca proveedor"], ayuda: "Nombre del proveedor habitual.", ejemplo: "Distribuidora Escolar" },
  { campo: "fechaCaducidad", encabezado: "Caducidad", alias: ["caducidad", "fecha caducidad", "fechacaducidad", "vencimiento"], ayuda: "AAAA-MM-DD (para lotes usa Lotes y series).", ejemplo: "" },
];

/** "Stock mínimo" → "stockminimo"; "Código de barras" → "codigodebarras". */
export function normalizarEncabezado(h: string): string {
  return String(h ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const INDICE = new Map<string, CampoCarga>();
for (const c of COLUMNAS_CARGA) {
  for (const n of [c.encabezado, c.campo, ...c.alias]) INDICE.set(normalizarEncabezado(n), c.campo);
}

/** Encabezado del archivo → campo. Lo desconocido se ignora. */
export function mapearColumnas(encabezados: string[]): Record<string, CampoCarga> {
  const mapa: Record<string, CampoCarga> = {};
  for (const h of encabezados) {
    const campo = INDICE.get(normalizarEncabezado(h));
    if (campo && !Object.values(mapa).includes(campo)) mapa[h] = campo;
  }
  return mapa;
}

export interface ErrorCarga {
  row: number;
  field: string;
  message: string;
}

/** Datos listos para guardar; solo trae las llaves de las columnas presentes. */
export interface ProductoCarga {
  codigoItem: string;
  descripcion: string;
  precioUnitario: number;
  precioCompra?: number | null;
  stockActual?: number;
  stockMinimo?: number;
  categoria?: string | null;
  permiteDecimales?: boolean;
  esServicio?: boolean;
  usaLotes?: boolean;
  usaSeries?: boolean;
  unidadVenta?: string | null;
  unidadCompra?: string | null;
  piezasPorUnidad?: number;
  escalasPrecio?: EscalaPrecio[];
  codigoBarras?: string | null;
  ubicacionEstante?: string | null;
  proveedor?: string | null;
  fechaCaducidad?: Date | null;
}

const vacio = (v: unknown) => v == null || String(v).trim() === "";
const texto = (v: unknown, max: number) => (vacio(v) ? null : String(v).trim().slice(0, max));
function numero(v: unknown): number {
  if (typeof v === "number") return v;
  return Number(String(v).replace(/[$,\s]/g, ""));
}
const MODOS: Record<string, ModoVenta> = { pieza: "PIEZA", piezas: "PIEZA", granel: "GRANEL", servicio: "SERVICIO" };
const CONTROLES: Record<string, ControlExtra> = { ninguno: "NINGUNO", "": "NINGUNO", lotes: "LOTES", lote: "LOTES", series: "SERIES", serie: "SERIES" };

/** Valida un renglón. `presentes` = campos cuyas columnas vienen en el archivo. */
export function validarRenglon(
  raw: Record<string, unknown>,
  mapa: Record<string, CampoCarga>,
  fila: number
): { errores: ErrorCarga[]; producto: ProductoCarga | null } {
  const v: Partial<Record<CampoCarga, unknown>> = {};
  for (const [col, campo] of Object.entries(mapa)) v[campo] = raw[col];
  const presentes = new Set(Object.values(mapa));
  const errores: ErrorCarga[] = [];
  const err = (field: string, message: string) => errores.push({ row: fila, field, message });

  const codigo = texto(v.codigoItem, 40)?.toUpperCase() ?? "";
  if (!codigo) err("codigoItem", "Código vacío");
  else if (!/^[A-Z0-9._-]+$/.test(codigo)) err("codigoItem", `Código inválido "${codigo}": solo letras, números, punto y guion`);
  const descripcion = texto(v.descripcion, 120) ?? "";
  if (descripcion.length < 2) err("descripcion", "Descripción vacía o muy corta");

  const precio = numero(v.precioUnitario);
  if (!Number.isFinite(precio) || precio < 0 || precio > 9_999_999) err("precioUnitario", `Precio inválido: "${v.precioUnitario ?? ""}"`);

  const p: ProductoCarga = { codigoItem: codigo, descripcion, precioUnitario: Math.round(precio * 100) / 100 };

  if (presentes.has("precioCompra") && !vacio(v.precioCompra)) {
    const c = numero(v.precioCompra);
    if (!Number.isFinite(c) || c < 0) err("precioCompra", `Costo inválido: "${v.precioCompra}"`);
    else if (Number.isFinite(precio) && c > precio) err("precioCompra", "El costo por pieza es mayor al precio de venta");
    else p.precioCompra = Math.round(c * 10_000) / 10_000;
  }

  // Tipo: se vende + control extra.
  let modo: ModoVenta = "PIEZA";
  if (presentes.has("seVende") && !vacio(v.seVende)) {
    const m = MODOS[normalizarEncabezado(String(v.seVende))];
    if (!m) err("seVende", `"Se vende" debe ser pieza, granel o servicio (llegó "${v.seVende}")`);
    else modo = m;
  }
  let control: ControlExtra = "NINGUNO";
  if (presentes.has("control") && !vacio(v.control)) {
    const c = CONTROLES[normalizarEncabezado(String(v.control))];
    if (!c) err("control", `"Control extra" debe ser ninguno, lotes o series (llegó "${v.control}")`);
    else control = c;
  }
  if (presentes.has("seVende") || presentes.has("control")) {
    if (control === "SERIES" && modo !== "PIEZA") err("control", "Las series solo aplican a productos por pieza");
    if (control !== "NINGUNO" && modo === "SERVICIO") err("control", "Un servicio no lleva lotes ni series");
    Object.assign(p, banderasDeTipo(modo, control));
    p.unidadVenta = validarUnidadVenta(v.unidadVenta, modo === "GRANEL");
  }

  if (presentes.has("stockActual") && !vacio(v.stockActual)) {
    const s = Math.round(numero(v.stockActual) * 1000) / 1000;
    if (!Number.isFinite(s) || s < 0) err("stockActual", `Existencia inválida: "${v.stockActual}"`);
    else if (modo !== "GRANEL" && !Number.isInteger(s)) err("stockActual", "Existencia con decimales: márcalo como granel");
    else if (s > 0 && (control === "LOTES" || control === "SERIES"))
      err("stockActual", `Con ${control === "LOTES" ? "lotes" : "series"} la existencia entra en Lotes y series (deja la existencia vacía)`);
    else if (modo !== "SERVICIO") p.stockActual = s;
  }
  if (presentes.has("stockMinimo") && !vacio(v.stockMinimo)) {
    const s = numero(v.stockMinimo);
    if (!Number.isFinite(s) || s < 0) err("stockMinimo", `Stock mínimo inválido: "${v.stockMinimo}"`);
    else p.stockMinimo = Math.round(s * 1000) / 1000;
  }

  if (presentes.has("unidadCompra") || presentes.has("piezasPorUnidad")) {
    try {
      const u = validarUnidadCompra({
        unidadCompra: texto(v.unidadCompra, 20) ?? "",
        piezasPorUnidad: vacio(v.piezasPorUnidad) ? 1 : numero(v.piezasPorUnidad),
      });
      p.unidadCompra = modo === "SERVICIO" ? null : u.unidadCompra;
      p.piezasPorUnidad = modo === "SERVICIO" ? 1 : u.piezasPorUnidad;
    } catch (e: any) {
      err("unidadCompra", e.message);
    }
  }

  if (presentes.has("mayoreoDesde") || presentes.has("mayoreoPrecio")) {
    if (vacio(v.mayoreoDesde) && vacio(v.mayoreoPrecio)) p.escalasPrecio = [];
    else {
      try {
        p.escalasPrecio = validarEscalas(
          [{ desde: numero(v.mayoreoDesde), precio: numero(v.mayoreoPrecio), nombre: "Mayoreo" }],
          p.precioUnitario
        );
      } catch (e: any) {
        err("mayoreo", e.message.replace(/^Escala 1: /, "Mayoreo: "));
      }
    }
  }

  if (presentes.has("categoria")) p.categoria = texto(v.categoria, 40);
  if (presentes.has("codigoBarras")) p.codigoBarras = texto(v.codigoBarras, 64);
  if (presentes.has("ubicacionEstante")) p.ubicacionEstante = texto(v.ubicacionEstante, 60);
  if (presentes.has("proveedor")) p.proveedor = texto(v.proveedor, 120);
  if (presentes.has("fechaCaducidad")) {
    if (vacio(v.fechaCaducidad)) p.fechaCaducidad = null;
    else {
      const f = v.fechaCaducidad instanceof Date ? v.fechaCaducidad : new Date(String(v.fechaCaducidad).trim());
      if (Number.isNaN(f.getTime())) err("fechaCaducidad", `Fecha inválida: "${v.fechaCaducidad}" (usa AAAA-MM-DD)`);
      else p.fechaCaducidad = f;
    }
  }

  return { errores, producto: errores.length ? null : p };
}

/** Renglones de ejemplo de la plantilla (cubren los casos típicos). */
export const EJEMPLOS_PLANTILLA: Array<Partial<Record<CampoCarga, string | number>>> = [
  { codigoItem: "CUAD-100", descripcion: "Cuaderno profesional 100 hojas", precioUnitario: 45, precioCompra: 30, stockActual: 50, stockMinimo: 10, categoria: "Escolar", seVende: "pieza", control: "ninguno", mayoreoDesde: 12, mayoreoPrecio: 40, ubicacionEstante: "Estante A-1", proveedor: "Distribuidora Escolar" },
  { codigoItem: "PAPAS-45", descripcion: "Papas fritas 45 g", precioUnitario: 22, precioCompra: 15, stockActual: 48, stockMinimo: 12, categoria: "Botanas", seVende: "pieza", control: "ninguno", unidadCompra: "Paquete", piezasPorUnidad: 24 },
  { codigoItem: "LISTON-1", descripcion: "Listón satinado 1 cm", precioUnitario: 6, precioCompra: 2.5, stockActual: 120.5, categoria: "Mercería", seVende: "granel", unidadVenta: "m" },
  { codigoItem: "COPIA-BN", descripcion: "Copia blanco y negro", precioUnitario: 1.5, seVende: "servicio", control: "ninguno" },
];
