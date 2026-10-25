import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { MENSAJE_SOLO_DUENO_REAL, requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";
import { actuaComoDueno } from "@/lib/usuarios";

// ============================================================
// GET /api/respaldo → Excel con la información del negocio para que el
// dueño(a) la guarde por su cuenta o se la lleve: productos, clientes,
// proveedores, ventas con su detalle y usuarios (sin contraseñas).
// Solo el dueño(a): incluye datos personales de clientes.
// ============================================================

const MAX_FILAS = 100_000;
const n = (v: unknown) => (v == null ? null : Number(v));

export async function GET() {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.user.soporte) return NextResponse.json({ error: MENSAJE_SOLO_DUENO_REAL }, { status: 403 });
  const db = tenantDb(auth.user.idNegocio);
  if (!(await actuaComoDueno(db, auth.user))) {
    return NextResponse.json({ error: "Solo el dueño(a) descarga el respaldo completo del negocio" }, { status: 403 });
  }

  const [productos, clientes, proveedores, ventas, lineas, usuarios] = await Promise.all([
    db.producto.findMany({ orderBy: { codigoItem: "asc" }, include: { categoria: { select: { nombre: true } } }, take: MAX_FILAS }),
    db.cliente.findMany({ orderBy: { nombre: "asc" }, take: MAX_FILAS }),
    db.proveedor.findMany({ orderBy: { nombre: "asc" }, take: MAX_FILAS }),
    db.venta.findMany({ orderBy: { fechaHora: "asc" }, include: { usuario: { select: { nombre: true } } }, take: MAX_FILAS }),
    db.lineaDetalleVenta.findMany({ orderBy: { folioVenta: "asc" }, take: MAX_FILAS }),
    db.usuario.findMany({ where: { eliminadoEn: null }, orderBy: { nombre: "asc" } }),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Respaldo del negocio";
  const hoja = (nombre: string, columnas: Array<[string, string, number?]>, filas: Record<string, unknown>[]) => {
    const h = wb.addWorksheet(nombre, { views: [{ state: "frozen", ySplit: 1 }] });
    h.columns = columnas.map(([header, key, width]) => ({ header, key, width: width ?? 16 }));
    h.getRow(1).font = { bold: true };
    for (const f of filas) h.addRow(f);
  };

  hoja(
    "Productos",
    [["Código", "codigo"], ["Descripción", "descripcion", 36], ["Categoría", "categoria"], ["Precio", "precio", 12], ["Costo", "costo", 12],
     ["Existencia", "stock", 12], ["Mínimo", "minimo", 10], ["Código de barras", "barras"], ["IVA propio", "iva", 10], ["Exento", "exento", 8],
     ["IEPS", "ieps", 8], ["Activo", "activo", 8]],
    productos.map((p) => ({
      codigo: p.codigoItem, descripcion: p.descripcion, categoria: p.categoria?.nombre ?? "", precio: n(p.precioUnitario),
      costo: n(p.costoPromedio ?? p.precioCompra), stock: n(p.stockActual), minimo: n(p.stockMinimo), barras: p.codigoBarras ?? "",
      iva: n(p.tasaIva), exento: p.exentoIva ? "Sí" : "", ieps: n(p.tasaIeps), activo: p.activo ? "Sí" : "No",
    }))
  );
  hoja(
    "Clientes",
    [["Nombre", "nombre", 28], ["Teléfono", "telefono"], ["Correo", "email", 24], ["RFC", "rfc"], ["Razón social", "razon", 28],
     ["Régimen", "regimen", 10], ["CP fiscal", "cp", 10], ["Uso CFDI", "uso", 10], ["Puntos", "puntos", 10], ["Saldo deudor", "saldo", 12], ["Alta", "alta", 12]],
    clientes.map((c) => ({
      nombre: c.nombre, telefono: c.telefono ?? "", email: c.email ?? "", rfc: c.rfc ?? "", razon: c.razonSocial ?? "",
      regimen: c.regimenFiscal ?? "", cp: c.codigoPostalFiscal ?? "", uso: c.usoCfdi ?? "", puntos: c.puntosFidelidad,
      saldo: n(c.saldoDeudor), alta: c.createdAt,
    }))
  );
  hoja(
    "Proveedores",
    [["Nombre", "nombre", 28], ["Contacto", "contacto"], ["Teléfono", "telefono"], ["Correo", "email", 24], ["Días de crédito", "dias", 10], ["Saldo", "saldo", 12]],
    proveedores.map((p) => ({
      nombre: p.nombre, contacto: p.contacto ?? "", telefono: p.telefono ?? "", email: p.email ?? "", dias: p.diasCredito, saldo: n(p.saldoCredito),
    }))
  );
  hoja(
    "Ventas",
    [["Folio", "folio", 22], ["Fecha", "fecha", 18], ["Cajero(a)", "cajero", 20], ["Método", "metodo", 14], ["Subtotal", "subtotal", 12],
     ["IVA", "iva", 10], ["IEPS", "ieps", 10], ["Descuento", "descuento", 10], ["Total", "total", 12], ["Estado", "estado", 12]],
    ventas.map((v) => ({
      folio: v.folioVenta, fecha: v.fechaHora, cajero: v.usuario?.nombre ?? "", metodo: v.metodoPago, subtotal: n(v.subtotal), iva: n(v.iva),
      ieps: n(v.ieps), descuento: n(v.descuentoTotal), total: n(v.totalNeto), estado: v.estado,
    }))
  );
  hoja(
    "Detalle de ventas",
    [["Folio", "folio", 22], ["Código", "codigo"], ["Cantidad", "cantidad", 10], ["Precio", "precio", 12], ["Descuento", "descuento", 10], ["Importe", "importe", 12], ["IVA", "iva", 10]],
    lineas.map((l) => ({
      folio: l.folioVenta, codigo: l.codigoItem, cantidad: n(l.cantidad), precio: n(l.precioMomento), descuento: n(l.descuentoLinea),
      importe: n(l.subtotalLinea), iva: n(l.ivaLinea),
    }))
  );
  hoja(
    "Usuarios",
    [["Nombre", "nombre", 24], ["Usuario", "usuario"], ["Rol", "rol", 16], ["Dueño(a)", "dueno", 10], ["Activo", "activo", 8], ["Correo", "email", 24], ["Último acceso", "ultimo", 18]],
    usuarios.map((u) => ({
      nombre: u.nombre, usuario: u.username, rol: u.rol, dueno: u.isRoot ? "Sí" : "", activo: u.activa ? "Sí" : "No", email: u.email ?? "", ultimo: u.ultimoLoginAt,
    }))
  );
  for (const h of ["Ventas"]) wb.getWorksheet(h)!.getColumn(2).numFmt = "dd/mm/yyyy hh:mm";

  await db.bitacoraLog.create({
    data: {
      idUsuario: auth.user.idPersona,
      accion: `Respaldo del negocio descargado (${productos.length} productos, ${clientes.length} clientes, ${ventas.length} ventas)`,
      moduloSistema: "SEGURIDAD",
    },
  });

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="respaldo-negocio-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
