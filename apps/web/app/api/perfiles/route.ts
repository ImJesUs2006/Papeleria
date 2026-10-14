import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";
import { PerfilError, validarPerfil, type PerfilInput } from "@/lib/perfiles";

// ============================================================
// GET  /api/perfiles → perfiles del negocio con cuántos usuarios tienen
// POST /api/perfiles → alta { nombre, rolBase, permiso* }
// Solo administradora.
// ============================================================

export async function GET() {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  const perfiles = await prisma.perfil.findMany({
    orderBy: { nombre: "asc" },
    include: { _count: { select: { usuarios: true } } },
  });
  return NextResponse.json({
    perfiles: perfiles.map(({ _count, ...p }) => ({ ...p, usuarios: _count.usuarios })),
  });
}

export async function POST(request: Request) {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  try {
    const data = validarPerfil(body) as PerfilInput;
    const existe = await prisma.perfil.findFirst({ where: { nombre: data.nombre } });
    if (existe) throw new PerfilError("Ya existe un perfil con ese nombre", 409);
    const perfil = await prisma.perfil.create({ data });
    await prisma.bitacoraLog.create({
      data: {
        idUsuario: auth.user.idPersona,
        accion: `Perfil creado: ${perfil.nombre} (${perfil.rolBase})`,
        moduloSistema: "SEGURIDAD",
        jsonPayload: { ...data },
      },
    });
    return NextResponse.json({ perfil: { ...perfil, usuarios: 0 } }, { status: 201 });
  } catch (error) {
    if (error instanceof PerfilError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[perfiles:post]", error);
    return NextResponse.json({ error: "Error al crear el perfil" }, { status: 500 });
  }
}
