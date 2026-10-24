import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@papeleria/database";
import { requirePlataforma } from "@/lib/plataforma";

// ============================================================
// PATCH /api/plataforma/negocios/[id]
//   { activo: boolean }           → suspende / reactiva el negocio
//   { nuevaClaveAdmin: string }   → restablece la clave de su administradora
// Cada acción queda en la bitácora de ESE negocio.
// ============================================================

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requirePlataforma())) return NextResponse.json({ error: "Sin sesión de plataforma" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const negocio = await prisma.negocio.findUnique({ where: { idNegocio: id } });
  if (!negocio) return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 });
  const admin = await prisma.usuario.findFirst({
    where: { idNegocio: id, rol: "ADMINISTRADORA", activa: true },
    orderBy: [{ isRoot: "desc" }, { createdAt: "asc" }],
    select: { idPersona: true, username: true },
  });
  const bitacora = (accion: string) =>
    admin
      ? prisma.bitacoraLog.create({
          data: { idNegocio: id, idUsuario: admin.idPersona, accion: `[Plataforma] ${accion}`, moduloSistema: "SEGURIDAD" },
        })
      : Promise.resolve(null);

  if (typeof body?.activo === "boolean") {
    await prisma.negocio.update({ where: { idNegocio: id }, data: { activo: body.activo } });
    await bitacora(body.activo ? "Negocio reactivado" : "Negocio suspendido: nadie puede iniciar sesión");
    return NextResponse.json({ activo: body.activo });
  }

  if (body?.nuevaClaveAdmin !== undefined) {
    const clave = String(body.nuevaClaveAdmin);
    if (clave.length < 8) {
      return NextResponse.json({ error: "La nueva contraseña debe tener al menos 8 caracteres" }, { status: 400 });
    }
    if (!admin) return NextResponse.json({ error: "El negocio no tiene una administradora activa" }, { status: 409 });
    await prisma.usuario.update({
      where: { idPersona: admin.idPersona },
      data: { passwordHash: await hash(clave, 12) },
    });
    await bitacora(`Contraseña de ${admin.username} restablecida por soporte`);
    return NextResponse.json({ ok: true, usuario: admin.username });
  }

  return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
}
