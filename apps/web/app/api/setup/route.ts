import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { requireAuth } from "@/lib/auth";
import { getBusinessConfig, CONFIG_ID } from "@/lib/feature-flags";
import { validateConfigInput } from "@/lib/validate-config";
import { buildSignedConfig } from "@/lib/config-signing";

// ============================================================
// GET /api/setup                 → estado del wizard
// POST /api/setup                → primer arranque de la plantilla
//    (solo ADMINISTRADORA, o único usuario sin config)
// ============================================================

export async function GET() {
  const config = await getBusinessConfig();
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
  const user = auth.user;

  if (user.rol !== "ADMINISTRADORA") {
    return NextResponse.json({ error: "Solo la administradora configura el negocio" }, { status: 403 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = validateConfigInput(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const previa = await prisma.configuracionNegocio.findUnique({ where: { id: CONFIG_ID } });
    const proximaVersion = (previa?.configVersion ?? 0) + 1;

    const guardada = await prisma.configuracionNegocio.upsert({
      where: { id: CONFIG_ID },
      update: {
        nombreNegocio: parsed.data.nombreNegocio,
        tipoNegocio: parsed.data.tipoNegocio,
        metodosPago: parsed.data.metodosPago,
        featureFlags: parsed.data.featureFlags,
        ivaRate: parsed.data.ivaRate,
        politicaStockOffline: parsed.data.politicaStockOffline,
        configVersion: proximaVersion,
        setupPendiente: false,
        updatedById: user.idPersona,
      },
      create: {
        id: CONFIG_ID,
        nombreNegocio: parsed.data.nombreNegocio,
        tipoNegocio: parsed.data.tipoNegocio,
        metodosPago: parsed.data.metodosPago,
        featureFlags: parsed.data.featureFlags,
        ivaRate: parsed.data.ivaRate,
        politicaStockOffline: parsed.data.politicaStockOffline,
        configVersion: proximaVersion,
        setupPendiente: false,
        updatedById: user.idPersona,
      },
    });

    await prisma.bitacoraLog.create({
      data: {
        idUsuario: user.idPersona,
        accion: `Setup de negocio completado (${parsed.data.tipoNegocio}) a versión ${proximaVersion}`,
        moduloSistema: "SETUP",
        jsonPayload: {
          tipoNegocio: parsed.data.tipoNegocio,
          metodosPago: parsed.data.metodosPago,
          featureFlags: parsed.data.featureFlags,
          configVersion: proximaVersion,
        },
      },
    });

    const configurable = await getBusinessConfig();
    const signed = buildSignedConfig(configurable);

    return NextResponse.json({ ok: true, ...signed }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Error al guardar la configuración" }, { status: 500 });
  }
}