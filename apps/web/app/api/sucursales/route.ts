import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";
import { esObjetoJson } from "@/lib/validacion";

// ============================================================
// GET  /api/sucursales → sucursales del negocio + cuál es la activa
// POST /api/sucursales → alta { nombre, direccion? } (administradora)
// ============================================================

export async function GET() {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  const sucursales = await prisma.sucursal.findMany({
    orderBy: [{ esMatriz: "desc" }, { nombre: "asc" }],
    include: { _count: { select: { usuarios: true } } },
  });
  return NextResponse.json({
    activa: auth.user.idSucursal ?? null,
    sucursales: sucursales.map(({ _count, ...s }) => ({ ...s, usuarios: _count.usuarios })),
  });
}

export async function POST(request: Request) {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);

  let body: any;
  try {
    body = await request.json();
    if (!esObjetoJson(body)) throw new TypeError("Se esperaba un objeto JSON");
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const nombre = String(body?.nombre ?? "").trim();
  if (nombre.length < 2 || nombre.length > 60) {
    return NextResponse.json({ error: "El nombre debe tener entre 2 y 60 caracteres" }, { status: 400 });
  }
  const repetida = await prisma.sucursal.findFirst({
    where: { nombre: { equals: nombre, mode: "insensitive" } },
  });
  if (repetida) {
    return NextResponse.json({ error: "Ya existe una sucursal con ese nombre" }, { status: 409 });
  }
  const direccion = String(body?.direccion ?? "").trim().slice(0, 200) || null;
  const sucursal = await prisma.sucursal.create({ data: { nombre, direccion } });
  await prisma.bitacoraLog.create({
    data: {
      idUsuario: auth.user.idPersona,
      accion: `Sucursal creada: ${nombre}`,
      moduloSistema: "CONFIGURACION",
    },
  });
  return NextResponse.json({ sucursal: { ...sucursal, usuarios: 0 } }, { status: 201 });
}
