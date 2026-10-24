import { describe, expect, it } from "vitest";
import { armarPaquete, claveDe, faltantesEmisor, validarFolioFiscal } from "@/lib/factura-manual";

describe("factura manual (portal del SAT)", () => {
  it("detecta lo que le falta al emisor", () => {
    expect(faltantesEmisor(null)).toHaveLength(4);
    expect(faltantesEmisor({ rfc: "EKU9003173C9", razonSocial: "X", regimenFiscal: "601 - General", cp: "06600" })).toEqual([]);
    expect(claveDe("626 - Régimen Simplificado de Confianza")).toBe("626");
  });

  it("valida el folio fiscal (UUID) que da el SAT", () => {
    expect(validarFolioFiscal("1a2b3c4d-1234-abcd-1234-1a2b3c4d5e6f")).toEqual({
      ok: true,
      valor: "1A2B3C4D-1234-ABCD-1234-1A2B3C4D5E6F",
    });
    expect(validarFolioFiscal("12345").ok).toBe(false);
  });

  it("arma conceptos con valor unitario sin IVA y la forma de pago SAT", () => {
    const p = armarPaquete({
      folio: "F-000001",
      emisor: { rfc: "EKU9003173C9", razonSocial: "PAPELERIA", regimenFiscal: "601", cp: "06600" },
      receptor: {
        rfc: "XIA190128J61",
        razonSocial: "XENON INDUSTRIAL",
        regimenFiscal: "601",
        codigoPostalFiscal: "76000",
        usoCfdi: "G03",
      },
      metodoPagoVenta: "TRANSFERENCIA",
      lineas: [{ descripcion: "Cuaderno", cantidad: 3, subtotalLinea: 100, ivaLinea: 16, iepsLinea: 0, esServicio: false }],
      totales: { subtotal: 100, iva: 16, ieps: 0, total: 116 },
    });
    expect(p.comprobante.formaPago).toMatch(/^03 /);
    expect(p.conceptos[0]).toMatchObject({
      claveProdServ: "01010101",
      claveUnidad: "H87 · Pieza",
      valorUnitario: 33.333333,
      importe: 100,
      iva: 16,
      ieps: null,
    });
    expect(p.receptor.usoCfdi).toBe("G03 · Gastos en general");
    expect(p.emisor.regimenFiscal).toContain("General de Ley Personas Morales");
  });
});
