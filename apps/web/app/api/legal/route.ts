import { NextResponse } from "next/server";
import { MENSAJE_SOLO_DUENO_REAL, requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";
import { actuaComoDueno } from "@/lib/usuarios";
import { aceptarLegal, estadoCuenta } from "@/lib/negocio-cuenta";
import { VERSION_LEGAL } from "@/lib/legal";

// GET  /api/legal → ¿el negocio aceptó la versión vigente de términos y aviso?
// POST /api/legal → el dueño(a) los acepta en nombre del negocio.
export async function GET() {
  const auth = await requireAuth()();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const estado = await estadoCuenta(auth.user.idNegocio);
  const esDueno = await actuaComoDueno(tenantDb(auth.user.idNegocio), auth.user);
  return NextResponse.json({ ...estado, esDueno });
}

export async function POST() {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.user.soporte) return NextResponse.json({ error: MENSAJE_SOLO_DUENO_REAL }, { status: 403 });
  const db = tenantDb(auth.user.idNegocio);
  if (!(await actuaComoDueno(db, auth.user))) {
    return NextResponse.json({ error: "Solo el dueño(a) acepta los términos en nombre del negocio" }, { status: 403 });
  }
  await aceptarLegal(auth.user.idNegocio, auth.user.nombre);
  await db.bitacoraLog.create({
    data: {
      idUsuario: auth.user.idPersona,
      accion: `Aceptación de términos y aviso de privacidad (versión ${VERSION_LEGAL})`,
      moduloSistema: "CONFIGURACION",
    },
  });
  return NextResponse.json({ ok: true, version: VERSION_LEGAL });
}
