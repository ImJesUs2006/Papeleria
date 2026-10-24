import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";
import { PerfilError, validarPerfil, valoresDePerfil } from "@/lib/perfiles";
import { esObjetoJson } from "@/lib/validacion";

// ============================================================
// PATCH  /api/perfiles/[id] → edita el perfil y PROPAGA rol y permisos a
//                             todos los usuarios que lo tienen.
// DELETE /api/perfiles/[id] → elimina; sus usuarios conservan sus permisos
//                             actuales (solo pierden el nombre del perfil).
// Solo administradora.
// ============================================================

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
    if (!esObjetoJson(body)) throw new TypeError("Se esperaba un objeto JSON");
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  try {
    const cambios = validarPerfil(body, true);
    const actual = await prisma.perfil.findUnique({ where: { idPerfil: id } });
    if (!actual) throw new PerfilError("Perfil no encontrado", 404);
    if (cambios.nombre && cambios.nombre !== actual.nombre) {
      const repetido = await prisma.perfil.findFirst({ where: { nombre: cambios.nombre } });
      if (repetido) throw new PerfilError("Ya existe un perfil con ese nombre", 409);
    }
    const final = { ...actual, ...cambios };

    // Bajar un perfil de administración no puede dejar al negocio sin
    // ninguna administradora activa.
    if (actual.rolBase === "ADMINISTRADORA" && final.rolBase !== "ADMINISTRADORA") {
      const fuera = await prisma.usuario.count({
        where: {
          rol: "ADMINISTRADORA",
          activa: true,
          OR: [{ idPerfil: null }, { idPerfil: { not: id } }],
        },
      });
      if (fuera === 0) {
        throw new PerfilError("No se puede dejar el negocio sin administradora activa", 409);
      }
    }

    const resultado = await prisma.$transaction(async (tx) => {
      const perfil = await tx.perfil.update({ where: { idPerfil: id }, data: cambios });
      const propagados = await tx.usuario.updateMany({
        where: { idPerfil: id },
        data: valoresDePerfil(perfil),
      });
      await tx.bitacoraLog.create({
        data: {
          idUsuario: auth.user.idPersona,
          accion: `Perfil ${perfil.nombre} actualizado (${propagados.count} usuarios)`,
          moduloSistema: "SEGURIDAD",
          jsonPayload: { idPerfil: id, cambios },
        },
      });
      return { perfil, usuarios: propagados.count };
    });
    return NextResponse.json(resultado);
  } catch (error) {
    if (error instanceof PerfilError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[perfiles:patch]", error);
    return NextResponse.json({ error: "Error al actualizar el perfil" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  const { id } = await params;

  const r = await prisma.$transaction(async (tx) => {
    await tx.usuario.updateMany({ where: { idPerfil: id }, data: { idPerfil: null } });
    return tx.perfil.deleteMany({ where: { idPerfil: id } });
  });
  if (r.count === 0) {
    return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
