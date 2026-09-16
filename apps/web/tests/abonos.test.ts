import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    pagoProveedor: { create: vi.fn() },
    proveedor: { update: vi.fn() },
    bitacoraLog: { create: vi.fn() },
  };
  const prisma = {
    proveedor: { findUnique: vi.fn() },
    pagoProveedor: { findMany: vi.fn() },
    $transaction: vi.fn((cb: any) => cb(tx)),
  };
  return { tx, prisma };
});

vi.mock("@papeleria/database", () => ({ prisma: mocks.prisma }));

vi.mock("@/lib/auth", () => ({
  requireAuth: () => async () => ({
    user: { idPersona: "u1", nombre: "Admin", username: "admin", rol: "ADMINISTRADORA" },
  }),
}));

import { POST, GET } from "@/app/api/proveedores/[id]/pagos/route";

function req(body: any) {
  return new Request("http://localhost/api/proveedores/prov1/pagos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: "prov1" });

describe("POST /api/proveedores/[id]/pagos (abonos)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.proveedor.findUnique.mockResolvedValue({
      idProveedor: "prov1",
      nombre: "Papelera Central",
      saldoCredito: 100,
    });
    mocks.tx.pagoProveedor.create.mockResolvedValue({ idPago: "pago1" });
    mocks.tx.proveedor.update.mockResolvedValue({ saldoCredito: 60 });
    mocks.tx.bitacoraLog.create.mockResolvedValue({});
  });

  it("registra un abono válido y reduce el saldo", async () => {
    const res = await POST(req({ monto: 40, metodoPago: "TRANSFERENCIA" }), { params } as any);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.saldoNuevo).toBe(60);
    expect(mocks.tx.proveedor.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { saldoCredito: { decrement: 40 } } })
    );
    expect(mocks.tx.bitacoraLog.create).toHaveBeenCalled();
  });

  it("rechaza abonos mayores al saldo (sin sobrepago)", async () => {
    const res = await POST(req({ monto: 150 }), { params } as any);
    expect(res.status).toBe(400);
    expect(mocks.tx.pagoProveedor.create).not.toHaveBeenCalled();
  });

  it("rechaza montos no positivos", async () => {
    expect((await POST(req({ monto: 0 }), { params } as any)).status).toBe(400);
    expect((await POST(req({ monto: -5 }), { params } as any)).status).toBe(400);
  });

  it("rechaza abonar a un proveedor sin saldo", async () => {
    mocks.prisma.proveedor.findUnique.mockResolvedValue({
      idProveedor: "prov1",
      nombre: "Prov",
      saldoCredito: 0,
    });
    const res = await POST(req({ monto: 10 }), { params } as any);
    expect(res.status).toBe(409);
  });

  it("retorna 404 si el proveedor no existe", async () => {
    mocks.prisma.proveedor.findUnique.mockResolvedValue(null);
    const res = await POST(req({ monto: 10 }), { params } as any);
    expect(res.status).toBe(404);
  });
});

describe("GET /api/proveedores/[id]/pagos", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lista el historial de abonos", async () => {
    mocks.prisma.pagoProveedor.findMany.mockResolvedValue([
      {
        idPago: "p1",
        fechaHora: new Date("2026-09-16T10:00:00Z"),
        monto: 40,
        metodoPago: "EFECTIVO",
        referencia: null,
        notas: null,
        usuario: { nombre: "Admin" },
      },
    ]);
    const res = await GET(new Request("http://localhost"), { params } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].usuario).toBe("Admin");
  });
});
