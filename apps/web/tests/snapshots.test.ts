import { describe, expect, it, vi } from "vitest";
import {
  CONFIG_ID,
  MOTIVO_REINICIO,
  buildResetJson,
  captureSnapshotState,
  resetNegocio,
  restoreFromSnapshot,
  SnapshotError,
} from "@/lib/snapshots";

function makeConfigRow(overrides: any = {}) {
  return {
    id: CONFIG_ID,
    nombreNegocio: "Papelería El Lápiz",
    tipoNegocio: "PAPELERIA_RETAIL",
    moneda: "MXN",
    ivaRate: 16,
    featureFlags: { inventario: true, facturacion: false },
    metodosPago: ["EFECTIVO", "TRANSFERENCIA"],
    politicaStockOffline: "PERMITIR_NEGATIVO",
    logo: null,
    temaBase: "NEON",
    colorAcento: "#10b981",
    configVersion: 5,
    setupPendiente: false,
    ...overrides,
  };
}

function makeSesion() {
  return {
    idCaja: "caja-1",
    estado: "ABIERTA",
    totalVentasEfectivo: 150.5,
    totalVentasDigital: 99.99,
    totalRecargas: 5,
    totalEgresos: 22,
    horaApertura: new Date("2026-09-01T10:00:00.000Z"),
    horaCierre: null,
  };
}

function makeResetTx(configRow: any = makeConfigRow()) {
  const tx: any = {
    configuracionNegocio: {
      findUnique: vi.fn().mockResolvedValue(configRow),
      update: vi.fn().mockResolvedValue({}),
    },
    sesionCaja: {
      findMany: vi.fn().mockResolvedValue([makeSesion()]),
    },
    venta: {
      aggregate: vi.fn().mockResolvedValue({
        _count: 12,
        _sum: { subtotal: 1000, iva: 160, totalNeto: 1160 },
      }),
    },
    snapshotSeguridad: {
      create: vi.fn().mockResolvedValue({ id: "snap-abc" }),
    },
    bitacoraLog: { create: vi.fn().mockResolvedValue({}) },
  };
  return tx;
}

describe("buildResetJson", () => {
  it("normaliza Decimals y aplica valores por defecto", () => {
    const json = buildResetJson(makeConfigRow(), [makeSesion()], {
      _count: 3,
      _sum: { subtotal: 450.5 },
    } as any);

    expect(json.fecha).toBeDefined();
    expect(json.configuracion.nombreNegocio).toBe("Papelería El Lápiz");
    expect(json.configuracion.temaBase).toBe("NEON");
    expect(json.configuracion.colorAcento).toBe("#10b981");
    expect(json.configuracion.configVersion).toBe(5);
    expect(json.totales.ventas.conteo).toBe(3);
    expect(json.totales.sesionCaja).toHaveLength(1);
    expect(json.totales.sesionCaja[0].horaApertura).toContain("2026-09-01");
  });

  it("resiste filas vacías con defaults", () => {
    const json = buildResetJson({}, [], {});
    expect(json.configuracion.nombreNegocio).toBe("Mi Negocio");
    expect(json.configuracion.tipoNegocio).toBe("PAPELERIA_RETAIL");
    expect(json.configuracion.temaBase).toBe("NEON");
    expect(json.configuracion.colorAcento).toBe("#10b981");
    expect(json.totales.ventas.conteo).toBe(0);
  });
});

describe("captureSnapshotState", () => {
  it("agrega la consulta de config, sesiones y ventas", async () => {
    const tx = makeResetTx();
    const json = await captureSnapshotState(tx);

    expect(tx.configuracionNegocio.findUnique).toHaveBeenCalledWith({ where: { id: CONFIG_ID } });
    expect(tx.venta.aggregate).toHaveBeenCalled();
    expect(json.totales.ventas.totalNeto).toBe(1160);
    expect(json.totales.sesionCaja[0].idCaja).toBe("caja-1");
  });
});

describe("resetNegocio (factory reset no destructivo)", () => {
  it("guarda snapshot, marca setup PENDIENTE y sube versión sin borrar datos", async () => {
    const tx = makeResetTx();
    const id = await resetNegocio(tx, { motivo: "Cambio de gerencia", idUsuario: "u1" });

    expect(id).toBe("snap-abc");
    expect(tx.snapshotSeguridad.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          motivo: "Cambio de gerencia",
          idUsuario: "u1",
          datosJson: expect.objectContaining({
            configuracion: expect.objectContaining({ configVersion: 5 }),
          }),
        }),
      })
    );
    expect(tx.configuracionNegocio.update).toHaveBeenCalledWith({
      where: { id: CONFIG_ID },
      data: { setupPendiente: true, configVersion: 6 },
    });
    expect(tx.bitacoraLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accion: expect.stringContaining("snapshot snap-abc"),
          moduloSistema: "SETUP",
        }),
      })
    );
  });

  it("usa motivo por defecto cuando no se especifica", async () => {
    const tx = makeResetTx();
    await resetNegocio(tx, { motivo: "", idUsuario: "u1" });
    expect(tx.snapshotSeguridad.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ motivo: "" }) })
    );
  });

  it("la versión siguiente nace de la actual aunque sea menor a 1", async () => {
    const tx = makeResetTx({ ...makeConfigRow({ configVersion: 0 }) });
    await resetNegocio(tx, { motivo: MOTIVO_REINICIO, idUsuario: "u1" });
    expect(tx.configuracionNegocio.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ configVersion: 1 }) })
    );
  });
});

describe("restoreFromSnapshot", () => {
  const snapRow = {
    id: "snap-abc",
    datosJson: {
      fecha: "2026-09-01T10:00:00.000Z",
      configuracion: {
        nombreNegocio: "Papelería Antigua",
        tipoNegocio: "ABARROTES",
        moneda: "MXN",
        ivaRate: 8,
        featureFlags: { inventario: true, facturacion: true, dashboard: false, proveedores: false, bitacora: false },
        metodosPago: ["EFECTIVO"],
        politicaStockOffline: "RECHAZAR",
        logo: "data:image/png;base64,AAAA",
        temaBase: "BRUTALISTA",
        colorAcento: "#38bdf8",
        configVersion: 3,
        setupPendiente: true,
      },
      totales: { ventas: { conteo: 1 }, sesionCaja: [] },
    },
  };

  function makeRestoreTx(overrides: any = {}) {
    const tx: any = {
      snapshotSeguridad: {
        findUnique: vi.fn().mockResolvedValue(snapRow),
      },
      configuracionNegocio: {
        findUnique: vi.fn().mockResolvedValue(makeConfigRow({ configVersion: 9 })),
        update: vi.fn().mockResolvedValue({}),
      },
      bitacoraLog: { create: vi.fn().mockResolvedValue({}) },
      ...overrides,
    };
    return tx;
  }

  it("restaura la config, baja setupPendiente y sube la versión", async () => {
    const tx = makeRestoreTx();
    const r = await restoreFromSnapshot(tx, { id: "snap-abc", idUsuario: "u2" });

    expect(r.id).toBe("snap-abc");
    expect(r.configVersion).toBe(10);
    expect(tx.configuracionNegocio.update).toHaveBeenCalledWith({
      where: { id: CONFIG_ID },
      data: expect.objectContaining({
        nombreNegocio: "Papelería Antigua",
        tipoNegocio: "ABARROTES",
        ivaRate: 8,
        politicaStockOffline: "RECHAZAR",
        logo: "data:image/png;base64,AAAA",
        temaBase: "BRUTALISTA",
        colorAcento: "#38bdf8",
        metodosPago: ["EFECTIVO"],
        setupPendiente: false,
        configVersion: 10,
        updatedById: "u2",
      }),
    });
    expect(tx.bitacoraLog.create).toHaveBeenCalled();
  });

  it("lanza 404 si el snapshot no existe", async () => {
    const tx = makeRestoreTx({
      snapshotSeguridad: { findUnique: vi.fn().mockResolvedValue(null) },
    });
    await expect(
      restoreFromSnapshot(tx, { id: "nope", idUsuario: "u2" })
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rechaza snapshots sin configuración válida", async () => {
    const tx = makeRestoreTx({
      snapshotSeguridad: { findUnique: vi.fn().mockResolvedValue({ id: "x", datosJson: {} }) },
    });
    await expect(
      restoreFromSnapshot(tx, { id: "x", idUsuario: "u2" })
    ).rejects.toBeInstanceOf(SnapshotError);
  });
});