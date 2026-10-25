import { NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";
import { actuaComoDueno } from "@/lib/usuarios";
import { esObjetoJson } from "@/lib/validacion";

// POST /api/usuarios/[id]/dueno { password } → transfiere la propiedad del
// negocio a otra persona activa. Solo el dueño(a), confirmando su contraseña.
// La persona nueva queda como dueño(a) (administradora raíz) y quien la cede
// sigue como administrador(a).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const prisma = tenantDb(auth.user.idNegocio);
  const { id } = await params;
  if (!(await actuaComoDueno(prisma, auth.user))) {
    return NextResponse.json({ error: "Solo el dueño(a) puede transferir la propiedad" }, { status: 403 });
  }
  if (id === auth.user.idPersona) {
    return NextResponse.json({ error: "Ya eres el dueño(a)" }, { status: 400 });
  }
  const body = await request.json().then((b) => (esObjetoJson(b) ? b : {}), () => ({}));
  const yo = await prisma.usuario.findUnique({ where: { idPersona: auth.user.idPersona } });
  if (!yo || typeof body.password !== "string" || !(await compare(body.password, yo.passwordHash))) {
    return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
  }
  const nuevo = await prisma.usuario.findUnique({ where: { idPersona: id } });
  if (!nuevo || !nuevo.activa) {
    return NextResponse.json({ error: "La persona debe existir y estar activa" }, { status: 404 });
  }
  await prisma.$transaction(async (tx) => {
    await tx.usuario.updateMany({ where: { isRoot: true }, data: { isRoot: false } });
    await tx.usuario.update({
      where: { idPersona: id },
      data: {
        rol: "ADMINISTRADORA",
        isRoot: true,
        idPerfil: null,
        permisoCobrar: true,
        permisoInventario: true,
        permisoReportes: true,
      },
    });
    await tx.bitacoraLog.create({
      data: {
        idUsuario: auth.user.idPersona,
        accion: `Propiedad del negocio transferida de ${yo.nombre} a ${nuevo.nombre}`,
        moduloSistema: "SEGURIDAD",
      },
    });
  });
  return NextResponse.json({ ok: true, dueno: nuevo.nombre });
}
