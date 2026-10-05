import { describe, expect, it } from "vitest";
import {
  calcularNivel,
  equivalenciaPuntos,
  puntosAlcanzan,
  puntosGanadosPorCompra,
  puntosRequeridos,
  MAYOREO_MIN_PESOS,
} from "@/lib/fidelidad";
import { construirTicketPDF } from "@/lib/pdf";

describe("Fase 12 · fidelidad (funciones puras)", () => {
  it("nivel Menudeo/Mayoreo según el historial", () => {
    expect(calcularNivel(0)).toBe("MENUDEO");
    expect(calcularNivel(1999.99)).toBe("MENUDEO");
    expect(calcularNivel(MAYOREO_MIN_PESOS)).toBe("MAYOREO");
    expect(calcularNivel(5000)).toBe("MAYOREO");
    expect(calcularNivel(NaN)).toBe("MENUDEO");
    expect(calcularNivel(-50)).toBe("MENUDEO");
  });

  it("gana 1 punto por cada $100 (pesosCompraPorPunto) en compras normales", () => {
    expect(puntosGanadosPorCompra(0, 100)).toBe(0);
    expect(puntosGanadosPorCompra(99.99, 100)).toBe(0);
    expect(puntosGanadosPorCompra(100, 100)).toBe(1);
    expect(puntosGanadosPorCompra(130.5, 100)).toBe(1);
    expect(puntosGanadosPorCompra(250, 100)).toBe(2);
    // Tasa configurable (p.ej. 1 pt por cada $50).
    expect(puntosGanadosPorCompra(50, 50)).toBe(1);
  });

  it("calcula los puntos necesarios para cubrir la venta (redondea hacia arriba)", () => {
    expect(puntosRequeridos(14.5, 1)).toBe(15);
    expect(puntosRequeridos(100, 1)).toBe(100);
    expect(puntosRequeridos(1, 1)).toBe(1);
    // Valor del punto = $5: una venta de $12 pide 3 puntos.
    expect(puntosRequeridos(12, 5)).toBe(3);
    // Protección ante valores inválidos.
    expect(puntosRequeridos(10, 0)).toBe(10);
  });

  it("equivalencia en pesos del saldo de puntos", () => {
    expect(equivalenciaPuntos(0, 1)).toBe(0);
    expect(equivalenciaPuntos(100, 1)).toBe(100);
    expect(equivalenciaPuntos(50, 2)).toBe(100);
    expect(equivalenciaPuntos(-10, 1)).toBe(0);
  });

  it("puntosAlcanzan valida el saldo contra el total", () => {
    expect(puntosAlcanzan(14.5, 15, 1)).toBe(true);
    expect(puntosAlcanzan(14.5, 14, 1)).toBe(false);
  });
});

describe("Fase 12 · PDF sin dependencias", () => {
  const resultado = {
    folioVenta: "F-20261004-ABCD",
    totalNeto: 116,
    subtotal: 100,
    iva: 16,
    cambio: 4,
    metodoPago: "PUNTOS_MONEDERO",
    nombreCliente: "María López",
    fechaHora: new Date().toISOString(),
    offline: false,
    items: [{ descripcion: "Lápiz HB", cantidad: 1, precioUnitario: 100, importe: 116 }],
  };

  it("genera un blob PDF con encabezado válido y tipografías base", () => {
    const bytes = construirTicketPDF(resultado, "Papelería El Águila");
    const encabezado = String.fromCharCode(...bytes.slice(0, 8));
    expect(encabezado).toBe("%PDF-1.4");

    const ascii = new TextDecoder("latin1").decode(bytes);
    expect(ascii).toContain("/Type /Font");
    expect(ascii).toContain("/BaseFont /Helvetica");
    expect(ascii).toContain("/BaseFont /Helvetica-Bold");
    // Nota: el acento en "El Águila" sobrevive por codificación WinAnsi.
    expect(ascii).toContain("PAPELER");
    expect(ascii).toMatch(/%%EOF/);
    expect(ascii).toMatch(/startxref\n\d+\n%%EOF/);
  });

  it("incluye totales, cambio a entregar y cliente en el stream", () => {
    const ascii = new TextDecoder("latin1").decode(construirTicketPDF(resultado, "Tienda"));
    expect(ascii).toContain("CAMBIO A ENTREGAR");
    expect(ascii).toContain("María López");
    // Busca partes del folio y del total.
    expect(ascii).toContain("F-20261004-ABCD");
    expect(ascii).toContain("116.00");
  });
});