/**
 * Verificación de AISLAMIENTO multi-tenant contra la base real.
 *
 *   npm run verificar:aislamiento -w @papeleria/web
 *
 * Crea dos negocios temporales, ejercita ventas / devoluciones / consultas
 * con el cliente de alcance de negocio y comprueba que ninguno puede leer
 * ni modificar datos del otro. Al terminar borra SOLO lo que creó.
 */
import { prisma } from "@papeleria/database";
import { tenantDb } from "@/lib/tenant";
import { claveProducto, claveUsuario } from "@/lib/tenant-keys";
import { crearNegocio } from "@/lib/negocios";
import { executeSale } from "@/lib/sales";
import { executeReturn } from "@/lib/returns";
import { getBusinessConfig } from "@/lib/feature-flags";

let fallos = 0;
function comprobar(nombre: string, ok: boolean, detalle?: unknown) {
  if (ok) {
    console.log(`  ✔ ${nombre}`);
  } else {
    fallos++;
    console.error(`  ✘ ${nombre}`, detalle ?? "");
  }
}

async function rechaza(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
}

async function limpiar(ids: string[]) {
  const w = { where: { idNegocio: { in: ids } } };
  await prisma.devolucionLinea.deleteMany(w);
  await prisma.devolucion.deleteMany(w);
  await prisma.lineaDetalleVenta.deleteMany(w);
  await prisma.movimientoKardex.deleteMany(w);
  await prisma.venta.deleteMany(w);
  await prisma.sesionCaja.deleteMany(w);
  await prisma.cliente.deleteMany(w);
  await prisma.producto.deleteMany(w);
  await prisma.bitacoraLog.deleteMany(w);
  await prisma.configuracionNegocio.deleteMany(w);
  await prisma.usuario.deleteMany(w);
  await prisma.negocio.deleteMany(w);
}

async function main() {
  const sello = Date.now().toString(36);
  const ids: string[] = [];
  try {
    const admin = { nombre: "Admin Prueba", username: "admin", password: "prueba-12345" };
    const a = await crearNegocio(prisma, { codigo: `zz-prueba-a-${sello}`, nombre: "Negocio A", admin });
    const b = await crearNegocio(prisma, { codigo: `zz-prueba-b-${sello}`, nombre: "Negocio B", admin });
    ids.push(a.idNegocio, b.idNegocio);
    const dbA = tenantDb(a.idNegocio);
    const dbB = tenantDb(b.idNegocio);

    console.log("Llaves únicas por negocio");
    comprobar("dos negocios pueden tener el usuario 'admin'", true);
    const adminA = await dbA.usuario.findUnique({ where: claveUsuario("admin") });
    const adminB = await dbB.usuario.findUnique({ where: claveUsuario("admin") });
    comprobar("cada uno resuelve a SU 'admin'", !!adminA && !!adminB && adminA.idPersona !== adminB.idPersona);

    await dbA.producto.create({
      data: { codigoItem: "X1", descripcion: "Lápiz de A", precioUnitario: 100, stockActual: 5, codigoBarras: "750100" },
    });
    await dbB.producto.create({
      data: { codigoItem: "X1", descripcion: "Lápiz de B", precioUnitario: 20, stockActual: 9, codigoBarras: "750100" },
    });
    const pA = await dbA.producto.findUnique({ where: claveProducto("X1") });
    const pB = await dbB.producto.findUnique({ where: claveProducto("X1") });
    comprobar("mismo código y código de barras en ambos negocios", Number(pA?.stockActual) === 5 && Number(pB?.stockActual) === 9);
    comprobar("el mismo código duplicado DENTRO de un negocio se rechaza", await rechaza(() =>
      dbA.producto.create({ data: { codigoItem: "X1", descripcion: "dup", precioUnitario: 1 } })
    ));

    console.log("Lecturas");
    comprobar("findMany solo devuelve lo propio", (await dbA.producto.findMany()).length === 1);
    comprobar("count solo cuenta lo propio", (await dbB.usuario.count()) === 1);
    comprobar("B no puede leer al usuario de A por su id", (await dbB.usuario.findUnique({ where: { idPersona: adminA!.idPersona } })) === null);
    comprobar("findFirst con filtro ajeno no cruza", (await dbB.usuario.findFirst({ where: { idPersona: adminA!.idPersona } })) === null);
    comprobar("un idNegocio ajeno en el filtro se ignora", (await dbB.producto.findMany({ where: { idNegocio: a.idNegocio } as any })).every((p) => p.idNegocio === b.idNegocio));

    console.log("Escrituras cruzadas");
    comprobar("B no puede actualizar al usuario de A", await rechaza(() =>
      dbB.usuario.update({ where: { idPersona: adminA!.idPersona }, data: { nombre: "hackeado" } })
    ));
    comprobar("B no puede borrar al usuario de A", await rechaza(() =>
      dbB.usuario.delete({ where: { idPersona: adminA!.idPersona } })
    ));
    const um = await dbB.producto.updateMany({ where: { codigoItem: "X1" }, data: { precioUnitario: 1 } });
    const precioA = await dbA.producto.findUnique({ where: claveProducto("X1") });
    comprobar("updateMany de B no toca el producto de A", um.count === 1 && Number(precioA?.precioUnitario) === 100);
    await dbB.producto.updateMany({ where: { codigoItem: "X1" }, data: { precioUnitario: 20 } });

    console.log("Venta y devolución (núcleo transaccional)");
    const caja = await dbA.sesionCaja.create({
      data: { idUsuario: adminA!.idPersona, fondoInicial: 0, estado: "ABIERTA", folioCaja: "CAJA-001" },
    });
    await dbB.sesionCaja.create({
      data: { idUsuario: adminB!.idPersona, fondoInicial: 0, estado: "ABIERTA", folioCaja: "CAJA-001" },
    });
    comprobar("el folio CAJA-001 puede repetirse entre negocios", true);

    const venta = await dbA.$transaction((tx) =>
      executeSale(
        tx,
        { items: [{ codigoItem: "X1", cantidad: 2 }], metodoPago: "EFECTIVO", montoRecibido: 500 },
        { idUsuario: adminA!.idPersona, idCaja: caja.idCaja, ivaRate: 16 }
      )
    );
    const stockA = await dbA.producto.findUnique({ where: claveProducto("X1") });
    const stockB = await dbB.producto.findUnique({ where: claveProducto("X1") });
    comprobar("la venta de A descuenta SOLO el stock de A", Number(stockA?.stockActual) === 3 && Number(stockB?.stockActual) === 9);
    comprobar("B no ve la venta de A (lista)", (await dbB.venta.findMany()).length === 0);
    comprobar("B no ve la venta de A (por folio)", (await dbB.venta.findUnique({ where: { folioVenta: venta.folioVenta } })) === null);
    const lineas = await prisma.lineaDetalleVenta.findMany({ where: { folioVenta: venta.folioVenta } });
    const kardex = await prisma.movimientoKardex.findMany({ where: { motivo: `Venta ${venta.folioVenta}` } });
    const bitacora = await prisma.bitacoraLog.findMany({ where: { accion: { contains: venta.folioVenta } } });
    comprobar("líneas, kardex y bitácora quedan sellados con el negocio A",
      lineas.length === 1 && [...lineas, ...kardex, ...bitacora].every((r) => r.idNegocio === a.idNegocio));

    comprobar("B no puede devolver una venta de A", await rechaza(() =>
      dbB.$transaction((tx) =>
        executeReturn(tx, { folioVenta: venta.folioVenta, items: [{ codigoItem: "X1", cantidad: 1 }], metodoReembolso: "EFECTIVO" },
          { idUsuario: adminB!.idPersona, idCaja: null })
      )
    ));
    const dev = await dbA.$transaction((tx) =>
      executeReturn(tx, { folioVenta: venta.folioVenta, items: [{ codigoItem: "X1", cantidad: 1 }], metodoReembolso: "EFECTIVO" },
        { idUsuario: adminA!.idPersona, idCaja: caja.idCaja })
    );
    const devLineas = await prisma.devolucionLinea.findMany({
      where: { devolucion: { folioDevolucion: dev.folioDevolucion } },
    });
    comprobar("las líneas ANIDADAS de la devolución quedan selladas con A",
      devLineas.length === 1 && devLineas[0].idNegocio === a.idNegocio);
    const stockA2 = await dbA.producto.findUnique({ where: claveProducto("X1") });
    comprobar("la devolución reingresa stock solo en A", Number(stockA2?.stockActual) === 4);

    console.log("Impuestos por producto (persistencia real)");
    await dbA.producto.create({
      data: { codigoItem: "MED", descripcion: "Medicina tasa 0", precioUnitario: 50, stockActual: 10, tasaIva: 0 },
    });
    await dbA.producto.create({
      data: { codigoItem: "REF", descripcion: "Refresco con IEPS", precioUnitario: 125.28, stockActual: 10, tasaIeps: 8 },
    });
    const fiscal = await dbA.$transaction((tx) =>
      executeSale(
        tx,
        { items: [{ codigoItem: "MED", cantidad: 2 }, { codigoItem: "REF", cantidad: 1 }], metodoPago: "EFECTIVO" },
        { idUsuario: adminA!.idPersona, idCaja: caja.idCaja, ivaRate: 16, preciosIncluyenIva: true }
      )
    );
    const ventaFiscal = await dbA.venta.findUnique({
      where: { folioVenta: fiscal.folioVenta },
      include: { lineasDetalle: true },
    });
    const lMed = ventaFiscal?.lineasDetalle.find((l) => l.codigoItem === "MED");
    const lRef = ventaFiscal?.lineasDetalle.find((l) => l.codigoItem === "REF");
    comprobar("con precios que incluyen impuestos se cobra la etiqueta (2×50 + 125.28)",
      Number(ventaFiscal?.totalNeto) === 225.28, ventaFiscal?.totalNeto);
    comprobar("la venta guarda base, IVA e IEPS",
      Number(ventaFiscal?.subtotal) === 200 && Number(ventaFiscal?.iva) === 17.28 && Number(ventaFiscal?.ieps) === 8,
      { s: ventaFiscal?.subtotal, i: ventaFiscal?.iva, e: ventaFiscal?.ieps });
    comprobar("cada línea guarda su tasa e impuestos",
      Number(lMed?.tasaIva) === 0 && Number(lMed?.ivaLinea) === 0 &&
      Number(lRef?.tasaIva) === 16 && Number(lRef?.ivaLinea) === 17.28 && Number(lRef?.iepsLinea) === 8);
    const devFiscal = await dbA.$transaction((tx) =>
      executeReturn(tx, { folioVenta: fiscal.folioVenta, items: [{ codigoItem: "REF", cantidad: 1 }], metodoReembolso: "EFECTIVO" },
        { idUsuario: adminA!.idPersona, idCaja: caja.idCaja })
    );
    comprobar("la devolución reembolsa exactamente lo cobrado por la línea", devFiscal.totalNeto === 125.28, devFiscal);

    console.log("Configuración");
    const cfgA = await getBusinessConfig(a.idNegocio);
    const cfgB = await getBusinessConfig(b.idNegocio);
    comprobar("cada negocio lee su propia configuración", cfgA.nombreNegocio === "Negocio A" && cfgB.nombreNegocio === "Negocio B");
    comprobar("sin idNegocio no hay cliente", await rechaza(async () => tenantDb("")));
  } finally {
    if (ids.length) await limpiar(ids);
    await prisma.$disconnect();
  }

  if (fallos > 0) {
    console.error(`\n${fallos} comprobación(es) fallaron`);
    process.exit(1);
  }
  console.log("\nAislamiento entre negocios verificado ✔");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
