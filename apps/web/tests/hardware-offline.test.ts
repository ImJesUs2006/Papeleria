import { describe, expect, it } from "vitest";
import {
  bytesAbrirCajon,
  codificar,
  COMANDOS,
  parsearPeso,
  renglon,
  ticketEscPos,
} from "@/lib/hardware/escpos";
import { buscarEnCatalogo, destacadosDelCatalogo, porCodigo, type ProductoCatalogo } from "@/lib/offline/catalogo";

// ============================================================
// Paso 8: ESC/POS, báscula y catálogo offline.
// ============================================================

const contiene = (bytes: Uint8Array, secuencia: readonly number[]) =>
  Array.from(bytes).join(",").includes(secuencia.join(","));

describe("ESC/POS", () => {
  it("codifica acentos y ñ en PC850", () => {
    expect(codificar("ñ á É ¿")).toEqual([0xa4, 0x20, 0xa0, 0x20, 0x90, 0x20, 0xa8]);
  });

  it("alinea concepto e importe al ancho del papel", () => {
    const r = renglon("Cuaderno profesional", "$45.00", 32);
    expect(r).toHaveLength(32);
    expect(r.endsWith("$45.00")).toBe(true);
    expect(renglon("Un nombre larguísimo que no cabe en el renglón", "$1.00", 32)).toHaveLength(32);
  });

  it("arma un ticket con corte y, si se pide, abre el cajón", () => {
    const base = {
      negocio: "Papelería",
      folio: "F-1",
      fecha: "14/10/2026",
      items: [{ descripcion: "Lápiz", cantidad: 2, importe: 17 }],
      subtotal: 17,
      iva: 2.72,
      total: 19.72,
      metodoPago: "EFECTIVO",
      cambio: 0.28,
    };
    const sinCajon = ticketEscPos(base, "58mm");
    expect(contiene(sinCajon, COMANDOS.iniciar)).toBe(true);
    expect(contiene(sinCajon, COMANDOS.cortar)).toBe(true);
    expect(contiene(sinCajon, COMANDOS.abrirCajon)).toBe(false);
    expect(contiene(ticketEscPos(base, "58mm", { abrirCajon: true }), COMANDOS.abrirCajon)).toBe(true);
  });

  it("el pulso del cajón es ESC p 0", () => {
    expect(Array.from(bytesAbrirCajon()).slice(-5)).toEqual([...COMANDOS.abrirCajon]);
  });
});

describe("báscula", () => {
  it("entiende los formatos comunes", () => {
    expect(parsearPeso("ST,GS,+  0.500kg")).toBe(0.5);
    expect(parsearPeso("  1,250 kg")).toBe(1.25);
    expect(parsearPeso("750 g")).toBe(0.75);
    expect(parsearPeso("2.2 lb")).toBe(0.998);
  });

  it("descarta lecturas inestables o ilegibles", () => {
    expect(parsearPeso("US,GS,+  0.480kg")).toBeNull();
    expect(parsearPeso("")).toBeNull();
    expect(parsearPeso("ERROR")).toBeNull();
  });
});

const prod = (codigoItem: string, descripcion: string, extra: Partial<ProductoCatalogo> = {}): ProductoCatalogo => ({
  codigoItem,
  codigoBarras: null,
  descripcion,
  precioUnitario: 10,
  precioMayoreo: null,
  stockActual: 5,
  stockMinimo: 1,
  permiteDecimales: false,
  esServicio: false,
  usaSeries: false,
  favorito: false,
  idCategoria: null,
  tasaIva: null,
  exentoIva: false,
  tasaIeps: null,
  imagenUrl: null,
  ...extra,
});

describe("catálogo offline", () => {
  const catalogo = [
    prod("001", "Cuaderno Profesional", { codigoBarras: "7501234567890" }),
    prod("002", "Lápiz Hexagonal", { favorito: true }),
    prod("003", "Cuaderno Francés"),
  ];

  it("el escáner encuentra por código o por código de barras", () => {
    expect(porCodigo(catalogo, "7501234567890")?.codigoItem).toBe("001");
    expect(porCodigo(catalogo, "002")?.descripcion).toBe("Lápiz Hexagonal");
    expect(porCodigo(catalogo, "999")).toBeNull();
  });

  it("busca por palabras sin importar acentos ni mayúsculas", () => {
    expect(buscarEnCatalogo(catalogo, "cuaderno").map((p) => p.codigoItem)).toEqual(["001", "003"]);
    expect(buscarEnCatalogo(catalogo, "LAPIZ hex").map((p) => p.codigoItem)).toEqual(["002"]);
  });

  it("los favoritos encabezan el catálogo táctil sin red", () => {
    expect(destacadosDelCatalogo(catalogo)[0].codigoItem).toBe("002");
  });
});
