import { NextResponse } from "next/server";
import { MENSAJE_SOLO_DUENO_REAL, requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";
import { actuaComoDueno } from "@/lib/usuarios";
import { cambiarPermisoSoporte, estadoCuenta } from "@/lib/negocio-cuenta";
import { esObjetoJson } from "@/lib/validacion";

// GET   /api/configuracion/soporte → ¿el soporte puede entrar al negocio?
// PATCH /api/configuracion/soporte { permitir } → lo decide el dueño(a).
export async function GET() {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { permitirSoporte } = await estadoCuenta(auth.user.idNegocio);
  const accesos = await tenantDb(auth.user.idNegocio).bitacoraLog.findMany({
    where: { accion: { startsWith: "Soporte técnico" } },
    orderBy: { fechaHora: "desc" },
    take: 5,
    select: { fechaHora: true, accion: true },
  });
  return NextResponse.json({ permitirSoporte, accesos });
}

export async function PATCH(request: Request) {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.user.soporte) return NextResponse.json({ error: MENSAJE_SOLO_DUENO_REAL }, { status: 403 });
  const body = await request.json().then((b) => (esObjetoJson(b) ? b : null), () => null);
  if (!body || typeof body.permitir !== "boolean") return NextResponse.json({ error: "Indica permitir: true o false" }, { status: 400 });
  const db = tenantDb(auth.user.idNegocio);
  if (!(await actuaComoDueno(db, auth.user))) {
    return NextResponse.json({ error: "Solo el dueño(a) decide si el soporte puede entrar" }, { status: 403 });
  }
  await cambiarPermisoSoporte(auth.user.idNegocio, body.permitir);
  await db.bitacoraLog.create({
    data: {
      idUsuario: auth.user.idPersona,
      accion: body.permitir ? "Acceso de soporte técnico permitido" : "Acceso de soporte técnico bloqueado",
      moduloSistema: "SEGURIDAD",
    },
  });
  return NextResponse.json({ ok: true, permitirSoporte: body.permitir });
}
