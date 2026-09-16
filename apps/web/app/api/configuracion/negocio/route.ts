import { NextResponse } from "next/server";
import { getBusinessConfig } from "@/lib/feature-flags";

// ============================================================
// RUTA DE CONFIGURACIÓN DE NEGOCIO (Marca Blanca)
//   GET  /api/configuracion/negocio   → admin: valores actuales (flag)
//   PUT  /api/configuracion/negocio   → admin: actualiza + bump version
// La cache firmada para offline vive en .../negocio/cache.
// ============================================================

export async function GET() {
  const { getSession } = await import("@/lib/auth");
  const session = await getSession();
  if (!session || session.rol !== "ADMINISTRADORA") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }
  const config = await getBusinessConfig();
  return NextResponse.json({ config });
}

export async function PUT(request: Request) {
  try {
    const auth = await import("@/lib/auth").then((m) => m.requireAuth(["ADMINISTRADORA"])());
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    const { validateConfigInput } = await import("@/lib/validate-config");
    const { prisma } = await import("@papeleria/database");
    const { CONFIG_ID } = await import("@/lib/feature-flags");
    const { buildSignedConfig } = await import("@/lib/config-signing");

    const body = await request.json();
    const parsed = validateConfigInput(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const previa = await prisma.configuracionNegocio.findUnique({ where: { id: CONFIG_ID } });
    const proximaVersion = (previa?.configVersion ?? 0) + 1;

    await prisma.configuracionNegocio.update({
      where: { id: CONFIG_ID },
      data: {
        nombreNegocio: parsed.data.nombreNegocio,
        tipoNegocio: parsed.data.tipoNegocio,
        moneda: parsed.data.moneda,
        ivaRate: parsed.data.ivaRate,
        featureFlags: parsed.data.featureFlags,
        metodosPago: parsed.data.metodosPago,
        politicaStockOffline: parsed.data.politicaStockOffline,
        configVersion: proximaVersion,
        setupPendiente: false,
        updatedById: user.idPersona,
      },
    });

    await prisma.bitacoraLog.create({
      data: {
        idUsuario: user.idPersona,
        accion: `Configuración de negocio actualizada → v${proximaVersion}`,
        moduloSistema: "CONFIGURACION",
        jsonPayload: { configVersion: proximaVersion },
      },
    });

    const config = await getBusinessConfig();
    return NextResponse.json({ ok: true, ...buildSignedConfig(config) });
  } catch {
    return NextResponse.json({ error: "Error al actualizar configuración" }, { status: 500 });
  }
}