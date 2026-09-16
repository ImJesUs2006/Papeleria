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
