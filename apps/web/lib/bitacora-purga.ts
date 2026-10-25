import ExcelJS from "exceljs";

// ============================================================
// Purga de bitácoras (del negocio y de la consola de plataforma).
// No se borran registros sueltos: se purga todo lo anterior a una fecha,
// con respaldo en Excel ANTES de borrar y constancia de la purga.
// ============================================================

/** Antigüedades permitidas, en meses. */
export const MESES_PURGA = [1, 3, 6, 12, 24] as const;

export function mesesValidos(v: unknown, porDefecto = 3): number {
  const n = Number(v);
  return (MESES_PURGA as readonly number[]).includes(n) ? n : porDefecto;
}

/** Fecha antes de la cual se purga: hoy menos `meses`. */
export function fechaCorte(meses: number, ahora = new Date()): Date {
  const corte = new Date(ahora);
  corte.setMonth(corte.getMonth() - meses);
  return corte;
}

export interface FilaRespaldo {
  fecha: Date;
  modulo?: string | null;
  usuario?: string | null;
  negocio?: string | null;
  accion: string;
  detalle?: string | null;
}

/** Libro de Excel con lo que se va a purgar (una hoja, encabezado fijo). */
export async function libroRespaldo(titulo: string, filas: FilaRespaldo[], corte: Date): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const h = wb.addWorksheet("Bitácora", { views: [{ state: "frozen", ySplit: 3 }] });
  h.addRow([titulo]).font = { bold: true, size: 13 };
  h.addRow([`Registros anteriores al ${corte.toLocaleDateString("es-MX")} · ${filas.length} en total`]);
  h.addRow(["Fecha", "Módulo", "Usuario", "Negocio", "Acción", "Detalle"]).font = { bold: true };
  for (const f of filas) {
    h.addRow([f.fecha, f.modulo ?? "", f.usuario ?? "", f.negocio ?? "", f.accion, f.detalle ?? ""]);
  }
  h.getColumn(1).numFmt = "dd/mm/yyyy hh:mm";
  [18, 14, 22, 16, 60, 50].forEach((w, i) => (h.getColumn(i + 1).width = w));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
