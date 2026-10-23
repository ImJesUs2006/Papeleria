// ============================================================
// Generador de PDF "casero" para el comprobante de venta.
// No usa librerías externas: construye un PDF-1.4 mínimo con fuentes
// estándar Type1 (Helvetica / Helvetica-Bold) y codificación WinAnsi.
//
// El documento tiene el tamaño de un TICKET (58 u 80 mm de ancho y el alto
// justo del contenido), no de una hoja carta/A4. Antes era A4 y además el
// texto arrancaba en la esquina inferior (fuera de la página): el PDF salía
// en blanco.
// ============================================================

export interface ResultadoVentaPDF {
  folioVenta: string;
  totalNeto: number;
  subtotal: number;
  iva: number;
  /** IEPS de la venta (opcional; solo se imprime si es mayor a 0). */
  ieps?: number;
  /** Descuentos aplicados (opcional; solo se imprime si es mayor a 0). */
  descuentoTotal?: number;
  cambio: number | null;
  metodoPago: string;
  nombreCliente: string | null;
  fechaHora: string;
  offline: boolean;
  /** Mensaje del negocio al pie (Configuración → Punto de Venta). */
  mensajeTicket?: string | null;
  items: Array<{
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    importe: number;
  }>;
}

export type AnchoTicketPDF = "58mm" | "80mm";

interface LineaPDF {
  texto?: string;
  negrita?: boolean;
  tam?: number;
  der?: string; // columna derecha (importes)
  centro?: boolean;
  separador?: boolean;
  espacio?: number; // renglón en blanco de este alto (pt)
}

const PT_POR_MM = 72 / 25.4;
const MARGEN_X_MM = 3;
const MARGEN_Y_MM = 4;

const ETIQUETA_PAGO: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA: "Tarjeta (terminal)",
  TARJETA_TERMINAL: "Tarjeta (terminal)",
  DIGITAL: "Transferencia",
  TRANSFERENCIA: "Transferencia",
  PUNTOS_MONEDERO: "Monedero (puntos)",
  MIXTO: "Pago dividido",
};

/** Escapa un string a bytes WinAnsi seguros para el stream PDF. */
function pdfBytes(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    // WinAnsi: 0x20-0xFF se escriben como byte crudo; lo demás no existe.
    if (c >= 0x20 && c <= 0xff) out += String.fromCharCode(c);
    else out += "?";
  }
  return out.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** Ancho aproximado en puntos de un texto en Helvetica (métricas medias por tipo de carácter). */
export function anchoTexto(s: string, tam: number, negrita = false): number {
  let unidades = 0;
  for (const ch of s) {
    if (/[0-9$]/.test(ch)) unidades += 0.556;
    else if (/[ .,:;'|!il]/.test(ch)) unidades += 0.278;
    else if (/[A-ZÁÉÍÓÚÑÜ&@%]/.test(ch)) unidades += /[MW@%]/.test(ch) ? 0.85 : 0.68;
    else unidades += 0.53;
  }
  return unidades * tam * (negrita ? 1.06 : 1);
}

/** Parte un texto en renglones que caben en `ancho` puntos. */
export function partirTexto(texto: string, ancho: number, tam: number, negrita = false): string[] {
  const renglones: string[] = [];
  for (const parrafo of texto.split("\n")) {
    let actual = "";
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      const prueba = actual ? `${actual} ${palabra}` : palabra;
      if (anchoTexto(prueba, tam, negrita) <= ancho) {
        actual = prueba;
        continue;
      }
      if (actual) renglones.push(actual);
      // Palabra más larga que el renglón: se corta.
      let resto = palabra;
      while (anchoTexto(resto, tam, negrita) > ancho && resto.length > 1) {
        let n = resto.length - 1;
        while (n > 1 && anchoTexto(resto.slice(0, n), tam, negrita) > ancho) n--;
        renglones.push(resto.slice(0, n));
        resto = resto.slice(n);
      }
      actual = resto;
    }
    renglones.push(actual);
  }
  return renglones;
}

const saltoDe = (l: LineaPDF) => (l.espacio != null ? l.espacio : (l.tam ?? 8) * 1.35);

/** Stream de contenido de UNA página del alto exacto del ticket. */
function construirStream(lineas: LineaPDF[], anchoPagina: number, altoPagina: number): string {
  const margenX = MARGEN_X_MM * PT_POR_MM;
  const util = anchoPagina - margenX * 2;
  const cuerpo: string[] = [];
  let y = altoPagina - MARGEN_Y_MM * PT_POR_MM;

  const escribir = (texto: string, x: number, yy: number, tam: number, negrita: boolean) => {
    cuerpo.push(
      `BT ${negrita ? "/F2" : "/F1"} ${tam.toFixed(1)} Tf 0 g ${x.toFixed(2)} ${yy.toFixed(2)} Td (${pdfBytes(texto)}) Tj ET`
    );
  };

  for (const l of lineas) {
    const salto = saltoDe(l);
    y -= salto;
    if (l.espacio != null) continue;
    const tam = l.tam ?? 8;
    if (l.separador) {
      // Línea punteada con caracteres WinAnsi (el "─" anterior salía como "?").
      const guion = "- ";
      const veces = Math.max(1, Math.floor(util / anchoTexto(guion, tam)));
      escribir(guion.repeat(veces).trimEnd(), margenX, y + tam * 0.3, tam, false);
      continue;
    }
    const negrita = !!l.negrita;
    const texto = l.texto ?? "";
    if (l.centro) {
      const w = anchoTexto(texto, tam, negrita);
      escribir(texto, margenX + Math.max(0, (util - w) / 2), y, tam, negrita);
    } else if (texto) {
      escribir(texto, margenX, y, tam, negrita);
    }
    if (l.der) {
      const w = anchoTexto(l.der, tam, negrita);
      escribir(l.der, margenX + util - w, y, tam, negrita);
    }
  }
  return cuerpo.join("\n");
}

/**
 * Envuelve el contenido de una página en un objeto stream válido.
 * El documento se serializa a WinAnsi de 1 byte por carácter, así que
 * `/Length` en caracteres equivale al tamaño real en bytes.
 */
function envolverStream(contenido: string): string {
  return `<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`;
}

function pdfCantidad(n: number): string {
  const redondeado = Math.round(n * 1000) / 1000;
  return Number.isInteger(redondeado) ? String(redondeado) : redondeado.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function pdfMoneda(n: number): string {
  return `$${Number.isFinite(n) ? n.toFixed(2) : "0.00"}`;
}

/** Arma el PDF de una sola página con el tamaño del ticket. */
function construirPDF(lineas: LineaPDF[], ancho: AnchoTicketPDF): Uint8Array {
  const anchoPagina = (ancho === "58mm" ? 58 : 80) * PT_POR_MM;
  const altoContenido = lineas.reduce((s, l) => s + saltoDe(l), 0);
  const altoPagina = Math.max(altoContenido + MARGEN_Y_MM * 2 * PT_POR_MM + 4, 60 * PT_POR_MM);
  const stream = construirStream(lineas, anchoPagina, altoPagina);

  // 1 = catálogo, 2 = páginas, 3 = página, 4 = contenido, 5/6 = fuentes.
  const objs: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${anchoPagina.toFixed(2)} ${altoPagina.toFixed(2)}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,
    envolverStream(stream),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];

  const partes: string[] = ["%PDF-1.4\n"];
  const xref: number[] = [];
  let cur = partes[0].length;
  objs.forEach((contenido, i) => {
    const ser = `${i + 1} 0 obj\n${contenido}\nendobj\n`;
    xref[i] = cur;
    cur += ser.length;
    partes.push(ser);
  });
  const xrefOfs = cur;
  partes.push(`xref\n0 ${xref.length + 1}\n0000000000 65535 f \n`);
  xref.forEach((o) => {
    partes.push(`${String(o).padStart(10, "0")} 00000 n \n`);
  });
  partes.push(`trailer\n<< /Size ${xref.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOfs}\n%%EOF`);

  const unido = partes.join("");
  const bytes = new Uint8Array(unido.length);
  for (let i = 0; i < unido.length; i++) bytes[i] = unido.charCodeAt(i) & 0xff;
  return bytes;
}

/** Construye el comprobante de venta en PDF (tamaño ticket) y devuelve sus bytes. */
export function construirTicketPDF(
  resultado: ResultadoVentaPDF,
  negocio: string,
  ancho: AnchoTicketPDF = "80mm"
): Uint8Array {
  const angosto = ancho === "58mm";
  const T = angosto ? 7 : 8; // tamaño base
  const util = ((angosto ? 58 : 80) - MARGEN_X_MM * 2) * PT_POR_MM;
  const lineas: LineaPDF[] = [];
  const parrafo = (texto: string, opciones: Partial<LineaPDF> = {}) => {
    const tam = opciones.tam ?? T;
    for (const r of partirTexto(texto, util, tam, !!opciones.negrita)) lineas.push({ ...opciones, tam, texto: r });
  };

  parrafo((negocio || "Mi negocio").toUpperCase(), { negrita: true, tam: T + 3, centro: true });
  lineas.push({ texto: "Comprobante de venta", tam: T, centro: true });
  lineas.push({ espacio: 4 });
  lineas.push({ texto: `Folio: ${resultado.folioVenta}`, tam: T, negrita: true });
  lineas.push({ texto: new Date(resultado.fechaHora).toLocaleString("es-MX"), tam: T });
  if (resultado.offline) lineas.push({ texto: "Venta sin conexión (se sincroniza después)", tam: T - 1 });
  if (resultado.nombreCliente) parrafo(`Cliente: ${resultado.nombreCliente}`);
  lineas.push({ separador: true, tam: T });

  for (const i of resultado.items) {
    parrafo(i.descripcion);
    lineas.push({
      texto: `   ${pdfCantidad(i.cantidad)} x ${pdfMoneda(i.precioUnitario)}`,
      der: pdfMoneda(i.importe),
      tam: T,
    });
  }

  lineas.push({ separador: true, tam: T });
  if ((resultado.descuentoTotal ?? 0) > 0) {
    lineas.push({ texto: "Descuentos", der: `-${pdfMoneda(resultado.descuentoTotal ?? 0)}`, tam: T });
  }
  lineas.push({ texto: "Subtotal", der: pdfMoneda(resultado.subtotal), tam: T });
  if ((resultado.ieps ?? 0) > 0) {
    lineas.push({ texto: "IEPS", der: pdfMoneda(resultado.ieps ?? 0), tam: T });
  }
  lineas.push({ texto: "IVA", der: pdfMoneda(resultado.iva), tam: T });
  lineas.push({ espacio: 2 });
  lineas.push({ texto: "TOTAL", der: pdfMoneda(resultado.totalNeto), negrita: true, tam: T + 3 });
  lineas.push({ texto: "Pago", der: ETIQUETA_PAGO[resultado.metodoPago] ?? resultado.metodoPago, tam: T });
  if (resultado.cambio != null && resultado.cambio > 0) {
    lineas.push({ texto: "Cambio", der: pdfMoneda(resultado.cambio), negrita: true, tam: T + 1 });
  }
  lineas.push({ separador: true, tam: T });
  parrafo(resultado.mensajeTicket?.trim() || "¡Gracias por su compra!", { centro: true });

  return construirPDF(lineas, ancho);
}

/** Genera y descarga el PDF del comprobante de venta (lado cliente). */
export function descargarTicketPDF(
  resultado: ResultadoVentaPDF,
  negocio: string,
  ancho: AnchoTicketPDF = "80mm"
): void {
  const bytes = construirTicketPDF(resultado, negocio, ancho);
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  const blob = new Blob([buffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ticket-${resultado.folioVenta.replace(/[^a-zA-Z0-9-_]/g, "")}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
