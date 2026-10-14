import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";
import { ejecutarTraspaso, TraspasoError } from "@/lib/traspasos";

// ============================================================
// GET  /api/traspasos → últimos traspasos del negocio
// POST /api/traspasos → { idOrigen?, idDestino, items[], notas? }
//                       (origen por defecto: la sucursal activa)
// Requiere permiso de inventario.
// ============================================================

export async function GET() {
  const auth = await requireAuth(["ADMINISTRADORA"], { permiso: "inventario" })();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  const [traspasos, sucursales] = await Promise.all([
    prisma.traspaso.findMany({ orderBy: { fecha: "desc" }, take: 100 }),
    prisma.sucursal.findMany({ select: { idSucursal: true, nombre: true } }),
  ]);
  const nombre = new Map(sucursales.map((s) => [s.idSucursal, s.nombre]));
  return NextResponse.json({
    traspasos: traspasos.map((t) => ({
      ...t,
      origen: nombre.get(t.idOrigen) ?? "—",
      destino: nombre.get(t.idDestino) ?? "—",
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireAuth(["ADMINISTRADORA"], { permiso: "inventario" })();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // Solo la administradora mueve mercancía desde una sucursal que no es la suya.
  const idOrigen =
    auth.user.rol === "ADMINISTRADORA" && typeof body?.idOrigen === "string" && body.idOrigen
      ? body.idOrigen
      : auth.user.idSucursal;

  try {
    const resultado = await prisma.$transaction((tx) =>
      ejecutarTraspaso(
        tx,
        {
          idOrigen: String(idOrigen ?? ""),
          idDestino: String(body?.idDestino ?? ""),
          items: Array.isArray(body?.items) ? body.items : [],
          notas: body?.notas ?? null,
        },
        auth.user.idPersona
      )
    );
    return NextResponse.json(resultado, { status: 201 });
  } catch (error) {
    if (error instanceof TraspasoError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[traspasos:post]", error);
    return NextResponse.json({ error: "Error al registrar el traspaso" }, { status: 500 });
  }
}
