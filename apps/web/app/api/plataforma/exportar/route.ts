import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@papeleria/database";
import { registrarPlataforma, requirePlataforma } from "@/lib/plataforma";
import { nivelDe, NIVELES } from "@/lib/roles";
import { TIPO_NEGOCIO, type TipoNegocio } from "@/lib/business-types";

// GET /api/plataforma/exportar → Excel con dos hojas: Negocios (con su
// actividad de 30 días) y Usuarios (de todos los negocios, sin contraseñas).
const DIA = 86_400_000;

export async function GET() {
  if (!(await requirePlataforma())) return NextResponse.json({ error: "Sin sesión de plataforma" }, { status: 401 });
  const hace30 = new Date(Date.now() - 30 * DIA);
  const [negocios, ventas, ultimas, usuarios] = await Promise.all([
    prisma.negocio.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        configuracion: { select: { nombreNegocio: true, tipoNegocio: true, setupPendiente: true } },
        _count: { select: { usuarios: true, productos: true, sucursales: true, clientes: true } },
      },
    }),
    prisma.venta.groupBy({
      by: ["idNegocio"],
      where: { fechaHora: { gte: hace30 }, estado: { not: "CANCELADA" } },
      _sum: { totalNeto: true },
      _count: { _all: true },
    }),
    prisma.venta.groupBy({ by: ["idNegocio"], _max: { fechaHora: true } }),
    prisma.usuario.findMany({
      where: { eliminadoEn: null },
      orderBy: [{ idNegocio: "asc" }, { nombre: "asc" }],
      select: { idNegocio: true, nombre: true, username: true, rol: true, isRoot: true, activa: true, permisoInventario: true, permisoReportes: true, ultimoLoginAt: true },
    }),
  ]);
  const nombreDe = new Map(negocios.map((n) => [n.idNegocio, n.configuracion?.nombreNegocio || n.nombre]));

  const wb = new ExcelJS.Workbook();
  const h1 = wb.addWorksheet("Negocios", { views: [{ state: "frozen", ySplit: 1 }] });
  h1.columns = [
    { header: "Código", key: "codigo", width: 18 },
    { header: "Negocio", key: "nombre", width: 30 },
    { header: "Giro", key: "giro", width: 18 },
    { header: "Estado", key: "estado", width: 12 },
    { header: "Configuración", key: "setup", width: 14 },
    { header: "Alta", key: "alta", width: 12, style: { numFmt: "dd/mm/yyyy" } },
    { header: "Usuarios", key: "usuarios", width: 10 },
    { header: "Productos", key: "productos", width: 10 },
    { header: "Clientes", key: "clientes", width: 10 },
    { header: "Sucursales", key: "sucursales", width: 10 },
    { header: "Tickets 30 días", key: "tickets", width: 14 },
    { header: "Ventas 30 días", key: "importe", width: 16, style: { numFmt: '"$"#,##0.00' } },
    { header: "Última venta", key: "ultima", width: 14, style: { numFmt: "dd/mm/yyyy" } },
  ];
  for (const n of negocios) {
    const v = ventas.find((x) => x.idNegocio === n.idNegocio);
    h1.addRow({
      codigo: n.codigo,
      nombre: nombreDe.get(n.idNegocio),
      giro: n.configuracion?.tipoNegocio ? TIPO_NEGOCIO[n.configuracion.tipoNegocio as TipoNegocio] : "—",
      estado: n.activo ? "Activo" : "Suspendido",
      setup: n.configuracion?.setupPendiente === false ? "Completa" : "Pendiente",
      alta: n.createdAt,
      usuarios: n._count.usuarios,
      productos: n._count.productos,
      clientes: n._count.clientes,
      sucursales: n._count.sucursales,
      tickets: v?._count._all ?? 0,
      importe: Number(v?._sum.totalNeto ?? 0),
      ultima: ultimas.find((u) => u.idNegocio === n.idNegocio)?._max.fechaHora ?? null,
    });
  }
  const h2 = wb.addWorksheet("Usuarios", { views: [{ state: "frozen", ySplit: 1 }] });
  h2.columns = [
    { header: "Negocio", key: "negocio", width: 30 },
    { header: "Nombre", key: "nombre", width: 26 },
    { header: "Usuario", key: "username", width: 18 },
    { header: "Tipo", key: "tipo", width: 18 },
    { header: "Estado", key: "estado", width: 12 },
    { header: "Último acceso", key: "acceso", width: 18, style: { numFmt: "dd/mm/yyyy hh:mm" } },
  ];
  for (const u of usuarios) {
    h2.addRow({
      negocio: nombreDe.get(u.idNegocio) ?? u.idNegocio,
      nombre: u.nombre,
      username: u.username,
      tipo: NIVELES[nivelDe(u)].titulo,
      estado: u.activa ? "Activo" : "Inactivo",
      acceso: u.ultimoLoginAt,
    });
  }
  for (const h of [h1, h2]) {
    h.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    h.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4338CA" } };
  }
  await registrarPlataforma("Exportación a Excel de negocios y usuarios");
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="plataforma-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
