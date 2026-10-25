import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { COLUMNAS_CARGA, EJEMPLOS_PLANTILLA, mapearColumnas, normalizarEncabezado, validarRenglon } from "@/lib/carga-masiva";
import { buildPlantillaInventario, parseExcelBuffer } from "@/lib/excel";

// ============================================================
// Fase D: carga masiva con columnas nuevas y plantilla generada.
// ============================================================

const renglon = (datos: Record<string, unknown>) => {
  const mapa = mapearColumnas(Object.keys(datos));
  return validarRenglon(datos, mapa, 2);
};

describe("reconocimiento de columnas", () => {
  it("acepta acentos, mayúsculas y sinónimos", () => {
    expect(normalizarEncabezado("Stock Mínimo")).toBe("stockminimo");
    const mapa = mapearColumnas(["CÓDIGO", "Nombre", "Precio", "Costo", "Existencia", "Se compra por", "Piezas", "Columna rara"]);
    expect(mapa).toMatchObject({
      CÓDIGO: "codigoItem",
      Nombre: "descripcion",
      Precio: "precioUnitario",
      Costo: "precioCompra",
      Existencia: "stockActual",
      "Se compra por": "unidadCompra",
      Piezas: "piezasPorUnidad",
    });
    expect(mapa["Columna rara"]).toBeUndefined();
  });

  it("los encabezados de la plantilla se reconocen todos", () => {
    const mapa = mapearColumnas(COLUMNAS_CARGA.map((c) => c.encabezado));
    expect(Object.keys(mapa)).toHaveLength(COLUMNAS_CARGA.length);
  });
});

describe("validación de renglones", () => {
  it("un renglón completo produce el producto", () => {
    const { errores, producto } = renglon({
      Código: "papas-45",
      Descripción: "Papas fritas 45 g",
      "Precio de venta": "$22",
      "Costo por pieza": 15,
      Existencia: 48,
      "Se compra por": "Paquete",
      "Piezas por unidad": 24,
      "Mayoreo desde": 12,
      "Precio mayoreo": 20,
    });
    expect(errores).toEqual([]);
    expect(producto).toMatchObject({
      codigoItem: "PAPAS-45",
      precioUnitario: 22,
      precioCompra: 15,
      stockActual: 48,
      unidadCompra: "Paquete",
      piezasPorUnidad: 24,
      escalasPrecio: [{ desde: 12, precio: 20, nombre: "Mayoreo" }],
    });
  });

  it("solo trae las columnas presentes (no borra lo que no viene)", () => {
    const { producto } = renglon({ Código: "A1", Descripción: "Algo", Precio: 10 });
    expect(producto).not.toHaveProperty("ubicacionEstante");
    expect(producto).not.toHaveProperty("stockActual");
    expect(producto).not.toHaveProperty("proveedor");
  });

  it("detecta los errores típicos", () => {
    const casos: Array<[Record<string, unknown>, RegExp]> = [
      [{ Código: "", Descripción: "X1", Precio: 1 }, /Código vacío/],
      [{ Código: "A B", Descripción: "X1", Precio: 1 }, /Código inválido/],
      [{ Código: "A", Descripción: "X1", Precio: "diez" }, /Precio inválido/],
      [{ Código: "A", Descripción: "X1", Precio: 10, Costo: 20 }, /costo por pieza es mayor/],
      [{ Código: "A", Descripción: "X1", Precio: 10, Existencia: 1.5 }, /márcalo como granel/],
      [{ Código: "A", Descripción: "X1", Precio: 10, "Se vende": "a veces" }, /pieza, granel o servicio/],
      [{ Código: "A", Descripción: "X1", Precio: 10, "Se vende": "granel", "Control extra": "series" }, /series solo aplican/],
      [{ Código: "A", Descripción: "X1", Precio: 10, "Control extra": "lotes", Existencia: 5 }, /Lotes y series/],
      [{ Código: "A", Descripción: "X1", Precio: 10, "Se compra por": "Caja", "Piezas por unidad": 1 }, /Debe ser más de 1/],
      [{ Código: "A", Descripción: "X1", Precio: 10, "Mayoreo desde": 12, "Precio mayoreo": 15 }, /menor al de menudeo/],
      [{ Código: "A", Descripción: "X1", Precio: 10, Caducidad: "pronto" }, /Fecha inválida/],
    ];
    for (const [datos, esperado] of casos) {
      const { errores, producto } = renglon(datos);
      expect(producto, JSON.stringify(datos)).toBeNull();
      expect(errores.map((e) => e.message).join(" | ")).toMatch(esperado);
    }
  });

  it("granel guarda la unidad de venta y admite decimales", () => {
    const { producto } = renglon({ Código: "LISTON", Descripción: "Listón", Precio: 6, "Se vende": "granel", "Unidad a granel": "m", Existencia: 120.5 });
    expect(producto).toMatchObject({ permiteDecimales: true, unidadVenta: "m", stockActual: 120.5 });
  });
});

describe("plantilla descargable", () => {
  it("se genera, se vuelve a leer y sus ejemplos son válidos", async () => {
    const buffer = await buildPlantillaInventario();
    const { headers, rows } = await parseExcelBuffer(buffer, "plantilla.xlsx");
    expect(headers).toEqual(COLUMNAS_CARGA.map((c) => c.encabezado));
    expect(rows).toHaveLength(EJEMPLOS_PLANTILLA.length);
    const mapa = mapearColumnas(headers);
    rows.forEach((r, i) => expect(validarRenglon(r, mapa, i + 2).errores).toEqual([]));

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    expect(wb.getWorksheet("Instrucciones")).toBeTruthy();
  });
});
