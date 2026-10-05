import { describe, expect, it } from "vitest";
import { construirTicketPDF } from "@/lib/pdf";

const RESULTADO = {
  folioVenta: "F-2026-TEST",
  fechaHora: "2026-01-15T12:30:00.000Z",
  offline: false,
  metodoPago: "EFECTIVO",
  nombreCliente: "María López",
  subtotal: 100,
  iva: 16,
  totalNeto: 116,
  cambio: 0,
  items: [
    { codigoItem: "P001", descripcion: "Lápiz HB", cantidad: 2, precioUnitario: 50, importe: 100 },
  ],
};

const decodificar = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => String.fromCharCode(b)).join("");

/** Objeto n del PDF (1-indexado). */
function objeto(pdf: string, n: number): string {
  const re = new RegExp(`(?:^|\\n)${n} 0 obj\\n([\\s\\S]*?)\\nendobj`);
  const m = pdf.match(re);
  expect(m, `no se encontró el objeto ${n}`).toBeTruthy();
  return m![1];
}

/**
 * FASE 11/FASE 12 · El PDF del comprobante debe ser un documento válido:
 * referencias de objetos correctas, streams con /Length y xref coherente.
 * (Antes el /Contents apuntaba un objeto de más y los streams no tenían
 *  dictionary, por lo que el archivo no abría en lectores PDF reales.)
 */
describe("construirTicketPDF · estructura del documento", () => {
  const pdf = decodificar(construirTicketPDF(RESULTADO as any, "Papelería El Lápiz"));

  it("empieza con la cabecera y termina con %%EOF", () => {
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("declara catálogo, páginas y fuentes WinAnsi", () => {
    expect(objeto(pdf, 1)).toContain("/Type /Catalog");
    expect(objeto(pdf, 2)).toContain("/Type /Pages");
    // Fuentes con /Encoding: sin esto los acentos rompen el texto.
    expect(pdf).toContain("/Encoding /WinAnsiEncoding");
  });

  it("cada /Contents apunta al objeto stream de esa misma página", () => {
    const paginas = Number(objeto(pdf, 2).match(/\/Count (\d+)/)?.[1] ?? 1);
    expect(paginas).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < paginas; i++) {
      const nPagina = 3 + i * 2;
      const nStream = 4 + i * 2;
      expect(objeto(pdf, nPagina)).toContain(`/Contents ${nStream} 0 R`);
      // El objeto referenciado debe existir y ser un stream con /Length.
      const stream = objeto(pdf, nStream);
      expect(stream).toContain("<< /Length");
      expect(stream).toContain("stream");
      expect(stream).toContain("endstream");
    }
  });

  it("las fuentes referenciadas por /Resources existen", () => {
    const paginas = Number(objeto(pdf, 2).match(/\/Count (\d+)/)?.[1] ?? 1);
    const pagina = objeto(pdf, 3);
    const refs = [...pagina.matchAll(/\/F\d+ (\d+) 0 R/g)].map((m) => Number(m[1]));
    expect(refs.length).toBe(2);
    for (const ref of refs) {
      expect(objeto(pdf, ref)).toContain("/Type /Font");
    }
    // No deben chocar con los objetos de página/stream.
    const ultimoStream = 4 + (paginas - 1) * 2;
    expect(Math.min(...refs)).toBeGreaterThan(ultimoStream);
  });

  it("el /Length de cada stream coincide con su contenido", () => {
    const match = pdf.match(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/);
    expect(match).toBeTruthy();
    const [, largo, contenido] = match!;
    expect(Number(largo)).toBe(contenido.length);
  });

  it("el xref apunta al inicio real de la tabla", () => {
    const xrefOfs = Number(pdf.match(/startxref\n(\d+)/)?.[1]);
    expect(Number.isFinite(xrefOfs)).toBe(true);
    expect(pdf.slice(xrefOfs, xrefOfs + 4)).toBe("xref");
  });

  it("las entradas del xref apuntan al inicio de cada objeto", () => {
    const xrefOfs = Number(pdf.match(/startxref\n(\d+)/)?.[1]);
    const tabla = pdf.slice(xrefOfs);
    const offsets = [...tabla.matchAll(/^(\d{10}) 00000 n /gm)].map((m) => Number(m[1]));
    expect(offsets.length).toBeGreaterThan(0);
    offsets.forEach((o, i) => {
      expect(pdf.slice(o, o + 20)).toMatch(new RegExp(`^${i + 1} 0 obj`));
    });
  });

  it("incluye los importes del ticket", () => {
    expect(pdf).toContain("F-2026-TEST");
    expect(pdf).toContain("$116.00");
  });
});

describe("construirTicketPDF · contenido", () => {
  it("no rompe con importes ausentes o inválidos", () => {
    const pdf = decodificar(
      construirTicketPDF(
        {
          ...RESULTADO,
          items: [{ codigoItem: "X", descripcion: "Sin precio", cantidad: 1 }],
          totalNeto: undefined as any,
          subtotal: null as any,
        } as any,
        "Negocio"
      )
    );
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("$0.00");
  });

  it("genera varias páginas sin repetir números de objeto", () => {
    const items = Array.from({ length: 120 }, (_, i) => ({
      codigoItem: `P${i}`,
      descripcion: `Artículo de prueba número ${i}`,
      cantidad: 1,
      precioUnitario: 10,
      importe: 10,
    }));
    const pdf = decodificar(construirTicketPDF({ ...RESULTADO, items } as any, "Negocio"));
    const paginas = Number(objeto(pdf, 2).match(/\/Count (\d+)/)?.[1] ?? 1);
    expect(paginas).toBeGreaterThan(1);
    // Cada objeto aparece una sola vez.
    const nums = [...pdf.matchAll(/(?:^|\n)(\d+) 0 obj\n/g)].map((m) => Number(m[1]));
    expect(new Set(nums).size).toBe(nums.length);
  });
});