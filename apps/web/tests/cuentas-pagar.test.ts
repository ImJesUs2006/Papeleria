import { describe, expect, it, vi } from "vitest";
import {
  aplicarAbono,
  calcularVencimiento,
  diasParaVencer,
  estadoVencimiento,
  registrarCuentaPorPagar,
  repartirAbono,
} from "@/lib/cuentas-pagar";

const hoy = new Date(2026, 9, 23, 10, 30); // 23-oct-2026

describe("vencimiento", () => {
  it("vence al final del día hoy + días de crédito", () => {
    const v = calcularVencimiento(hoy, 15);
    expect([v.getFullYear(), v.getMonth(), v.getDate(), v.getHours()]).toEqual([2026, 10, 7, 23]);
  });
  it("de contado (0 días) vence hoy", () => {
    expect(calcularVencimiento(hoy, 0).getDate()).toBe(23);
  });
  it("clasifica vencida, por vencer y al corriente", () => {
    expect(estadoVencimiento(new Date(2026, 9, 22), hoy)).toBe("VENCIDA");
    expect(estadoVencimiento(new Date(2026, 9, 23, 23), hoy)).toBe("VENCE_PRONTO");
    expect(estadoVencimiento(new Date(2026, 9, 26), hoy)).toBe("VENCE_PRONTO");
    expect(estadoVencimiento(new Date(2026, 9, 27), hoy)).toBe("AL_CORRIENTE");
    expect(diasParaVencer(new Date(2026, 9, 20), hoy)).toBe(-3);
  });
});

describe("repartirAbono", () => {
  const cuentas = [
    { idCuenta: "nueva", saldo: 300, fechaVencimiento: new Date(2026, 10, 10) },
    { idCuenta: "vieja", saldo: 100, fechaVencimiento: new Date(2026, 9, 1) },
  ];
  it("paga primero la que vence antes", () => {
    expect(repartirAbono(cuentas, 150)).toEqual([
      { idCuenta: "vieja", aplicado: 100, saldoNuevo: 0 },
      { idCuenta: "nueva", aplicado: 50, saldoNuevo: 250 },
    ]);
  });
  it("nunca aplica más de lo que se debe", () => {
    const r = repartirAbono(cuentas, 1000);
    expect(r.reduce((s, x) => s + x.aplicado, 0)).toBe(400);
  });
});

describe("registro con base de datos simulada", () => {
  it("crea la cuenta, sube el saldo y avisa si rebasa el límite", async () => {
    const tx: any = {
      proveedor: {
        findUnique: vi.fn(async () => ({ diasCredito: 30, limiteCredito: 1000, saldoCredito: 900 })),
        update: vi.fn(async () => ({ saldoCredito: 1150 })),
      },
      cuentaPorPagar: { create: vi.fn(async ({ data }: any) => ({ idCuenta: "c1", ...data })) },
    };
    const r = await registrarCuentaPorPagar(tx, {
      idProveedor: "p1",
      idPedido: "ped1",
      monto: 250.004,
      concepto: "Recepción",
      hoy,
    });
    expect(tx.cuentaPorPagar.create.mock.calls[0][0].data).toMatchObject({ monto: 250, saldo: 250 });
    expect(tx.proveedor.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { saldoCredito: { increment: 250 } } })
    );
    expect(r?.excedeLimite).toBe(true);
  });

  it("no registra nada con importe cero", async () => {
    const tx: any = { proveedor: { findUnique: vi.fn() }, cuentaPorPagar: { create: vi.fn() } };
    expect(await registrarCuentaPorPagar(tx, { idProveedor: "p", idPedido: "x", monto: 0, concepto: "" })).toBeNull();
    expect(tx.cuentaPorPagar.create).not.toHaveBeenCalled();
  });

  it("aplicarAbono marca PAGADA la cuenta liquidada", async () => {
    const tx: any = {
      cuentaPorPagar: {
        findMany: vi.fn(async () => [
          { idCuenta: "a", saldo: 100, fechaVencimiento: new Date(2026, 9, 1) },
          { idCuenta: "b", saldo: 100, fechaVencimiento: new Date(2026, 9, 5) },
        ]),
        update: vi.fn(),
      },
    };
    await aplicarAbono(tx, "p1", 120);
    expect(tx.cuentaPorPagar.update).toHaveBeenNthCalledWith(1, {
      where: { idCuenta: "a" },
      data: { saldo: 0, estado: "PAGADA" },
    });
    expect(tx.cuentaPorPagar.update).toHaveBeenNthCalledWith(2, {
      where: { idCuenta: "b" },
      data: { saldo: 80, estado: "PENDIENTE" },
    });
  });
});
