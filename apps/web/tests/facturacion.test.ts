import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  requireAuth: () => async () => ({
    user: {
      idPersona: "usuario-test",
      nombre: "Admin Test",
      username: "admin",
      rol: "ADMINISTRADORA",
    },
  }),
}));

/** Decimal que conserva su valor numérico para los `Number(...)` del route. */
class DecimalMock {
  constructor(public readonly v: any) {}
  valueOf() {
    return this.v;
  }
  toString() {
    return String(this.v);
  }
}

type Venta = Record<string, any>;

function clienteRegistrado(overrides: Record<string, any> = {}) {
  return {
    idCliente: "CLI-1",
    nombre: "María López",
    rfc: "GACM8401018P4",
    razonSocial: null,
    ...overrides,
  };
}

function ventaPagada(overrides: Venta = {}): Venta {
  return {
    folioVenta: "F-000001",
    estado: "COMPLETADA",
    idCliente: "CLI-1",
    metodoPago: "EFECTIVO",
    subtotal: 100,
    iva: 16,
    totalNeto: 116,
    factura: null,
    ...overrides,
  };
}

function crearPrisma(opts: {
  cliente?: any;
  venta?: any;
  facturasExistentes?: any[];
}) {
  const facturas: any[] = [...(opts.facturasExistentes ?? [])];
  // Ojo: `??` trataría un null explícito como "no provisto"; se usa `in`.
  const cliente = "cliente" in opts ? opts.cliente : clienteRegistrado();
  const venta = "venta" in opts ? opts.venta : ventaPagada();
  const tx = {
    cliente: { findUnique: vi.fn(async () => cliente) },
    venta: {
      findUnique: vi.fn(async () => venta),
      update: vi.fn(async () => ({})),
    },
    factura: {
      findFirst: vi.fn(async () =>
        facturas.length ? facturas[facturas.length - 1] : null
      ),
      create: vi.fn(async ({ data }: any) => {
        const creada = {
          idFactura: "FAC-1",
          ...data,
        };
        facturas.push(creada);
        return creada;
      }),
      findMany: vi.fn(async () => facturas),
    },
    bitacoraLog: { create: vi.fn(async () => ({})) },
  };
  const prisma = {
    factura: {
      findMany: vi.fn(async () => [
        {
          idFactura: "FAC-1",
          folio: "F-000001",
          fechaEmision: new Date("2026-01-01T12:00:00Z"),
          folioVenta: "F-000099",
          idCliente: "CLI-1",
          subtotal: 100,
          iva: 16,
          totalNeto: 116,
          metodoPago: "EFECTIVO",
          usoCfdi: "S01",
          formaPago: "PUE",
          estado: "EMITIDA",
          cliente: { nombre: "María López", rfc: "GACM8401018P4", razonSocial: null },
          usuario: { nombre: "Admin Test" },
        },
      ]),
    },
    $transaction: vi.fn(async (cb: any) => cb(tx)),
  };
  return { prisma, tx };
}

/**
 * Importa la ruta con el módulo de Prisma simulado. La ruta debe importarse
 * de forma dinámica: un import estáticoevaluated ANTES del doMock.
 */
async function cargarRuta() {
  const mod = await import("@/app/api/facturas/route");
  return { POST: mod.POST, GET: mod.GET };
}

async function post(prisma: any, body: unknown) {
  vi.doMock("@papeleria/database", () => ({
    prisma,
    Prisma: { Decimal: DecimalMock },
  }));
  const { POST } = await cargarRuta();
  return POST(
    new Request("http://localhost/api/facturas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

async function get(prisma: any, url = "http://localhost/api/facturas") {
  vi.doMock("@papeleria/database", () => ({
    prisma,
    Prisma: { Decimal: DecimalMock },
  }));
  const { GET } = await cargarRuta();
  return GET(new Request(url));
}

const BODY = { idCliente: "CLI-1", folioVenta: "F-000001", usoCfdi: "S01" };

describe("POST /api/facturas · reglas estrictas (Fase 12)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("exige cliente y ticket: rechaza el cuerpo vacío", async () => {
    const { prisma } = crearPrisma({});
    const res = await post(prisma, {});
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeTruthy();
  });

  it("rechaza si el cliente no está registrado", async () => {
    const { prisma, tx } = crearPrisma({ cliente: null });
    const res = await post(prisma, BODY);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("cliente registrado");
    expect(tx.factura.create).not.toHaveBeenCalled();
  });

  it("rechaza si el cliente no tiene RFC ni razón social", async () => {
    const { prisma } = crearPrisma({
      cliente: clienteRegistrado({ rfc: null, razonSocial: null }),
    });
    const res = await post(prisma, BODY);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("RFC");
  });

  it("rechaza si el ticket no existe", async () => {
    const { prisma } = crearPrisma({ venta: null });
    const res = await post(prisma, BODY);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain("no existe");
  });

  it("rechaza tickets cancelados o reembolsados", async () => {
    const { prisma } = crearPrisma({ venta: ventaPagada({ estado: "CANCELADA" }) });
    const res = await post(prisma, BODY);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("no se puede facturar");
  });

  it.each(["REEMBOLSADA", "ACTIVA"])(
    "rechaza el ticket en estado %s",
    async (estado) => {
      const { prisma } = crearPrisma({ venta: ventaPagada({ estado }) });
      const res = await post(prisma, BODY);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain("no se puede facturar");
    }
  );

  it("no permite facturar dos veces el mismo ticket (409)", async () => {
    const { prisma } = crearPrisma({
      venta: ventaPagada({ factura: { folio: "F-000009" } }),
    });
    const res = await post(prisma, BODY);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("ya fue facturado");
  });

  it("rechaza si el ticket pertenece a otro cliente", async () => {
    const { prisma } = crearPrisma({
      venta: ventaPagada({ idCliente: "CLI-OTRO" }),
    });
    const res = await post(prisma, BODY);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("otro cliente");
  });

  it("rechaza un uso de CFDI fuera del catálogo SAT", async () => {
    const { prisma, tx } = crearPrisma({});
    const res = await post(prisma, { ...BODY, usoCfdi: "ZZZ9" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("CFDI");
    expect(tx.factura.create).not.toHaveBeenCalled();
  });

  it.each(["S01", "G03", "D01"])(
    "acepta el uso de CFDI válido %s del catálogo",
    async (uso) => {
      const { prisma, tx } = crearPrisma({});
      const res = await post(prisma, { ...BODY, usoCfdi: uso });
      expect(res.status).toBe(201);
      expect(tx.factura.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ usoCfdi: uso }),
      });
    }
  );

  it("rechaza campos extra: el total lo pone el servidor, no el cliente", async () => {
    const { prisma, tx } = crearPrisma({});
    const res = await post(prisma, { ...BODY, subtotal: 1 });
    expect(res.status).toBe(400);
    expect(tx.factura.create).not.toHaveBeenCalled();
  });

  it("copia los importes de la venta y no acepta totales del cliente", async () => {
    const { prisma, tx } = crearPrisma({});
    // El cliente intenta manipular el total: se rechaza por campos extra.
    const manipulado = await post(prisma, { ...BODY, totalNeto: 1 });
    expect(manipulado.status).toBe(400);

    // Y lo que se factura es exactamente lo que dice la venta.
    const res = await post(prisma, BODY);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.totalNeto).toBe(116);
    expect(json.data.subtotal).toBe(100);
    expect(json.data.iva).toBe(16);
    expect(tx.factura.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        folioVenta: "F-000001",
        formaPago: "PUE",
        estado: "EMITIDA",
      }),
    });
  });

  it("asigna el ticket de mostrador al cliente y lo deja en bitácora", async () => {
    const { prisma, tx } = crearPrisma({
      venta: ventaPagada({ idCliente: null }),
    });
    const res = await post(prisma, BODY);
    expect(res.status).toBe(201);
    expect(tx.venta.update).toHaveBeenCalledWith({
      where: { folioVenta: "F-000001" },
      data: { idCliente: "CLI-1" },
    });
    expect(tx.bitacoraLog.create).toHaveBeenCalled();
    expect((await res.json()).data.ticketReasignado).toBe(true);
  });

  it("no reasigna un ticket que ya tenía cliente", async () => {
    const { prisma, tx } = crearPrisma({});
    const res = await post(prisma, BODY);
    expect(res.status).toBe(201);
    expect(tx.venta.update).not.toHaveBeenCalled();
  });

  it("genera folios correlativos", async () => {
    const { prisma } = crearPrisma({
      facturasExistentes: [{ folio: "F-000007" }],
    });
    await post(prisma, BODY);
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});

describe("GET /api/facturas", () => {
  it("devuelve el listado normalizado a números", async () => {
    const { prisma } = crearPrisma({});
    const res = await get(prisma);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(1);
    expect(json.data[0].totalNeto).toBe(116);
    expect(json.data[0].nombreCliente).toBe("María López");
  });
});