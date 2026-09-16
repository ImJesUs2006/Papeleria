import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { hash, compare } from "bcryptjs";
import { requireAuth } from "@/lib/auth";

// ============================================================
// POST /api/usuarios/[id]/password
//   - ADMINISTRADORA puede restablecer la de cualquiera.
//   - La propia persona puede cambiarla, pero debe demostrar
//     la contraseña actual.
// ============================================================

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const user = auth.user;
  const { id } = await params;

  const esAdmin = user.rol === "ADMINISTRADORA";
  const esPropia = user.idPersona === id;

  if (!esAdmin && !esPropia) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 8) {
    return NextResponse.json(
      { error: "La nueva contraseña debe tener al menos 8 caracteres" },
      { status: 400 }
    );
  }

  const target = await prisma.usuario.findUnique({ where: { idPersona: id } });
  if (!target) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  // Cambio propio (no admin): exige la contraseña actual.
  if (esPropia && !esAdmin) {
    const actual = typeof body.currentPassword === "string" ? body.currentPassword : "";
    if (!actual || !(await compare(actual, target.passwordHash))) {
      return NextResponse.json({ error: "Contraseña actual incorrecta" }, { status: 401 });
    }
  }

  try {
    const passwordHash = await hash(password, 10);
    await prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { idPersona: id },
        data: { passwordHash, passwordCambiadaEn: new Date() },
      });
      await tx.bitacoraLog.create({
        data: {
          idUsuario: user.idPersona,
          accion: esPropia
            ? `Cambio de contraseña propio (${target.username})`
            : `Restablecimiento de contraseña de ${target.username}`,
          moduloSistema: "SEGURIDAD",
          jsonPayload: { idAfectado: id, porAdmin: !esPropia },
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error al cambiar contraseña" }, { status: 500 });
  }
}