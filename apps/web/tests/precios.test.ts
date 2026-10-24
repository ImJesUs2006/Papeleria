import { describe, expect, it } from "vitest";
import {
  describirEscalas,
  precioPorCantidad,
  siguienteEscala,
  validarEscalas,
} from "@/lib/precios";

const lapiz = {
  precioUnitario: 5,
  precioMayoreo: null,
  escalasPrecio: [
    { desde: 12, precio: 4, nombre: "Docena" },
    { desde: 100, precio: 3.5, nombre: "Caja" },
  ],
};

describe("precioPorCantidad", () => {
  it("cobra menudeo hasta llegar a la escala", () => {
    expect(precioPorCantidad(lapiz, 1)).toBe(5);
    expect(precioPorCantidad(lapiz, 11)).toBe(5);
    expect(precioPorCantidad(lapiz, 12)).toBe(4);
    expect(precioPorCantidad(lapiz, 99)).toBe(4);
    expect(precioPorCantidad(lapiz, 100)).toBe(3.5);
  });

  it("cliente mayorista: el mejor precio sin importar la cantidad", () => {
    expect(precioPorCantidad(lapiz, 1, true)).toBe(3.5);
    expect(precioPorCantidad({ precioUnitario: 10, precioMayoreo: 8 }, 1, true)).toBe(8);
    expect(precioPorCantidad({ precioUnitario: 10, precioMayoreo: null }, 1, true)).toBe(10);
  });

  it("datos guardados inválidos no rompen la venta (se ignora la escala)", () => {
    expect(precioPorCantidad({ precioUnitario: 5, escalasPrecio: [{ desde: 1, precio: 9 }] }, 50)).toBe(5);
    expect(precioPorCantidad({ precioUnitario: "x", escalasPrecio: "basura" }, 3)).toBe(0);
  });
});

describe("validarEscalas", () => {
  it("ordena y redondea", () => {
    expect(validarEscalas([{ desde: "50", precio: "3.999" }, { desde: 10, precio: 4.5 }], 5)).toEqual([
      { desde: 10, precio: 4.5 },
      { desde: 50, precio: 4 },
    ]);
  });

  it("rechaza precios iguales o mayores al de menudeo", () => {
    expect(() => validarEscalas([{ desde: 10, precio: 5 }], 5)).toThrow(/menor al de menudeo/);
  });

  it("rechaza cantidades inválidas, repetidas o que suben el precio", () => {
    expect(() => validarEscalas([{ desde: 1, precio: 4 }], 5)).toThrow(/entre 2/);
    expect(() => validarEscalas([{ desde: 2.5, precio: 4 }], 5)).toThrow(/entero/);
    expect(() =>
      validarEscalas(
        [
          { desde: 10, precio: 4 },
          { desde: 10, precio: 3 },
        ],
        5
      )
    ).toThrow(/dos escalas/);
    expect(() =>
      validarEscalas(
        [
          { desde: 10, precio: 3 },
          { desde: 20, precio: 4 },
        ],
        5
      )
    ).toThrow(/no puede subir/);
  });

  it("máximo 5 escalas", () => {
    const seis = Array.from({ length: 6 }, (_, i) => ({ desde: i + 2, precio: 4 }));
    expect(() => validarEscalas(seis, 5)).toThrow(/Máximo 5/);
  });
});

describe("apoyos de interfaz", () => {
  it("sugiere la siguiente escala y describe las escalas", () => {
    const escalas = validarEscalas(lapiz.escalasPrecio, 5);
    expect(siguienteEscala(escalas, 8)?.desde).toBe(12);
    expect(siguienteEscala(escalas, 150)).toBeNull();
    expect(describirEscalas(escalas)).toBe("Docena 12+ $4.00 · Caja 100+ $3.50");
  });
});
