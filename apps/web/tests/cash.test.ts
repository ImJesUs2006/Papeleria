import { describe, expect, it, vi } from "vitest";
import { calcularArqueo, round2 } from "@/lib/cash";

vi.mock("@/lib/auth", () => ({
  requireAuth: () => async () => ({
    user: { idPersona: "usuario-test", nombre: "Admin", username: "admin", rol: "ADMINISTRADORA" },
  }),
}));

describe("calcularArqueo (matemática exacta)", () => {
  const base = {
    fondoInicial: 500,
    totalVentasEfectivo: 1000,
    totalVentasDigital: 200,
    totalRecargas: 50,
  };

  it("cuadra exacto cuando la cajera declara lo esperado", () => {
    const r = calcularArqueo({
      ...base,
      efectivoDeclarado: 1500,
      digitalDeclarado: 200,
      recargasDeclarado: 50,
    });

    expect(r.esperadoEfectivo).toBe(1500); // 500 + 1000
    expect(r.faltanteEfectivo).toBe(0);
    expect(r.totalEsperado).toBe(1750);
    expect(r.descuadre).toBe(false);
  });

  it("detecta faltante exacto en efectivo", () => {
    const r = calcularArqueo({
      ...base,
      efectivoDeclarado: 1400,
      digitalDeclarado: 200,
      recargasDeclarado: 50,
    });

    expect(r.faltanteEfectivo).toBe(100);
    expect(r.diferenciaTotal).toBe(100);
    expect(r.descuadre).toBe(true);
  });

  it("detecta sobrante cuando declara de más", () => {
    const r = calcularArqueo({
      ...base,
      efectivoDeclarado: 1600,
      digitalDeclarado: 200,
      recargasDeclarado: 50,
    });

    expect(r.faltanteEfectivo).toBe(-100);
    expect(r.descuadre).toBe(true);
  });

  it("redondea a 2 decimales sin errores de punto flotante", () => {
    const r = calcularArqueo({
      fondoInicial: 0.1,
      totalVentasEfectivo: 0.2,
      totalVentasDigital: 0.3,
      totalRecargas: 0.1,
      efectivoDeclarado: 0.3,
      digitalDeclarado: 0.3,
      recargasDeclarado: 0.1,
    });

    // 0.1 + 0.2 en binario da 0.30000000000000004; round2 debe estabilizarlo
    expect(r.esperadoEfectivo).toBe(0.3);
    expect(r.faltanteEfectivo).toBe(0);
    expect(r.totalEsperado).toBe(0.7);
    expect(r.descuadre).toBe(false);
  });

  it("usa tolerancia de 1 centavo para no marcar descuadre por flotantes", () => {
    const r = calcularArqueo({
      ...base,
      efectivoDeclarado: 1500.01,
      digitalDeclarado: 200,
      recargasDeclarado: 50,
    });

    expect(Math.abs(r.diferenciaTotal)).toBeLessThanOrEqual(0.01);
    expect(r.descuadre).toBe(false);
  });

  it("round2 maneja números negativos", () => {
    expect(round2(-23.456)).toBe(-23.46);
    expect(round2(-0.005)).toBe(-0.01);
  });
});

describe("POST /api/caja/cerrar", () => {

  it("valida que el arqueo exacto se refleje en la respuesta (corte ciego)", async () => {
    const tx = {
      sesionCaja: { update: vi.fn(async (args: any) => args.data) },
      bitacoraLog: { create: vi.fn(async () => ({})) },
    };
    const prisma = {
      sesionCaja: {
        findFirst: vi.fn(async () => ({
          idCaja: "CAJA-1",
          estado: "EN_CIERRE",
          cierreToken: "token-test",
          fondoInicial: 500,
          totalVentasEfectivo: 1000,
          totalVentasDigital: 200,
          totalRecargas: 50,
        })),
      },
      retiroEfectivo: {
        aggregate: vi.fn(async () => ({ _sum: { monto: null } })),
      },
      $transaction: vi.fn(async (cb: any) => cb(tx)),
    };
    vi.doMock("@papeleria/database", () => ({ prisma }));

    const { POST } = await import("@/app/api/caja/cerrar/route");
    const res = await POST(
      new Request("http://localhost/api/caja/cerrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cierreToken: "token-test",
          efectivoContado: 1500,
          vouchersContado: 200,
          recargasContado: 50,
        }),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.arqueo.descuadre).toBe(false);
    expect(body.arqueo.totalEsperado).toBe(1750);
    expect(body.arqueo.faltanteEfectivo).toBe(0);
    expect(body.cierre.estado).toBe("CERRADA");

    // La sesión se cierra marcando el estado
    expect(tx.sesionCaja.update).toHaveBeenCalledWith({
      where: { idCaja: "CAJA-1" },
      data: expect.objectContaining({ estado: "CERRADA" }),
    });
    expect(tx.bitacoraLog.create).toHaveBeenCalled();
  });

  it("exige token de cierre vigente", async () => {
    vi.doMock("@papeleria/database", () => ({
      prisma: { sesionCaja: { findFirst: vi.fn() } },
    }));

    const { POST } = await import("@/app/api/caja/cerrar/route");
    const res = await POST(
      new Request("http://localhost/api/caja/cerrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ efectivoContado: -5 }),
      })
    );

    expect(res.status).toBe(400);
  });
});