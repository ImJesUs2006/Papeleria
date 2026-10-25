import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getBusinessConfig } from "@/lib/feature-flags";
import { aplicarSetup, SetupError } from "@/lib/setup-negocio";
import { buildSignedConfig } from "@/lib/config-signing";
import { tenantDb } from "@/lib/tenant";
import { esObjetoJson } from "@/lib/validacion";

// ============================================================
// GET /api/setup                 → estado del wizard
// POST /api/setup                → primer arranque de la plantilla
//    (solo ADMINISTRADORA, o único usuario sin config)
// ============================================================

export async function GET() {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const config = await getBusinessConfig(auth.user.idNegocio);
  return NextResponse.json({
    setupPendiente: config.setupPendiente,
    tipoNegocio: config.tipoNegocio,
    configVersion: config.configVersion,
  });
}

export async function POST(request: Request) {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  const user = auth.user;

  if (user.rol !== "ADMINISTRADORA") {
    return NextResponse.json({ error: "Solo la administradora configura el negocio" }, { status: 403 });
  }

  let body: any;
  try {
    body = await request.json();
    if (!esObjetoJson(body)) throw new TypeError("Se esperaba un objeto JSON");
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  try {
    await aplicarSetup(prisma as any, body, user.idPersona);
    const configurable = await getBusinessConfig(user.idNegocio);
    const signed = buildSignedConfig(configurable);

    return NextResponse.json({ ok: true, ...signed }, { status: 201 });
  } catch (error) {
    if (error instanceof SetupError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Error al guardar la configuración" }, { status: 500 });
  }
}