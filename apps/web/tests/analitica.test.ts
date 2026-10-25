import { describe, expect, it } from "vitest";
import {
  antiguedadCuentas,
  clasificacionABC,
  coberturaInventario,
  indicadores,
  mapaCalor,
  margenPorCategoria,
  mezclaPagos,
  serieDiaria,
  variacion,
} from "@/lib/analitica";

// ============================================================
// Fase F: cálculos del análisis del negocio.
// ============================================================

const f = (dia: number, hora = 12) => new Date(2026, 9, dia, hora, 0, 0);

describe("tendencia de ventas", () => {
  it("llena los días sin venta con 0 y calcula el promedio de 7 días", () => {
    const serie = serieDiaria([{ fecha: f(1), total: 70 }, { fecha: f(1, 18), total: 30 }, { fecha: f(3), total: 50 }], f(1, 0), 3);
    expect(serie.map((p) => [p.dia, p.total, p.tickets])).toEqual([
      ["2026-10-01", 100, 2],
      ["2026-10-02", 0, 0],
      ["2026-10-03", 50, 1],
    ]);
    expect(serie[2].promedio7).toBe(50);
  });

  it("compara contra el periodo anterior", () => {
    expect(variacion(120, 100)).toBe(20);
    expect(variacion(80, 100)).toBe(-20);
    expect(variacion(50, 0)).toBeNull();
    expect(indicadores([{ fecha: f(1), total: 10 }, { fecha: f(2), total: 30 }])).toEqual({ total: 40, tickets: 2, ticketPromedio: 20 });
  });
});

describe("horas pico", () => {
  it("acomoda por día de la semana (lunes primero) y hora", () => {
    // 2026-10-05 fue lunes; 2026-10-11 domingo.
    const m = mapaCalor([{ fecha: f(5, 13), total: 100 }, { fecha: f(5, 13), total: 50 }, { fecha: f(11, 9), total: 20 }]);
    expect(m.celdas[0][13]).toBe(150);
    expect(m.celdas[6][9]).toBe(20);
    expect(m.picos[0]).toEqual({ dia: "Lun", hora: 13, total: 150 });
    expect([m.desdeHora, m.hastaHora]).toEqual([9, 13]);
  });
});

describe("análisis ABC", () => {
  it("los productos que juntan el 80% de la venta son clase A", () => {
    const r = clasificacionABC([
      { codigo: "A1", descripcion: "Cuaderno", venta: 700 },
      { codigo: "A2", descripcion: "Pluma", venta: 150 },
      { codigo: "B1", descripcion: "Borrador", venta: 100 },
      { codigo: "C1", descripcion: "Clip", venta: 50 },
      { codigo: "Z", descripcion: "Sin venta", venta: 0 },
    ]);
    expect(r.filas.map((x) => [x.codigo, x.clase])).toEqual([
      ["A1", "A"],
      ["A2", "A"],
      ["B1", "B"],
      ["C1", "C"],
    ]);
    expect(r.A).toEqual({ productos: 2, pctProductos: 50, pctVenta: 85 });
    expect(r.filas[3].acumuladoPct).toBe(100);
  });
});

describe("margen por categoría", () => {
  it("no inventa margen con lo vendido sin costo", () => {
    const r = margenPorCategoria([
      { categoria: "Escolar", venta: 100, costo: 60 },
      { categoria: "Escolar", venta: 50, costo: null },
      { categoria: null, venta: 20, costo: 10 },
    ]);
    expect(r[0]).toEqual({ categoria: "Escolar", venta: 150, margen: 40, margenPct: 40, ventaSinCosto: 50 });
    expect(r[1]).toMatchObject({ categoria: "Sin categoría", margenPct: 50 });
  });
});

describe("días de inventario", () => {
  it("clasifica agotado, crítico, sano, exceso y sin movimiento", () => {
    const r = coberturaInventario(
      [
        { codigo: "1", descripcion: "Se acabó", stock: 0, vendido: 30 },
        { codigo: "2", descripcion: "Crítico", stock: 5, vendido: 30 },
        { codigo: "3", descripcion: "Sano", stock: 30, vendido: 30 },
        { codigo: "4", descripcion: "Exceso", stock: 200, vendido: 30 },
        { codigo: "5", descripcion: "Quieto", stock: 12, vendido: 0 },
      ],
      30
    );
    expect(r.filas.map((x) => [x.estado, x.diasCobertura])).toEqual([
      ["AGOTADO", 0],
      ["CRITICO", 5],
      ["SANO", 30],
      ["EXCESO", 200],
      ["SIN_MOVIMIENTO", null],
    ]);
    expect(r.resumen).toEqual({ AGOTADO: 1, CRITICO: 1, SANO: 1, EXCESO: 1, SIN_MOVIMIENTO: 1 });
  });
});

describe("cuentas por pagar y pagos", () => {
  it("agrupa lo que se debe por antigüedad", () => {
    const hoy = f(20);
    const r = antiguedadCuentas(
      [
        { saldo: 100, vence: f(25) },
        { saldo: 50, vence: f(20) },
        { saldo: 30, vence: f(10) },
        { saldo: 20, vence: new Date(2026, 7, 1) },
      ],
      hoy
    );
    expect(r.map((t) => t.monto)).toEqual([150, 30, 0, 20]);
  });

  it("calcula la participación de cada método", () => {
    expect(mezclaPagos([{ metodo: "EFECTIVO", monto: 75 }, { metodo: "TARJETA", monto: 25 }, { metodo: "EFECTIVO", monto: 0 }])).toEqual([
      { metodo: "EFECTIVO", monto: 75, pct: 75 },
      { metodo: "TARJETA", monto: 25, pct: 25 },
    ]);
  });
});
