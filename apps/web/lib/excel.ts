import * as XLSX from "xlsx";

interface ParsedRow {
  [key: string]: any;
}

export function parseExcelBuffer(buffer: Buffer): {
  headers: string[];
  rows: ParsedRow[];
  sheetName: string;
} {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error("El archivo no contiene hojas de cálculo");
  }

  const sheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json<ParsedRow>(sheet, { defval: "" });

  if (jsonData.length === 0) {
    throw new Error("La hoja está vacía");
  }

  const headers = Object.keys(jsonData[0]);

  return { headers, rows: jsonData, sheetName };
}

export function buildExcelBuffer(
  headers: string[],
  data: any[][],
  sheetName: string
): Buffer {
  const wb = XLSX.utils.book_new();
  const wsData = [headers, ...data];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Auto-width columns
  ws["!cols"] = headers.map((h, i) => {
    const maxLen = Math.max(
      h.length,
      ...data.map((row) => String(row[i] ?? "").length)
    );
    return { wch: Math.min(maxLen + 2, 40) };
  });

  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
