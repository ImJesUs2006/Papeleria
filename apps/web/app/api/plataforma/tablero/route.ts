import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { requirePlataforma } from "@/lib/plataforma";
import { claveDia } from "@/lib/analitica";
import { TIPO_NEGOCIO, type TipoNegocio } from "@/lib/business-types";

// GET /api/plataforma/tablero → gráficas de la consola: ventas de todos los
// negocios por día (30 días), negocios por giro, altas por mes y negocios
// activos que llevan 7 días sin vender.
const DIA = 86_400_000;

export async function GET() {
  if (!(await requirePlataforma())) return NextResponse.json({ error: "Sin sesión de plataforma" }, { status: 401 });
  const hoy = new Date();
  const desde = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 29);
  const [ventas, negocios, ultimas] = await Promise.all([
    prisma.venta.findMany({
      where: { fechaHora: { gte: desde }, estado: { not: "CANCELADA" } },
      select: { fechaHora: true, totalNeto: true },
    }),
    prisma.negocio.findMany({
      select: { idNegocio: true, nombre: true, codigo: true, activo: true, createdAt: true, configuracion: { select: { tipoNegocio: true, nombreNegocio: true } } },
    }),
    prisma.venta.groupBy({ by: ["idNegocio"], _max: { fechaHora: true } }),
  ]);

  const porDia = new Map<string, number>();
  for (let i = 0; i < 30; i++) porDia.set(claveDia(new Date(desde.getTime() + i * DIA + 2 * 3_600_000)), 0);
  for (const v of ventas) {
    const k = claveDia(v.fechaHora);
    if (porDia.has(k)) porDia.set(k, porDia.get(k)! + Number(v.totalNeto));
  }

  const porGiro = new Map<string, number>();
  for (const n of negocios) {
    const g = n.configuracion?.tipoNegocio ? TIPO_NEGOCIO[n.configuracion.tipoNegocio as TipoNegocio] : "Sin configurar";
    porGiro.set(g, (porGiro.get(g) ?? 0) + 1);
  }

  const meses: Array<{ mes: string; altas: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const m = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const sig = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    meses.push({
      mes: m.toLocaleDateString("es-MX", { month: "short", year: "2-digit" }),
      altas: negocios.filter((n) => n.createdAt >= m && n.createdAt < sig).length,
    });
  }

  const hace7 = new Date(hoy.getTime() - 7 * DIA);
  const inactivos = negocios
    .filter((n) => n.activo)
    .map((n) => ({ n, ultima: ultimas.find((u) => u.idNegocio === n.idNegocio)?._max.fechaHora ?? null }))
    .filter((x) => !x.ultima || x.ultima < hace7)
    .map((x) => ({ idNegocio: x.n.idNegocio, nombre: x.n.configuracion?.nombreNegocio || x.n.nombre, codigo: x.n.codigo, ultimaVenta: x.ultima }));

  return NextResponse.json({
    ventasPorDia: [...porDia.entries()].map(([dia, total]) => ({ dia, total: Math.round(total * 100) / 100 })),
    porGiro: [...porGiro.entries()].map(([giro, negocios]) => ({ giro, negocios })).sort((a, b) => b.negocios - a.negocios),
    altasPorMes: meses,
    inactivos,
  });
}
