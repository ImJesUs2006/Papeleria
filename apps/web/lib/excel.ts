// ============================================================
// Lectura/escritura de Excel con ExcelJS (sin SheetJS/xlsx).
// Reemplaza a SheetJS, vulnerable a prototype pollution y ReDoS.
// ============================================================
import ExcelJS from "exceljs";
import { Readable } from "stream";

interface ParsedRow {
  [key: string]: any;
}

type CellValue = ExcelJS.CellValue;

/** Normaliza el valor de una celda de ExcelJS a un primitivo simple. */
function cellToPrimitive(value: CellValue): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const v: any = value;
    if ("result" in v) return (v.result ?? null) as any; // fórmula
    if ("richText" in v && Array.isArray(v.richText)) {
      return v.richText.map((r: any) => r.text ?? "").join("");
    }
    if ("text" in v && typeof v.text === "string") return v.text; // hyperlink
    if ("error" in v) return String(v.error);
    return String(v);
  }
  return value;
}

/**
 * Parsea la primera hoja de un .xlsx o .csv usando exclusivamente ExcelJS.
 * Devuelve encabezados (fila 1) y filas como objetos { encabezado: valor }.
 */
export async function parseExcelBuffer(
  buffer: Buffer,
  fileName?: string
): Promise<{ headers: string[]; rows: ParsedRow[]; sheetName: string }> {
  const esCsv = (fileName ?? "").toLowerCase().endsWith(".csv");
  const workbook = new ExcelJS.Workbook();

  if (esCsv) {
    // Se pasa el texto completo como un único chunk.
    const stream = Readable.from([buffer.toString("utf8")]);
    await workbook.csv.read(stream as any);
  } else {
    await workbook.xlsx.load(buffer as any);
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error("El archivo no contiene hojas de cálculo");
  }

  // Encabezados desde la fila 1 (respetando columnas vacías intermedias).
  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber - 1] = String(cellToPrimitive(cell.value) ?? "").trim();
  });

  const rows: ParsedRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: ParsedRow = {};
    let tieneDatos = false;
    headers.forEach((header, i) => {
      if (!header) return;
      const valor = cellToPrimitive(row.getCell(i + 1).value);
      if (valor !== null && valor !== undefined && String(valor).trim() !== "") {
        tieneDatos = true;
      }
      obj[header] = valor ?? "";
    });
    if (tieneDatos) rows.push(obj);
  });

  if (rows.length === 0) {
    throw new Error("La hoja está vacía");
  }

  return { headers: headers.filter(Boolean), rows, sheetName: sheet.name };
}

/** Construye un .xlsx con ExcelJS y auto-ancho de columnas. */
export async function buildExcelBuffer(
  headers: string[],
  data: any[][],
  sheetName: string
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  sheet.addRow(headers);
  data.forEach((row) => sheet.addRow(row));

  sheet.columns.forEach((_, i) => {
    const maxLen = Math.max(
      headers[i]?.length ?? 0,
      ...data.map((row) => String(row[i] ?? "").length)
    );
    sheet.getColumn(i + 1).width = Math.min(maxLen + 2, 40);
  });
  sheet.getRow(1).font = { bold: true };

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Plantilla de carga masiva: hoja "Productos" con los encabezados que
 * reconoce el sistema y renglones de ejemplo, listas desplegables donde el
 * valor es cerrado, y hoja "Instrucciones" con qué va en cada columna.
 */
export async function buildPlantillaInventario(): Promise<Buffer> {
  const { COLUMNAS_CARGA, EJEMPLOS_PLANTILLA } = await import("./carga-masiva");
  const wb = new ExcelJS.Workbook();
  const hoja = wb.addWorksheet("Productos", { views: [{ state: "frozen", ySplit: 1 }] });
  hoja.columns = COLUMNAS_CARGA.map((c) => ({
    header: c.requerido ? `${c.encabezado}` : c.encabezado,
    key: c.campo,
    width: Math.max(14, c.encabezado.length + 4),
  }));
  hoja.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  hoja.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
  COLUMNAS_CARGA.forEach((c, i) => {
    if (c.requerido) hoja.getRow(1).getCell(i + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB45309" } };
    hoja.getRow(1).getCell(i + 1).note = c.ayuda;
  });
  for (const e of EJEMPLOS_PLANTILLA) hoja.addRow(e);
  // Listas desplegables para los valores cerrados (hasta el renglón 1000).
  COLUMNAS_CARGA.forEach((c, i) => {
    if (!c.opciones) return;
    const letra = hoja.getColumn(i + 1).letter;
    for (let r = 2; r <= 1000; r++) {
      hoja.getCell(`${letra}${r}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`"${c.opciones.join(",")}"`],
        showErrorMessage: true,
        errorTitle: c.encabezado,
        error: `Elige: ${c.opciones.join(", ")}`,
      };
    }
  });

  const ins = wb.addWorksheet("Instrucciones");
  ins.columns = [
    { header: "Columna", key: "col", width: 22 },
    { header: "¿Obligatoria?", key: "req", width: 14 },
    { header: "Qué va", key: "ayuda", width: 70 },
    { header: "Ejemplo", key: "ej", width: 22 },
  ];
  ins.getRow(1).font = { bold: true };
  for (const c of COLUMNAS_CARGA) {
    ins.addRow({ col: c.encabezado, req: c.requerido ? "Sí" : "No", ayuda: c.ayuda, ej: c.ejemplo });
  }
  ins.addRow({});
  for (const nota of [
    "Borra los renglones de ejemplo antes de subir tus productos.",
    "Si el código ya existe, el producto se ACTUALIZA solo con las columnas que traiga el archivo (lo que no venga no se toca).",
    "La existencia es la de la sucursal activa al subir el archivo; queda registrada en el kardex.",
    "Costo por pieza: si compras por paquete, divide el costo del paquete entre sus piezas (o déjalo vacío).",
    "Variantes (talla, color) se generan después en la ficha del producto; lotes y series se registran en Lotes y series.",
  ]) {
    ins.addRow({ col: "•", ayuda: nota });
  }
  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab);
}
