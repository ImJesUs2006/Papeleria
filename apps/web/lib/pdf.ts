// ============================================================
// Generador de PDF "casero" (Fase 12) para el comprobante de venta.
// No usa librerías externas: construye un PDF mínimo PDF-1.4 con
// fuentes estándar Type1 (Helvetica / Helvetica-Bold) y codificación
// WinAnsi, sin compresión. Suficiente para un ticket descargable.
// ============================================================

export interface ResultadoVentaPDF {
  folioVenta: string;
  totalNeto: number;
  subtotal: number;
  iva: number;
  /** IEPS de la venta (opcional; solo se imprime si es mayor a 0). */
  ieps?: number;
  cambio: number | null;
  metodoPago: string;
  nombreCliente: string | null;
  fechaHora: string;
  offline: boolean;
  items: Array<{
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    importe: number;
  }>;
}

interface LineaPDF {
  texto?: string;
  negrita?: boolean;
  tam?: number;
  der?: string; // columna derecha (totales)
  doble?: boolean; // línea separadora -----
}

const ANCHO_PAGINA = 595; // A4 portrait (puntos @72dpi)
const MARGEN_X = 40;
const MARGEN_S = 40;
const MARGEN_I = 40;

const ETIQUETA_PAGO: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA: "Tarjeta (terminal)",
  TARJETA_TERMINAL: "Tarjeta (terminal)",
  DIGITAL: "Transferencia",
  TRANSFERENCIA: "Transferencia",
  PUNTOS_MONEDERO: "Monedero (puntos)",
};

/** Escapa un string a bytes WinAnsi seguros para el stream PDF. */
function pdfBytes(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    // WinAnsi sube de número de código: 0x20-0xFF se escriben como byte crudo.
    if (c >= 0x20 && c <= 0xff) out += String.fromCharCode(c);
    else out += "?";
  }
  return out.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function anchoTx(s: string, tam: number): number {
  // Aproximación: Helvetica ~0.5 * tamaño por carácter.
  return pdfBytes(s).length * tam * 0.5;
}

interface PaginaPDF {
  cuerpo: string[];
  altura: number; // puntero y
}

/** Construye el byte stream de contenido (BT/ET) para todas las páginas. */
function construirStream(lineas: LineaPDF[]): { streams: string[]; paginas: number } {
  const paginas: PaginaPDF[] = [{ cuerpo: [], altura: 800 }];
  const agregar = (l: string) => paginas[paginas.length - 1].cuerpo.push(l);

  for (const l of lineas) {
    const tam = l.tam ?? 10;
    const salto = tam + 6;
    if (paginas[paginas.length - 1].altura - salto < MARGEN_S) {
      paginas.push({ cuerpo: [], altura: 800 });
    }

    if (l.doble) {
      agregar(`0 ${-salto} Td`);
      agregar(`(${pdfBytes("─".repeat(64))}) Tj`);
      paginas[paginas.length - 1].altura -= salto;
      continue;
    }

    const fuente = l.negrita ? "/F2" : "/F1";
    const color = l.negrita ? " 0 g" : " 0.25 0.25 0.25 rg";
    agregar(`${fuente} ${tam.toFixed(1)} Tf${color}`);
    agregar(`0 ${-salto} Td`);

    const textoLinea = l.texto ?? "";
    if (!l.der) {
      agregar(`(${pdfBytes(textoLinea)}) Tj`);
    } else {
      const wIzq = anchoTx(textoLinea, tam);
      const wDer = anchoTx(l.der, tam);
      const espacio =
        (ANCHO_PAGINA - MARGEN_X * 2) - wIzq - wDer;
      const gap = Math.max(espacio, 2);
      agregar(`(${pdfBytes(textoLinea)}) Tj`);
      agregar(`${gap.toFixed(2)} 0 Td`);
      agregar(`(${pdfBytes(l.der)}) Tj`);
      agregar(`${(-gap).toFixed(2)} 0 Td`);
    }
    paginas[paginas.length - 1].altura -= salto;
  }

  const streams = paginas.map(
    (p) => `BT\n${p.cuerpo.join("\n")}\nET`
  );
  return { streams, paginas: paginas.length };
}

/** Construye el documento PDF completo y devuelve sus bytes. */
export function construirTicketPDF(resultado: ResultadoVentaPDF, negocio: string): Uint8Array {
  const lineas: LineaPDF[] = [];
  lineas.push({ texto: negocio.toUpperCase() || "PAPELERÍA", negrita: true, tam: 14 });
  lineas.push({ texto: "Comprobante de venta", tam: 9, der: new Date(resultado.fechaHora).toLocaleString("es-MX") });
  lineas.push({ texto: `Folio: ${resultado.folioVenta}`, tam: 9, der: resultado.offline ? "OFFLINE" : "EN LÍNEA" });
  if (resultado.nombreCliente) {
    lineas.push({ texto: `Cliente: ${resultado.nombreCliente}`, tam: 9 });
  }
  lineas.push({ doble: true });

  for (const i of resultado.items) {
    const detalle = `${pdfCantidad(i.cantidad)} × ${pdfMoneda(i.importe)}`;
    lineas.push({ texto: i.descripcion.slice(0, 42), tam: 9 });
    lineas.push({ texto: "", tam: 7, der: detalle });
  }

  lineas.push({ doble: true });
  lineas.push({ texto: "Subtotal", der: pdfMoneda(resultado.subtotal), tam: 9 });
  if ((resultado.ieps ?? 0) > 0) {
    lineas.push({ texto: "IEPS", der: pdfMoneda(resultado.ieps ?? 0), tam: 9 });
  }
  lineas.push({ texto: "IVA", der: pdfMoneda(resultado.iva), tam: 9 });
  lineas.push({ texto: "TOTAL", der: pdfMoneda(resultado.totalNeto), negrita: true, tam: 12 });
  lineas.push({ texto: `Método: ${ETIQUETA_PAGO[resultado.metodoPago] ?? resultado.metodoPago}`, tam: 9 });
  if (resultado.cambio != null && resultado.cambio > 0) {
    lineas.push({ texto: "CAMBIO A ENTREGAR", negrita: true, tam: 9, der: pdfMoneda(resultado.cambio) });
  }
  lineas.push({ texto: "¡Gracias por su compra!", tam: 9 });

  return construirPDF(lineas, "A4");
}

function pdfMoneda(n: number): string {
  return `$${Number.isFinite(n) ? n.toFixed(2) : "0.00"}`;
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

function construirPDF(lineas: LineaPDF[], formato: "A4"): Uint8Array {
  const { streams, paginas } = construirStream(lineas);

  // Numeración de objetos:
  //   1 = catálogo, 2 = árbol de páginas,
  //   (3 + 2i) = página i, (4 + 2i) = contenido (stream) de la página i,
  //   3 + 2N = fuente regular, 4 + 2N = fuente negrita.
  const objPagina = (i: number) => 3 + i * 2;
  const objStream = (i: number) => 4 + i * 2;
  const objFuenteRegular = 3 + paginas * 2;
  const objFuenteNegrita = 4 + paginas * 2;

  const catalog = "<< /Type /Catalog /Pages 2 0 R >>";
  const pages = `<< /Type /Pages /Kids [${Array.from({ length: paginas }, (_, i) => `${objPagina(i)} 0 R`).join(" ")}] /Count ${paginas} >>`;
  const fuentes = `<< /F1 ${objFuenteRegular} 0 R /F2 ${objFuenteNegrita} 0 R >>`;

  const objs: string[] = [catalog, pages];
  for (let i = 0; i < paginas; i++) {
    objs.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ANCHO_PAGINA} 842] /Resources << /Font ${fuentes} >> /Contents ${objStream(i)} 0 R >>`,
      // Un stream de contenido SIEMPRE necesita su diccionario y /Length.
      envolverStream(streams[i])
    );
  }
  objs.push(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
  );
  objs.push(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"
  );

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

/** Genera y descarga el PDF del comprobante de venta (lado cliente). */
export function descargarTicketPDF(
  resultado: ResultadoVentaPDF,
  negocio: string,
  nombreUsuario?: string
): void {
  const bytes = construirTicketPDF(resultado, negocio);
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