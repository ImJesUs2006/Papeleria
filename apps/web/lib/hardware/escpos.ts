// ============================================================
// ESC/POS (Paso 8): ticket y cajón para impresoras térmicas genéricas
// (Epson, Xprinter, Bixolon…). Puro: produce los bytes; el envío lo
// hace lib/hardware/serial.ts (Web Serial).
// ============================================================

const ESC = 0x1b;
const GS = 0x1d;

export const COMANDOS = {
  iniciar: [ESC, 0x40],
  /** Tabla de caracteres PC850 (acentos y ñ). */
  tablaPC850: [ESC, 0x74, 0x02],
  izquierda: [ESC, 0x61, 0x00],
  centro: [ESC, 0x61, 0x01],
  negritaSi: [ESC, 0x45, 0x01],
  negritaNo: [ESC, 0x45, 0x00],
  dobleSi: [GS, 0x21, 0x11],
  dobleNo: [GS, 0x21, 0x00],
  /** Avanza y corta (corte parcial). */
  cortar: [GS, 0x56, 0x42, 0x00],
  /** Pulso al pin 2 del conector del cajón (25 ms on / 250 ms off). */
  abrirCajon: [ESC, 0x70, 0x00, 0x19, 0xfa],
} as const;

// Caracteres del español en PC850.
const PC850: Record<string, number> = {
  á: 0xa0, é: 0x82, í: 0xa1, ó: 0xa2, ú: 0xa3, ñ: 0xa4, Ñ: 0xa5, ü: 0x81, Ü: 0x9a,
  Á: 0xb5, É: 0x90, Í: 0xd6, Ó: 0xe0, Ú: 0xe9, "¿": 0xa8, "¡": 0xad, "°": 0xf8,
};

/** Texto → bytes PC850 (lo que no exista se aproxima o se omite). */
export function codificar(texto: string): number[] {
  const out: number[] = [];
  for (const ch of texto) {
    const code = ch.charCodeAt(0);
    if (code >= 0x20 && code < 0x7f) out.push(code);
    else if (ch === "\n") out.push(0x0a);
    else if (PC850[ch] !== undefined) out.push(PC850[ch]);
    else if (ch === "×") out.push(0x78);
    else if (ch === "−" || ch === "–" || ch === "—") out.push(0x2d);
    else if (ch === "·") out.push(0x2e);
    else {
      const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      if (base && base.charCodeAt(0) < 0x7f) out.push(base.charCodeAt(0));
    }
  }
  return out;
}

/** Columnas por ancho de papel (fuente A). */
export const columnasPorAncho = (ancho: "58mm" | "80mm") => (ancho === "58mm" ? 32 : 48);

/** "Texto ........ $12.00" ajustado a `cols`. */
export function renglon(izq: string, der: string, cols: number): string {
  const espacio = cols - der.length - 1;
  const recorte = izq.length > espacio ? izq.slice(0, Math.max(espacio, 0)) : izq;
  return recorte + " ".repeat(Math.max(cols - recorte.length - der.length, 1)) + der;
}

const dinero = (n: number) => `$${(Math.round(n * 100) / 100).toFixed(2)}`;

export interface TicketEscPos {
  negocio: string;
  folio: string;
  fecha: string;
  items: Array<{ descripcion: string; cantidad: number; importe: number }>;
  subtotal: number;
  descuentos?: number;
  ieps?: number;
  iva: number;
  total: number;
  metodoPago: string;
  cambio?: number | null;
  cliente?: string | null;
  mensaje?: string | null;
}

/** Bytes completos de un ticket (con corte y, si se pide, cajón). */
export function ticketEscPos(
  t: TicketEscPos,
  ancho: "58mm" | "80mm",
  opciones: { abrirCajon?: boolean } = {}
): Uint8Array {
  const cols = columnasPorAncho(ancho);
  const b: number[] = [];
  const linea = (s = "") => b.push(...codificar(s), 0x0a);
  const separador = () => linea("-".repeat(cols));

  b.push(...COMANDOS.iniciar, ...COMANDOS.tablaPC850, ...COMANDOS.centro, ...COMANDOS.negritaSi);
  linea(t.negocio.slice(0, cols));
  b.push(...COMANDOS.negritaNo);
  linea(`Folio: ${t.folio}`);
  linea(t.fecha);
  if (t.cliente) linea(`Cliente: ${t.cliente}`.slice(0, cols));
  b.push(...COMANDOS.izquierda);
  separador();
  for (const i of t.items) {
    linea(i.descripcion.slice(0, cols));
    linea(renglon(`  ${i.cantidad} x`, dinero(i.importe), cols));
  }
  separador();
  if (t.descuentos && t.descuentos > 0) linea(renglon("Descuentos", `-${dinero(t.descuentos)}`, cols));
  linea(renglon("Subtotal", dinero(t.subtotal), cols));
  if (t.ieps && t.ieps > 0) linea(renglon("IEPS", dinero(t.ieps), cols));
  linea(renglon("IVA", dinero(t.iva), cols));
  b.push(...COMANDOS.negritaSi, ...COMANDOS.dobleSi);
  linea(renglon("TOTAL", dinero(t.total), Math.floor(cols / 2)));
  b.push(...COMANDOS.dobleNo, ...COMANDOS.negritaNo);
  linea(renglon("Pago", t.metodoPago, cols));
  if (t.cambio != null && t.cambio > 0) linea(renglon("Cambio", dinero(t.cambio), cols));
  if (t.mensaje) {
    separador();
    b.push(...COMANDOS.centro);
    linea(t.mensaje.slice(0, cols * 3));
  }
  linea();
  linea();
  b.push(...COMANDOS.cortar);
  if (opciones.abrirCajon) b.push(...COMANDOS.abrirCajon);
  return Uint8Array.from(b);
}

/** Solo el pulso del cajón (sin imprimir). */
export function bytesAbrirCajon(): Uint8Array {
  return Uint8Array.from([...COMANDOS.iniciar, ...COMANDOS.abrirCajon]);
}

/**
 * Peso leído de una báscula por puerto serie. Acepta los formatos
 * comunes: "ST,GS,+  0.500kg", "  1.250 kg", "W 0,750". Devuelve kg, o
 * null si la lectura es inestable ("US") o ilegible.
 */
export function parsearPeso(lectura: string): number | null {
  const texto = lectura.trim();
  if (!texto || /\bUS\b/i.test(texto)) return null;
  const m = /([-+]?\s*\d+(?:[.,]\d+)?)\s*(kg|g|lb)?/i.exec(texto.replace(/^[A-Z]{1,2},[A-Z]{1,2},/i, ""));
  if (!m) return null;
  let valor = Number(m[1].replace(/\s+/g, "").replace(",", "."));
  if (!Number.isFinite(valor)) return null;
  const unidad = (m[2] ?? "kg").toLowerCase();
  if (unidad === "g") valor = valor / 1000;
  if (unidad === "lb") valor = valor * 0.45359237;
  return valor >= 0 ? Math.round(valor * 1000) / 1000 : null;
}
