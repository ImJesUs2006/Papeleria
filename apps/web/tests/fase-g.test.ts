import { describe, expect, it } from "vitest";
import { normalizarPagos, PagoError } from "@/lib/pagos";
import { calcularImpuestos, tasasProducto } from "@/lib/impuestos";
import { aliasAnonimo, anonimizarTexto, NOMBRE_ANONIMO } from "@/lib/usuarios";
import { fechaCorte, mesesValidos } from "@/lib/bitacora-purga";

describe("cobro en efectivo exige lo recibido", () => {
  it("en línea, sin monto recibido no procede", () => {
    expect(() => normalizarPagos({ metodoPago: "EFECTIVO" }, 100, { exigirRecibido: true })).toThrow(PagoError);
  });
  it("con lo recibido calcula el cambio", () => {
    expect(normalizarPagos({ metodoPago: "EFECTIVO", montoRecibido: 200 }, 150, { exigirRecibido: true }).cambio).toBe(50);
  });
  it("lo recibido debe cubrir el efectivo", () => {
    expect(() => normalizarPagos({ metodoPago: "EFECTIVO", montoRecibido: 90 }, 100, { exigirRecibido: true })).toThrow(/no cubre/);
  });
  it("en pago dividido solo cuenta la parte en efectivo", () => {
    const r = normalizarPagos(
      { pagos: [{ metodo: "EFECTIVO", monto: 40 }, { metodo: "TARJETA", monto: 60 }], montoRecibido: 50 },
      100,
      { exigirRecibido: true }
    );
    expect(r.cambio).toBe(10);
    expect(() =>
      normalizarPagos({ pagos: [{ metodo: "EFECTIVO", monto: 40 }, { metodo: "TARJETA", monto: 60 }] }, 100, { exigirRecibido: true })
    ).toThrow(PagoError);
  });
  it("sin efectivo no se pide nada", () => {
    expect(normalizarPagos({ metodoPago: "TARJETA" }, 100, { exigirRecibido: true }).cambio).toBeNull();
  });
  it("las ventas sin conexión ya registradas no se rechazan (no se exige)", () => {
    expect(normalizarPagos({ metodoPago: "EFECTIVO" }, 100).cambio).toBeNull();
  });
});

describe("negocio que no cobra impuestos", () => {
  it("todo va a tasa 0, aunque el producto tenga tasa propia o IEPS", () => {
    expect(tasasProducto({ tasaIva: 16, tasaIeps: 8 }, 16, false)).toEqual({ tasaIva: 0, tasaIeps: 0 });
  });
  it("y el total es el precio de lista", () => {
    const r = calcularImpuestos([{ importe: 100, ...tasasProducto({}, 16, false) }], { preciosIncluyenIva: false });
    expect(r).toMatchObject({ total: 100, iva: 0, subtotal: 100 });
  });
  it("cuando sí cobra, se respeta la tasa del negocio y la del producto", () => {
    expect(tasasProducto({}, 8).tasaIva).toBe(8);
    expect(tasasProducto({ exentoIva: true }, 16).tasaIva).toBe(0);
  });
});

describe("anonimizar a una persona eliminada", () => {
  const datos = { nombre: "María López", username: "maria", alias: aliasAnonimo("1234567890abcdef") };
  it("quita su nombre y usuario de los textos de bitácora", () => {
    expect(anonimizarTexto("Retiro de $200 por María López (maria)", datos)).toBe(
      `Retiro de $200 por ${NOMBRE_ANONIMO} (eliminado-12345678)`
    );
  });
  it("no toca textos que no la mencionan", () => {
    expect(anonimizarTexto("Corte de caja de Juan", datos)).toBe("Corte de caja de Juan");
  });
  it("ignora nombres demasiado cortos para no destrozar otros textos", () => {
    expect(anonimizarTexto("Venta de lápiz", { nombre: "Al", username: "al", alias: "x" })).toBe("Venta de lápiz");
  });
});

describe("purga de bitácora", () => {
  it("solo antigüedades permitidas; si no, 3 meses", () => {
    expect(mesesValidos(1)).toBe(1);
    expect(mesesValidos(24)).toBe(24);
    expect(mesesValidos(2)).toBe(3);
    expect(mesesValidos("x")).toBe(3);
  });
  it("la fecha de corte resta meses de calendario", () => {
    expect(fechaCorte(1, new Date(2026, 9, 25)).getMonth()).toBe(8);
    expect(fechaCorte(12, new Date(2026, 9, 25)).getFullYear()).toBe(2025);
  });
});
