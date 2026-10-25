import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { registrarPlataforma, requirePlataforma } from "@/lib/plataforma";
import { tenantDb } from "@/lib/tenant";
import { aplicarSetup, SetupError } from "@/lib/setup-negocio";
import { cargarCatalogoEjemplo } from "@/lib/cargar-catalogo";
import { esObjetoJson } from "@/lib/validacion";

// POST /api/plataforma/negocios/[id]/setup { …asistente, catalogoEjemplo? }
// → el MISMO asistente de configuración inicial, aplicado desde la consola
// al dar de alta un negocio (así la administradora entra con todo listo).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requirePlataforma())) return NextResponse.json({ error: "Sin sesión de plataforma" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().then((b) => (esObjetoJson(b) ? b : null), () => null);
  if (!body) return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  const negocio = await prisma.negocio.findUnique({ where: { idNegocio: id } });
  if (!negocio) return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 });
  const admin = await prisma.usuario.findFirst({
    where: { idNegocio: id, rol: "ADMINISTRADORA", activa: true },
    orderBy: [{ isRoot: "desc" }, { createdAt: "asc" }],
  });
  if (!admin) return NextResponse.json({ error: "El negocio no tiene administradora" }, { status: 409 });
  const db = tenantDb(id);
  try {
    // `catalogoEjemplo` es de la consola, no de la configuración (que se valida estricta).
    const { catalogoEjemplo: _catalogo, ...configuracion } = body;
    const r = await aplicarSetup(db as any, configuracion, admin.idPersona);
    let catalogo = null;
    if (body.catalogoEjemplo === true) {
      const matriz = await db.sucursal.findFirst({ where: { esMatriz: true } });
      catalogo = await db.$transaction(
        (tx) => cargarCatalogoEjemplo(tx, r.tipoNegocio, { idUsuario: admin.idPersona, idSucursal: matriz?.idSucursal ?? null }),
        { timeout: 60_000 }
      );
    }
    await registrarPlataforma(`Asistente aplicado a ${negocio.nombre} (${r.tipoNegocio})`, id, { catalogo: catalogo?.productos ?? 0 });
    return NextResponse.json({ ok: true, ...r, catalogo }, { status: 201 });
  } catch (e) {
    if (e instanceof SetupError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[plataforma:setup]", e);
    return NextResponse.json({ error: "No se pudo aplicar la configuración" }, { status: 500 });
  }
}
