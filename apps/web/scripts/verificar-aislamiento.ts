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
import { promocionesVigentes, validarPromocion } from "@/lib/promociones";
import { moverStock, stockEnSucursal } from "@/lib/existencias";
import { cajaDelUsuario } from "@/lib/cajas";
import { ejecutarTraspaso } from "@/lib/traspasos";
import { lotesPorCaducar, registrarEntradaLote } from "@/lib/lotes";
import { registrarSeries } from "@/lib/series";
import { generarVariantes } from "@/lib/variantes";
import { recibirPedido } from "@/lib/compras";
import { getReporteData } from "@/lib/reports";

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
  await prisma.itemPedidoProveedor.deleteMany({ where: { pedido: { idNegocio: { in: ids } } } });
  await prisma.pedidoProveedor.deleteMany(w);
  await prisma.proveedor.deleteMany(w);
  await prisma.lote.deleteMany(w);
  await prisma.numeroSerie.deleteMany(w);
  await prisma.existencia.deleteMany(w);
  await prisma.traspaso.deleteMany(w);
  await prisma.pagoVenta.deleteMany(w);
  await prisma.promocion.deleteMany(w);
  await prisma.venta.deleteMany(w);
  await prisma.sesionCaja.deleteMany(w);
  await prisma.cliente.deleteMany(w);
  await prisma.producto.deleteMany(w);
  await prisma.bitacoraLog.deleteMany(w);
  await prisma.configuracionNegocio.deleteMany(w);
  await prisma.usuario.deleteMany(w);
  await prisma.sucursal.deleteMany(w);
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

    console.log("Promociones y pago mixto (Paso 3)");
    await dbA.promocion.create({
      data: validarPromocion({ nombre: "3x2 lápices", tipo: "NXM", llevaN: 3, pagaM: 2, codigoItem: "X1" }),
    });
    comprobar("B no ve las promociones de A", (await promocionesVigentes(dbB)).length === 0);
    const promosA = await promocionesVigentes(dbA);
    await dbA.producto.updateMany({ where: { codigoItem: "X1" }, data: { stockActual: 10 } });
    const mixta = await dbA.$transaction((tx) =>
      executeSale(
        tx,
        {
          items: [{ codigoItem: "X1", cantidad: 3 }],
          metodoPago: "EFECTIVO",
          pagos: [
            { metodo: "TARJETA", monto: 132 },
            { metodo: "EFECTIVO", monto: 100 },
          ],
          montoRecibido: 200,
        },
        { idUsuario: adminA!.idPersona, idCaja: caja.idCaja, ivaRate: 16, promociones: promosA }
      )
    );
    comprobar("el 3x2 cobra 2 de 3 (200 + IVA = 232)", mixta.totalNeto === 232 && mixta.descuentoTotal === 100, mixta);
    comprobar("el cambio sale solo del efectivo", mixta.cambio === 100);
    const pagosGuardados = await prisma.pagoVenta.findMany({ where: { folioVenta: mixta.folioVenta } });
    comprobar("los pagos se guardan por separado y sellados con A",
      pagosGuardados.length === 2 && pagosGuardados.every((x) => x.idNegocio === a.idNegocio));
    comprobar("B no ve los pagos de A", (await dbB.pagoVenta.findMany()).length === 0);

    console.log("Sucursales, existencias y multi-caja (Paso 5)");
    const matrizA = await dbA.sucursal.findFirst({ where: { esMatriz: true } });
    comprobar("el alta de negocio crea su matriz", !!matrizA);
    comprobar("B no ve las sucursales de A", (await dbB.sucursal.findMany()).every((x) => x.idNegocio === b.idNegocio));
    const centro = await dbA.sucursal.create({ data: { nombre: "Centro" } });
    await dbA.producto.create({ data: { codigoItem: "SUC1", descripcion: "Mochila", precioUnitario: 100 } });
    await dbA.$transaction((tx) => moverStock(tx, { codigoItem: "SUC1", delta: 5, idSucursal: matrizA!.idSucursal }));
    await dbA.$transaction((tx) => moverStock(tx, { codigoItem: "SUC1", delta: 2, idSucursal: centro.idSucursal }));
    const total = async () => Number((await dbA.producto.findUnique({ where: claveProducto("SUC1") }))!.stockActual);
    const enSuc = async (id: string) => (await stockEnSucursal(dbA, id, ["SUC1"])).get("SUC1");
    comprobar("el total es la suma de sucursales (5 + 2)", (await total()) === 7);

    // Una cajera del Centro con su propia caja; la admin tiene otra caja abierta.
    const cajeraCentro = await dbA.usuario.create({
      data: { nombre: "Cajera Centro", username: "centro", passwordHash: "x", rol: "CAJERA", idSucursal: centro.idSucursal },
    });
    const cajaCentro = await dbA.sesionCaja.create({
      data: { idUsuario: cajeraCentro.idPersona, fondoInicial: 0, estado: "ABIERTA", folioCaja: "CAJA-002", idSucursal: centro.idSucursal },
    });
    comprobar("dos cajas abiertas a la vez en el negocio",
      (await dbA.sesionCaja.count({ where: { estado: "ABIERTA" } })) >= 2);
    comprobar("cada usuario resuelve SU caja",
      (await cajaDelUsuario(dbA, cajeraCentro.idPersona))?.idCaja === cajaCentro.idCaja &&
      (await cajaDelUsuario(dbA, adminA!.idPersona))?.idCaja === caja.idCaja);

    const ventaCentro = await dbA.$transaction((tx) =>
      executeSale(
        tx,
        { items: [{ codigoItem: "SUC1", cantidad: 2 }], metodoPago: "EFECTIVO" },
        { idUsuario: cajeraCentro.idPersona, idCaja: cajaCentro.idCaja, idSucursal: centro.idSucursal }
      )
    );
    comprobar("la venta del Centro descuenta solo el Centro y el total",
      (await enSuc(centro.idSucursal)) === 0 && (await enSuc(matrizA!.idSucursal)) === 5 && (await total()) === 5);
    comprobar("la venta queda en la caja y sucursal del Centro",
      (await dbA.venta.findUnique({ where: { folioVenta: ventaCentro.folioVenta } }))?.idSucursal === centro.idSucursal);
    comprobar("el Centro ya no puede vender lo que no tiene", await rechaza(() =>
      dbA.$transaction((tx) =>
        executeSale(tx, { items: [{ codigoItem: "SUC1", cantidad: 1 }], metodoPago: "EFECTIVO" },
          { idUsuario: cajeraCentro.idPersona, idCaja: cajaCentro.idCaja, idSucursal: centro.idSucursal })
      )
    ));

    const t = await dbA.$transaction((tx) =>
      ejecutarTraspaso(tx, { idOrigen: matrizA!.idSucursal, idDestino: centro.idSucursal, items: [{ codigoItem: "SUC1", cantidad: 3 }] }, adminA!.idPersona)
    );
    comprobar("el traspaso mueve entre sucursales sin cambiar el total",
      (await enSuc(matrizA!.idSucursal)) === 2 && (await enSuc(centro.idSucursal)) === 3 && (await total()) === 5);
    const kardexT = await prisma.movimientoKardex.findMany({ where: { motivo: { contains: t.folio } } });
    comprobar("el traspaso deja kardex en ambas sucursales",
      kardexT.length === 2 && new Set(kardexT.map((k) => k.idSucursal)).size === 2);
    comprobar("no se traspasa más de lo que hay", await rechaza(() =>
      dbA.$transaction((tx) =>
        ejecutarTraspaso(tx, { idOrigen: matrizA!.idSucursal, idDestino: centro.idSucursal, items: [{ codigoItem: "SUC1", cantidad: 50 }] }, adminA!.idPersona)
      )
    ));

    console.log("Lotes, series y variantes (Paso 6)");
    const matriz = matrizA!.idSucursal;
    await dbA.producto.create({
      data: { codigoItem: "MEDL", descripcion: "Amoxicilina", precioUnitario: 50, usaLotes: true, tasaIva: 0 },
    });
    const ayer = new Date(Date.now() - 86_400_000);
    const pronto = new Date(Date.now() + 10 * 86_400_000);
    const despues = new Date(Date.now() + 90 * 86_400_000);
    await dbA.$transaction(async (tx) => {
      await registrarEntradaLote(tx, { codigoItem: "MEDL", idSucursal: matriz, numeroLote: "VENCIDO", caducidad: ayer, cantidad: 4, idUsuario: adminA!.idPersona });
      await registrarEntradaLote(tx, { codigoItem: "MEDL", idSucursal: matriz, numeroLote: "TARDE", caducidad: despues, cantidad: 5, idUsuario: adminA!.idPersona });
      await registrarEntradaLote(tx, { codigoItem: "MEDL", idSucursal: matriz, numeroLote: "PRONTO", caducidad: pronto, cantidad: 3, idUsuario: adminA!.idPersona });
    });
    const ventaLotes = await dbA.$transaction((tx) =>
      executeSale(tx, { items: [{ codigoItem: "MEDL", cantidad: 4 }], metodoPago: "EFECTIVO" },
        { idUsuario: adminA!.idPersona, idCaja: caja.idCaja, idSucursal: matriz })
    );
    const lineaLotes = await dbA.lineaDetalleVenta.findFirst({ where: { folioVenta: ventaLotes.folioVenta } });
    const lotesUsados = (lineaLotes?.lotes as any[]) ?? [];
    comprobar("FEFO: toma primero el que caduca pronto y nunca el vencido",
      lotesUsados.length === 2 && lotesUsados[0].numeroLote === "PRONTO" && lotesUsados[0].cantidad === 3 &&
      lotesUsados[1].numeroLote === "TARDE" && lotesUsados[1].cantidad === 1, lotesUsados);
    const porCaducar = await lotesPorCaducar(dbA, 30, matriz);
    comprobar("alerta: el vencido aparece por caducar y el agotado no",
      porCaducar.some((l) => l.numeroLote === "VENCIDO") && !porCaducar.some((l) => l.numeroLote === "PRONTO"));

    await dbA.producto.create({
      data: { codigoItem: "TAL", descripcion: "Taladro", precioUnitario: 1000, usaSeries: true },
    });
    await dbA.$transaction((tx) =>
      registrarSeries(tx, { codigoItem: "TAL", idSucursal: matriz, series: ["SN-1", "SN-2"], idUsuario: adminA!.idPersona })
    );
    comprobar("registrar series da entrada a la existencia",
      (await stockEnSucursal(dbA, matriz, ["TAL"])).get("TAL") === 2);
    comprobar("no se vende sin indicar la serie", await rechaza(() =>
      dbA.$transaction((tx) =>
        executeSale(tx, { items: [{ codigoItem: "TAL", cantidad: 1 }], metodoPago: "EFECTIVO" },
          { idUsuario: adminA!.idPersona, idCaja: caja.idCaja, idSucursal: matriz })
      )
    ));
    const ventaSerie = await dbA.$transaction((tx) =>
      executeSale(tx, { items: [{ codigoItem: "TAL", cantidad: 1, series: ["sn-2"] }], metodoPago: "EFECTIVO" },
        { idUsuario: adminA!.idPersona, idCaja: caja.idCaja, idSucursal: matriz })
    );
    const sn2 = await dbA.numeroSerie.findFirst({ where: { serie: "SN-2" } });
    comprobar("la serie vendida queda ligada al ticket", sn2?.estado === "VENDIDO" && sn2.folioVenta === ventaSerie.folioVenta);
    comprobar("la misma serie no se vende dos veces", await rechaza(() =>
      dbA.$transaction((tx) =>
        executeSale(tx, { items: [{ codigoItem: "TAL", cantidad: 1, series: ["SN-2"] }], metodoPago: "EFECTIVO" },
          { idUsuario: adminA!.idPersona, idCaja: caja.idCaja, idSucursal: matriz })
      )
    ));
    comprobar("B no ve las series de A", (await dbB.numeroSerie.findMany()).length === 0);
    await dbA.$transaction((tx) =>
      executeReturn(tx, { folioVenta: ventaSerie.folioVenta, items: [{ codigoItem: "TAL", cantidad: 1 }], metodoReembolso: "EFECTIVO" },
        { idUsuario: adminA!.idPersona, idCaja: caja.idCaja, idSucursal: matriz })
    );
    comprobar("la devolución vuelve a dejar disponible la serie",
      (await dbA.numeroSerie.findFirst({ where: { serie: "SN-2" } }))?.estado === "DISPONIBLE");

    await dbA.producto.create({ data: { codigoItem: "PLAY", descripcion: "Playera", precioUnitario: 199 } });
    const vars = await dbA.$transaction((tx) =>
      generarVariantes(tx, "PLAY", [{ nombre: "Talla", valores: ["CH", "M"] }, { nombre: "Color", valores: ["Rojo"] }])
    );
    comprobar("genera una variante por combinación con su propio código",
      vars.creadas.join(",") === "PLAY-CH-ROJO,PLAY-M-ROJO");
    const variante = await dbA.producto.findUnique({ where: claveProducto("PLAY-M-ROJO") });
    comprobar("la variante hereda precio y pertenece al grupo del modelo",
      Number(variante?.precioUnitario) === 199 && variante?.grupoVariante === "PLAY");

    console.log("Compras y costos (Paso 7)");
    const proveedor = await dbA.proveedor.create({ data: { nombre: "Distribuidora" } });
    await dbA.producto.create({ data: { codigoItem: "COMP", descripcion: "Resma", precioUnitario: 20, precioCompra: 5 } });
    await dbA.$transaction((tx) => moverStock(tx, { codigoItem: "COMP", delta: 10, idSucursal: matriz }));
    await dbA.producto.update({ where: claveProducto("COMP"), data: { costoPromedio: 5 } });
    const pedido = await dbA.pedidoProveedor.create({
      data: {
        idProveedor: proveedor.idProveedor,
        totalEstimado: 80,
        createdBy: adminA!.idPersona,
        items: { create: [{ codigoItem: "COMP", cantidad: 10, precioCotizado: 8 }] },
      },
      include: { items: true },
    });
    const parcial = await dbA.$transaction((tx) =>
      recibirPedido(tx, {
        idPedido: pedido.idPedido,
        renglones: [{ idItemPedido: pedido.items[0].idItemPedido, cantidad: 10, costoUnitario: 8 }],
        idUsuario: adminA!.idPersona,
        idSucursal: matriz,
      })
    ).catch((e) => e);
    comprobar("no se recibe más de lo pedido… (10 de 10 sí)", parcial.estado === "ENTREGADO", parcial);
    const comp = await dbA.producto.findUnique({ where: claveProducto("COMP") });
    comprobar("costo promedio ponderado: 10 a $5 + 10 a $8 = $6.50",
      Number(comp?.costoPromedio) === 6.5 && Number(comp?.precioCompra) === 8, comp?.costoPromedio);
    comprobar("un pedido entregado ya no se recibe de nuevo", await rechaza(() =>
      dbA.$transaction((tx) =>
        recibirPedido(tx, { idPedido: pedido.idPedido, renglones: "TODO", idUsuario: adminA!.idPersona, idSucursal: matriz })
      )
    ));
    const pedido2 = await dbA.pedidoProveedor.create({
      data: {
        idProveedor: proveedor.idProveedor,
        totalEstimado: 50,
        createdBy: adminA!.idPersona,
        items: { create: [{ codigoItem: "COMP", cantidad: 5, precioCotizado: 10 }] },
      },
      include: { items: true },
    });
    const r1 = await dbA.$transaction((tx) =>
      recibirPedido(tx, {
        idPedido: pedido2.idPedido,
        renglones: [{ idItemPedido: pedido2.items[0].idItemPedido, cantidad: 2 }],
        idUsuario: adminA!.idPersona,
        idSucursal: matriz,
      })
    );
    comprobar("recepción parcial deja el pedido PARCIAL", r1.estado === "PARCIAL");
    comprobar("no se reciben más de los pendientes", await rechaza(() =>
      dbA.$transaction((tx) =>
        recibirPedido(tx, {
          idPedido: pedido2.idPedido,
          renglones: [{ idItemPedido: pedido2.items[0].idItemPedido, cantidad: 4 }],
          idUsuario: adminA!.idPersona,
          idSucursal: matriz,
        })
      )
    ));
    const r2 = await dbA.$transaction((tx) =>
      recibirPedido(tx, { idPedido: pedido2.idPedido, renglones: "TODO", idUsuario: adminA!.idPersona, idSucursal: matriz })
    );
    comprobar("recibir el resto lo marca ENTREGADO", r2.estado === "ENTREGADO" && r2.recibidos[0].cantidad === 3);
    comprobar("la existencia refleja lo recibido (10 + 10 + 5)",
      (await stockEnSucursal(dbA, matriz, ["COMP"])).get("COMP") === 25);

    const ventaCosto = await dbA.$transaction((tx) =>
      executeSale(tx, { items: [{ codigoItem: "COMP", cantidad: 2 }], metodoPago: "EFECTIVO" },
        { idUsuario: adminA!.idPersona, idCaja: caja.idCaja, idSucursal: matriz })
    );
    const lineaCosto = await dbA.lineaDetalleVenta.findFirst({ where: { folioVenta: ventaCosto.folioVenta } });
    const costoEsperado = Number((await dbA.producto.findUnique({ where: claveProducto("COMP") }))?.costoPromedio);
    comprobar("la venta congela el costo promedio vigente", Number(lineaCosto?.costoUnitario) === costoEsperado);
    const margen = await getReporteData(dbA, "margen", {});
    const filaComp = margen.rows.find((r) => r[0] === "COMP");
    comprobar("el reporte de margen calcula venta − costo",
      !!filaComp && Number(filaComp[3]) === 40 && Number(filaComp[5]) === Math.round((40 - 2 * costoEsperado) * 100) / 100, filaComp);

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
