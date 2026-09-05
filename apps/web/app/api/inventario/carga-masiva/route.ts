import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { parseExcelBuffer } from "@/lib/excel";
import { getSession } from "@/lib/auth";

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

const COLUMN_MAP: Record<string, string> = {
  // Permite encabezados en español o inglés
  codigo: "codigoItem",
  "código": "codigoItem",
  cod: "codigoItem",
  sku: "codigoItem",
  descripcion: "descripcion",
  "descripción": "descripcion",
  nombre: "descripcion",
  precio: "precioUnitario",
  "precio unitario": "precioUnitario",
  precioventa: "precioUnitario",
  stock: "stockActual",
  existencia: "stockActual",
  cantidad: "stockActual",
  stockminimo: "stockMinimo",
  "stock mínimo": "stockMinimo",
  minimo: "stockMinimo",
  ubicacion: "ubicacionEstante",
  "ubicación": "ubicacionEstante",
  estante: "ubicacionEstante",
  ubicacionestante: "ubicacionEstante",
  proveedor: "proveedor",
  proveedora: "proveedor",
  codigobarras: "codigoBarras",
  "código barras": "codigoBarras",
  barcode: "codigoBarras",
  tipoimpresion: "tipoImpresion",
  "tipo impresión": "tipoImpresion",
  impresion: "tipoImpresion",
};

function mapColumns(
  headers: string[]
): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const header of headers) {
    const normalized = header.toLowerCase().trim().replace(/[^a-záéíóúñü\s]/g, "");
    const mapped = COLUMN_MAP[normalized];
    if (mapped) {
      mapping[header] = mapped;
    }
  }
  return mapping;
}

function validateRow(
  raw: Record<string, any>,
  columnMap: Record<string, string>,
  rowNum: number
): { errors: ValidationError[]; values: Record<string, any> } {
  const errors: ValidationError[] = [];
  const values: Record<string, any> = {};

  // Map columns
  for (const [excelCol, dbField] of Object.entries(columnMap)) {
    values[dbField] = raw[excelCol];
  }

  // Validate required fields
  if (!values.codigoItem || String(values.codigoItem).trim() === "") {
    errors.push({ row: rowNum, field: "codigoItem", message: "Código vacío" });
  } else {
    values.codigoItem = String(values.codigoItem).trim();
  }

  if (!values.descripcion || String(values.descripcion).trim() === "") {
    errors.push({ row: rowNum, field: "descripcion", message: "Descripción vacía" });
  } else {
    values.descripcion = String(values.descripcion).trim();
  }

  // Parse precio
  const precioRaw = values.precioUnitario;
  const precio = parseFloat(String(precioRaw).replace(/[$,]/g, ""));
  if (isNaN(precio) || precio < 0) {
    errors.push({
      row: rowNum,
      field: "precioUnitario",
      message: `Precio inválido: "${precioRaw}"`,
    });
  }
  values.precioUnitario = precio;

  // Parse stock
  const stockRaw = values.stockActual;
  const stock = parseInt(String(stockRaw), 10);
  if (isNaN(stock) || stock < 0) {
    errors.push({
      row: rowNum,
      field: "stockActual",
      message: `Stock inválido: "${stockRaw}"`,
    });
  }
  values.stockActual = stock;

  // Optional fields with defaults
  values.stockMinimo = parseInt(String(values.stockMinimo || "5"), 10) || 5;
  values.ubicacionEstante = String(values.ubicacionEstante || "").trim() || null;
  values.proveedor = String(values.proveedor || "").trim() || null;
  values.codigoBarras = String(values.codigoBarras || "").trim() || null;

  // Validate tipoImpresion enum
  const tiposValidos = ["BLANCO_NEGRO", "COLOR", "PLOTTER"];
  const tipoRaw = String(values.tipoImpresion || "").trim().toUpperCase().replace(/\s+/g, "_");
  values.tipoImpresion = tiposValidos.includes(tipoRaw) ? tipoRaw : null;

  return { errors, values };
}

export async function POST(request: Request) {
  try {
    // Auth check
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    if (session.rol !== "ADMINISTRADORA") {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No se proporcionó archivo" },
        { status: 400 }
      );
    }

    // Validate file type
    const validExtensions = [".xlsx", ".xls", ".csv"];
    const fileName = file.name.toLowerCase();
    if (!validExtensions.some((ext) => fileName.endsWith(ext))) {
      return NextResponse.json(
        { error: "Formato no soportado. Usa .xlsx, .xls o .csv" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { headers, rows, sheetName } = parseExcelBuffer(buffer);

    if (rows.length === 0) {
      return NextResponse.json({
        totalRows: 0,
        successCount: 0,
        errorCount: 0,
        errors: [{ row: 1, field: "file", message: "El archivo no contiene datos" }],
      });
    }

    const columnMap = mapColumns(headers);

    // Check that at least codigo and descripcion are mappable
    const mappedFields = new Set(Object.values(columnMap));
    if (!mappedFields.has("codigoItem") || !mappedFields.has("descripcion")) {
      return NextResponse.json({
        totalRows: rows.length,
        successCount: 0,
        errorCount: 1,
        errors: [
          {
            row: 1,
            field: "headers",
            message: `Columnas no reconocidas: [${headers.join(", ")}]. Se necesita al menos "codigo" y "descripcion".`,
          },
        ],
      });
    }

    const allProducts: Record<string, any>[] = [];
    const allErrors: ValidationError[] = [];

    rows.forEach((row, i) => {
      const rowNum = i + 2; // +2: 1-indexed + header row
      const { errors, values } = validateRow(row, columnMap, rowNum);

      if (errors.length > 0) {
        allErrors.push(...errors);
      } else {
        allProducts.push(values);
      }
    });

    // Batch upsert with transaction
    if (allProducts.length > 0) {
      await prisma.$transaction(
        allProducts.map((p) =>
          prisma.producto.upsert({
            where: { codigoItem: p.codigoItem },
            update: {
              descripcion: p.descripcion,
              precioUnitario: p.precioUnitario,
              stockActual: p.stockActual,
              stockMinimo: p.stockMinimo,
              ubicacionEstante: p.ubicacionEstante,
              proveedor: p.proveedor,
              codigoBarras: p.codigoBarras,
              tipoImpresion: p.tipoImpresion,
            },
            create: {
              codigoItem: p.codigoItem,
              descripcion: p.descripcion,
              precioUnitario: p.precioUnitario,
              stockActual: p.stockActual,
              stockMinimo: p.stockMinimo,
              ubicacionEstante: p.ubicacionEstante,
              proveedor: p.proveedor,
              codigoBarras: p.codigoBarras,
              tipoImpresion: p.tipoImpresion,
            },
          })
        )
      );
    }

    await prisma.bitacoraLog.create({
      data: {
        idUsuario: session.idPersona,
        accion: `Carga masiva Excel: ${allProducts.length} productos insertados, ${allErrors.length} errores`,
        moduloSistema: "CARGA_MASIVA",
        jsonPayload: {
          totalRows: rows.length,
          successCount: allProducts.length,
          errorCount: allErrors.length,
          fileName: file.name,
          sheetName,
          columnsDetected: Object.entries(columnMap).map(
            ([excel, db]) => `${excel} -> ${db}`
          ),
        },
      },
    });

    return NextResponse.json({
      totalRows: rows.length,
      successCount: allProducts.length,
      errorCount: allErrors.length,
      errors: allErrors.slice(0, 50),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Error al procesar carga masiva" },
      { status: 500 }
    );
  }
}
