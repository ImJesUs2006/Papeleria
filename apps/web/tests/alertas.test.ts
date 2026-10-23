import { describe, expect, it } from "vitest";
import { construirAlertas, finDelDia, type ContextoAlertas, type DatosAlertas } from "@/lib/alertas";

const hoy = new Date(2026, 9, 23, 10, 0);
const dia = (d: number, h = 12) => new Date(2026, 9, d, h);

const vacio: DatosAlertas = { existencias: [], lotes: [], pedidos: [], cuentas: [], apartados: [], cajas: [] };

const admin: ContextoAlertas = {
  sesion: { rol: "ADMINISTRADORA" },
  flags: { inventario: true, proveedores: true },
  usarCaducidad: true,
  diasApartado: 30,
  hoy,
};
const cajera: ContextoAlertas = { ...admin, sesion: { rol: "CAJERA", permisoInventario: false } };

describe("stock", () => {
  const datos: DatosAlertas = {
    ...vacio,
    existencias: [
      { codigoItem: "A", descripcion: "Lápiz", stock: 0, minimo: 5 },
      { codigoItem: "B", descripcion: "Goma", stock: 3, minimo: 5 },
      { codigoItem: "C", descripcion: "Regla", stock: 50, minimo: 5 },
    ],
  };
  it("agotado es crítico y stock bajo es aviso", () => {
    const a = construirAlertas(datos, admin);
    expect(a.map((x) => [x.nivel, x.titulo])).toEqual([
      ["critica", "Agotado: Lápiz"],
      ["aviso", "1 producto con stock bajo"],
    ]);
  });
  it("una cajera sin permiso de inventario no ve el stock", () => {
    expect(construirAlertas(datos, cajera)).toEqual([]);
  });
  it("muchos agotados se resumen en vez de inundar la lista", () => {
    const muchos = Array.from({ length: 9 }, (_, i) => ({ codigoItem: `P${i}`, descripcion: `P${i}`, stock: 0, minimo: 1 }));
    const a = construirAlertas({ ...vacio, existencias: muchos }, admin);
    expect(a).toHaveLength(6);
    expect(a[5].titulo).toBe("4 productos agotados más");
  });
});

describe("caducidad", () => {
  const datos: DatosAlertas = {
    ...vacio,
    lotes: [
      { idLote: "l1", numeroLote: "L-1", descripcion: "Leche", caducidad: dia(20), cantidad: 4 },
      { idLote: "l2", numeroLote: "L-2", descripcion: "Yogurt", caducidad: dia(30), cantidad: 10 },
    ],
  };
  it("vencido es crítico, próximo es aviso", () => {
    const a = construirAlertas(datos, admin);
    expect(a.map((x) => x.nivel)).toEqual(["critica", "aviso"]);
    expect(a[0].detalle).toContain("L-1");
  });
  it("si el negocio no usa caducidad no hay alertas de lotes", () => {
    expect(construirAlertas(datos, { ...admin, usarCaducidad: false })).toEqual([]);
  });
});

describe("pedidos y pagos a proveedores", () => {
  const datos: DatosAlertas = {
    ...vacio,
    pedidos: [
      { idPedido: "p1", proveedor: "Office", fechaEntrega: dia(21), estado: "PENDIENTE" },
      { idPedido: "p2", proveedor: "Bic", fechaEntrega: dia(24), estado: "EN_RUTA" },
      { idPedido: "p3", proveedor: "Norma", fechaEntrega: dia(28), estado: "PENDIENTE" },
    ],
    cuentas: [
      { idCuenta: "c1", idProveedor: "o", proveedor: "Office", saldo: 500, fechaVencimiento: dia(22, 23) },
      { idCuenta: "c2", idProveedor: "b", proveedor: "Bic", saldo: 120, fechaVencimiento: dia(25, 23) },
      { idCuenta: "c3", idProveedor: "n", proveedor: "Norma", saldo: 80, fechaVencimiento: dia(30, 23) },
    ],
  };
  it("atrasado, llega mañana, pago vencido y pago próximo", () => {
    const titulos = construirAlertas(datos, admin).map((a) => a.titulo);
    expect(titulos).toEqual([
      "Pago vencido a Office",
      "Pedido atrasado de Office",
      "Pago a Bic vence en 2 días",
      "Mañana llega el pedido de Bic",
    ]);
  });
  it("varias compras vencidas al mismo proveedor son UNA alerta con el total", () => {
    const a = construirAlertas(
      {
        ...vacio,
        cuentas: [
          { idCuenta: "x1", idProveedor: "o", proveedor: "Office", saldo: 100, fechaVencimiento: dia(10, 23) },
          { idCuenta: "x2", idProveedor: "o", proveedor: "Office", saldo: 50.5, fechaVencimiento: dia(15, 23) },
        ],
      },
      admin
    );
    expect(a).toHaveLength(1);
    expect(a[0].detalle).toContain("$150.50 de 2 compras");
    expect(a[0].detalle).toContain("10 oct");
  });
  it("sin el módulo de proveedores no aparecen", () => {
    expect(construirAlertas(datos, { ...admin, flags: { inventario: true, proveedores: false } })).toEqual([]);
  });
  it("la cajera no ve pagos ni pedidos", () => {
    expect(construirAlertas(datos, cajera)).toEqual([]);
  });
});

describe("apartados y caja", () => {
  it("apartado vencido según los días configurados", () => {
    const datos: DatosAlertas = {
      ...vacio,
      apartados: [
        { folio: "AP-1", cliente: "Ana", fechaCreado: dia(1), saldo: 200 },
        { folio: "AP-2", cliente: "Luis", fechaCreado: dia(14), saldo: 50 },
      ],
    };
    const a = construirAlertas(datos, { ...admin, diasApartado: 10 });
    expect(a.map((x) => x.titulo)).toEqual(["Apartado vencido: Ana", "Apartado de Luis vence en 1 día"]);
  });
  it("la cajera solo ve su propia caja abierta de más", () => {
    const datos: DatosAlertas = {
      ...vacio,
      cajas: [
        { idCaja: "k1", nombre: "Caja 1", usuario: "Yo", horaApertura: new Date(hoy.getTime() - 13 * 3_600_000), propia: true },
        { idCaja: "k2", nombre: "Caja 2", usuario: "Otra", horaApertura: new Date(hoy.getTime() - 20 * 3_600_000), propia: false },
        { idCaja: "k3", nombre: "Caja 3", usuario: "Nueva", horaApertura: new Date(hoy.getTime() - 2 * 3_600_000), propia: false },
      ],
    };
    expect(construirAlertas(datos, cajera).map((a) => a.clave)).toEqual(["caja-abierta:k1"]);
    expect(construirAlertas(datos, admin).map((a) => a.clave)).toEqual(["caja-abierta:k1", "caja-abierta:k2"]);
  });
});

it("'Entendido' oculta hasta el final del día", () => {
  const f = finDelDia(hoy);
  expect([f.getDate(), f.getHours(), f.getMinutes()]).toEqual([23, 23, 59]);
});
