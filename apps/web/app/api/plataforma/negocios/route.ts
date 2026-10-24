import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { requirePlataforma } from "@/lib/plataforma";
import { crearNegocio, NegocioError } from "@/lib/negocios";
import { tenantDb } from "@/lib/tenant";
import { CONFIG_PROPIA } from "@/lib/snapshots";
import { PRESETS_POR_NEGOCIO, TIPO_NEGOCIO, type TipoNegocio } from "@/lib/business-types";
import { presetPorGiro } from "@/lib/personalizacion";
import { cargarCatalogoEjemplo } from "@/lib/cargar-catalogo";

// ============================================================
// GET  /api/plataforma/negocios → todos los negocios con su actividad
// POST /api/plataforma/negocios → alta con giro y catálogo de ejemplo
// Solo con sesión de plataforma (cliente global: opera sobre todos).
// ============================================================

const DIA = 86_400_000;

export async function GET() {
  if (!(await requirePlataforma())) return NextResponse.json({ error: "Sin sesión de plataforma" }, { status: 401 });

  const hace30 = new Date(Date.now() - 30 * DIA);
  const negocios = await prisma.negocio.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      configuracion: { select: { tipoNegocio: true, setupPendiente: true, nombreNegocio: true } },
      _count: { select: { usuarios: true, productos: true, sucursales: true } },
    },
  });
  const ventas = await prisma.venta.groupBy({
    by: ["idNegocio"],
    where: { fechaHora: { gte: hace30 }, estado: { not: "CANCELADA" } },
    _sum: { totalNeto: true },
    _count: { _all: true },
  });
  const ultima = await prisma.venta.groupBy({ by: ["idNegocio"], _max: { fechaHora: true } });

  return NextResponse.json({
    negocios: negocios.map((n) => {
      const v = ventas.find((x) => x.idNegocio === n.idNegocio);
      return {
        idNegocio: n.idNegocio,
        codigo: n.codigo,
        nombre: n.configuracion?.nombreNegocio || n.nombre,
        activo: n.activo,
        giro: n.configuracion?.tipoNegocio ?? null,
        setupPendiente: n.configuracion?.setupPendiente ?? true,
        creado: n.createdAt,
        usuarios: n._count.usuarios,
        productos: n._count.productos,
        sucursales: n._count.sucursales,
        ventas30: v?._count._all ?? 0,
        importe30: Math.round(Number(v?._sum.totalNeto ?? 0) * 100) / 100,
        ultimaVenta: ultima.find((x) => x.idNegocio === n.idNegocio)?._max.fechaHora ?? null,
      };
    }),
  });
}

export async function POST(request: Request) {
  if (!(await requirePlataforma())) return NextResponse.json({ error: "Sin sesión de plataforma" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  const tipo: TipoNegocio = body.tipoNegocio in TIPO_NEGOCIO ? body.tipoNegocio : "PAPELERIA_RETAIL";

  try {
    const negocio = await crearNegocio(prisma, body);
    const db = tenantDb(negocio.idNegocio);
    // Plantilla del giro: el asistente inicial seguirá pendiente, pero ya
    // arranca con módulos, pagos y vocabulario del giro.
    const p = PRESETS_POR_NEGOCIO[tipo];
    await db.configuracionNegocio.update({
      where: CONFIG_PROPIA,
      data: {
        tipoNegocio: tipo,
        featureFlags: p.featureFlags,
        metodosPago: p.metodosPago,
        politicaStockOffline: p.politicaStockOffline,
        usarCaducidad: p.usarCaducidad,
        usarUbicaciones: p.usarUbicaciones,
        personalizacion: presetPorGiro(tipo) as any,
      },
    });
    let catalogo = null;
    if (body.catalogoEjemplo === true) {
      catalogo = await db.$transaction(
        (tx) => cargarCatalogoEjemplo(tx, tipo, { idUsuario: negocio.idAdmin, idSucursal: negocio.idSucursal }),
        { timeout: 60_000 }
      );
    }
    return NextResponse.json({ ...negocio, giro: tipo, catalogo }, { status: 201 });
  } catch (error) {
    if (error instanceof NegocioError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[plataforma:negocios:post]", error);
    return NextResponse.json({ error: "No se pudo crear el negocio" }, { status: 500 });
  }
}
