import ExcelJS from "exceljs";

// ============================================================
// Exportación Excel ejecutiva con exceljs.
//   - Encabezado con color de acento y fila congelada.
//   - Auto-filtro y autoancho de columnas.
//   - Formato de moneda para columnas declaradas.
//   - Fila de totales opcional sumando columnas numéricas.
// ============================================================

export type CellValue = string | number | boolean | Date | null | undefined;

export interface ExportColumn {
  header: string;
  /** Formato de número Excel, ej. '"$"#,##0.00' */
  numFmt?: string;
  /** Ancho fijo; si se omite se autocalcula. */
  width?: number;
  /** Suma esta columna en la fila de totales. */
  total?: boolean;
}

/**
 * Formato condicional por celda.
 * `col` (Stock Actual, 0-based) se pinta en rojo si
 * `col <= thresholdCol` (Stock Mínimo, 0-based).
 */
export interface ExportConditional {
  col: number;
  thresholdCol: number;
}

export interface BuildWorkbookOptions {
  sheetName: string;
  columns: ExportColumn[];
  rows: CellValue[][];
  /** Color ARGB del encabezado. Por defecto gris oscuro. */
  headerColor?: string;
  /** Texto de la celda de encabezado en la fila de totales. */
  totalLabel?: string;
  /** Resaltados condicionales a aplicar a las filas de datos. */
  conditionals?: ExportConditional[];
  /** Hojas adicionales (ej. Kardex de movimientos de inventario, Fase 3). */
  extraSheets?: Array<{ name: string; columns: ExportColumn[]; rows: CellValue[][] }>;
}

export async function buildStyledWorkbook(opts: BuildWorkbookOptions): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Papelería SaaS";
  wb.created = new Date();

  const ws = wb.addWorksheet(opts.sheetName, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const headerColor = (opts.headerColor || "1F2937").replace("#", "");
  const nCols = opts.columns.length;

  ws.columns = opts.columns.map((col, i) => {
    const maxLen = Math.max(
      col.header.length,
      ...opts.rows.map((r) => String(r[i] ?? "").length)
    );
    return {
      header: col.header,
      key: `${i}-${col.header}`,
      width: col.width ?? Math.min(Math.max(maxLen + 3, 10), 45),
      style: col.numFmt ? { numFmt: col.numFmt } : undefined,
    };
  });

  const headerRow = ws.getRow(1);
  headerRow.height = 20;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${headerColor}` },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FF9CA3AF" } },
    };
  });

  // Filas de datos.
  for (const row of opts.rows) {
    const fila = ws.addRow(row);

    // Formato condicional: alerta en rojo cuando stockActual <= stockMinimo.
    for (const cond of opts.conditionals ?? []) {
      const v = row[cond.col];
      const limite = row[cond.thresholdCol];
      if (typeof v === "number" && typeof limite === "number" && v <= limite) {
        const celda = fila.getCell(cond.col + 1);
        celda.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFEE2E2" },
        };
        celda.font = { bold: true, color: { argb: "FFB91C1C" } };
      }
    }
  }

  // Fila de totales.
  if (opts.totalLabel !== undefined || opts.columns.some((c) => c.total)) {
    const totalRow = ws.addRow(
      opts.columns.map((col, i) => {
        if (i === 0) return opts.totalLabel ?? "TOTAL";
        if (!col.total) return null;
        return opts.rows.reduce((sum, r) => {
          const v = r[i];
          return sum + (typeof v === "number" && Number.isFinite(v) ? v : 0);
        }, 0);
      })
    );
    totalRow.font = { bold: true };
    totalRow.eachCell((cell, colNumber) => {
      const col = opts.columns[colNumber - 1];
      if (col?.numFmt) cell.numFmt = col.numFmt;
      cell.border = { top: { style: "double", color: { argb: "FF111827" } } };
    });
  }

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: nCols },
  };

  // Hojas adicionales (Kardex): mismas reglas de estilo básico.
  for (const extra of opts.extraSheets ?? []) {
    const wsExtra = wb.addWorksheet(extra.name, {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    wsExtra.columns = extra.columns.map((col, i) => {
      const maxLen = Math.max(
        col.header.length,
        ...extra.rows.map((r) => String(r[i] ?? "").length)
      );
      return {
        header: col.header,
        key: `x-${i}-${col.header}`,
        width: col.width ?? Math.min(Math.max(maxLen + 3, 10), 45),
        style: col.numFmt ? { numFmt: col.numFmt } : undefined,
      };
    });
    const hRow = wsExtra.getRow(1);
    hRow.height = 20;
    hRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: `FF${headerColor}` },
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });
    for (const row of extra.rows) {
      wsExtra.addRow(row);
    }
    wsExtra.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: extra.columns.length },
    };
  }

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}