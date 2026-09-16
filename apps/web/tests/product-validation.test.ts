import { describe, expect, it } from "vitest";
import {
  PRODUCTO_INPUT_SCHEMA,
  PRODUCTO_PATCH_SCHEMA,
  sanitizeText,
  IMAGEN_BASE64_MAX,
} from "@/lib/validate-product";

const base = {
  codigoItem: "cuad-100",
  descripcion: "Cuaderno profesional",
  precioUnitario: 45.5,
  precioCompra: 30,
  stockActual: 10,
  stockMinimo: 3,
};

describe("PRODUCTO_INPUT_SCHEMA", () => {
  it("acepta un producto válido y normaliza el código", () => {
    const r = PRODUCTO_INPUT_SCHEMA.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.codigoItem).toBe("cuad-100");
      expect(r.data.precioUnitario).toBe(45.5);
      expect(r.data.stockMinimo).toBe(3);
    }
  });

  it("rechaza precio de venta menor al de compra", () => {
    const r = PRODUCTO_INPUT_SCHEMA.safeParse({ ...base, precioUnitario: 20, precioCompra: 30 });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toMatch(/no puede ser menor al de compra/i);
    }
  });

  it("permite venta igual a compra y venta sin compra definida", () => {
    expect(
      PRODUCTO_INPUT_SCHEMA.safeParse({ ...base, precioUnitario: 30, precioCompra: 30 }).success
    ).toBe(true);
    expect(
      PRODUCTO_INPUT_SCHEMA.safeParse({ ...base, precioCompra: null }).success
    ).toBe(true);
  });

  it("rechaza códigos con caracteres no permitidos", () => {
    const r = PRODUCTO_INPUT_SCHEMA.safeParse({ ...base, codigoItem: "código con espacios" });
    expect(r.success).toBe(false);
  });

  it("rechaza stock negativo o no entero", () => {
    expect(PRODUCTO_INPUT_SCHEMA.safeParse({ ...base, stockActual: -1 }).success).toBe(false);
    expect(PRODUCTO_INPUT_SCHEMA.safeParse({ ...base, stockActual: 1.5 }).success).toBe(false);
  });

  it("aplica valores por defecto de stock cuando faltan", () => {
    const r = PRODUCTO_INPUT_SCHEMA.safeParse({
      codigoItem: "PROD-1",
      descripcion: "Producto",
      precioUnitario: 10,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.stockActual).toBe(0);
      expect(r.data.stockMinimo).toBe(5);
    }
  });

  it("rechaza imágenes base64 por encima del límite", () => {
    const r = PRODUCTO_INPUT_SCHEMA.safeParse({
      ...base,
      imagenMime: "image/png",
      imagenBase64: "A".repeat(IMAGEN_BASE64_MAX + 1),
    });
    expect(r.success).toBe(false);
  });

  it("rechaza mime de imagen no permitido", () => {
    const r = PRODUCTO_INPUT_SCHEMA.safeParse({
      ...base,
      imagenMime: "image/gif",
      imagenBase64: "AAAA",
    });
    expect(r.success).toBe(false);
  });
});

describe("PRODUCTO_PATCH_SCHEMA", () => {
  it("permite parches parciales", () => {
    expect(PRODUCTO_PATCH_SCHEMA.safeParse({ stockActual: 7 }).success).toBe(true);
    expect(PRODUCTO_PATCH_SCHEMA.safeParse({ precioUnitario: 99 }).success).toBe(true);
  });

  it("valida venta contra compra cuando se envían ambos", () => {
    expect(PRODUCTO_PATCH_SCHEMA.safeParse({ precioUnitario: 5, precioCompra: 10 }).success).toBe(
      false
    );
  });
});

describe("sanitizeText", () => {
  it("elimina etiquetas y ángulos para prevenir XSS almacenado", () => {
    expect(sanitizeText("<script>alert(1)</script>Lápiz")).toBe("alert(1)Lápiz");
    expect(sanitizeText("Lápiz <b>HB</b>")).toBe("Lápiz HB");
    expect(sanitizeText("a < b")).toBe("a  b".replace(/\s{2,}/g, " "));
  });

  it("recorta espacios y colapsa espacios múltiples", () => {
    expect(sanitizeText("  hola   mundo  ")).toBe("hola mundo");
  });

  it("elimina caracteres de control", () => {
    expect(sanitizeText("linea\u0000uno")).toBe("linea uno");
  });
});
