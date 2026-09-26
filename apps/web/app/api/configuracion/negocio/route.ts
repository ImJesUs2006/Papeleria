import { NextResponse } from "next/server";
import { Prisma } from "@papeleria/database";
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

    // Fase Pulido (bug de toggles fantasma): deep merge de flags. Aunque un
    // cliente envíe un objeto featureFlags parcial, los módulos no mencionados
    // conservan su estado previo en la BD y en el estado global/Store.
    const { normalizeFlags, mergeFeatureFlags } = await import("@/lib/feature-flags");
    const flagsMerged = mergeFeatureFlags(
      normalizeFlags(previa?.featureFlags ?? null),
      (parsed.data.featureFlags ?? {}) as Record<string, unknown>
    );

    await prisma.configuracionNegocio.update({
      where: { id: CONFIG_ID },
      data: {
        nombreNegocio: parsed.data.nombreNegocio,
        tipoNegocio: parsed.data.tipoNegocio,
        moneda: parsed.data.moneda,
        ivaRate: parsed.data.ivaRate,
        featureFlags: flagsMerged,
        metodosPago: parsed.data.metodosPago,
        politicaStockOffline: parsed.data.politicaStockOffline,
        logo: parsed.data.logo ?? null,
        temaBase: parsed.data.temaBase,
        colorAcento: parsed.data.colorAcento,
        datosBancarios: parsed.data.datosBancarios ?? Prisma.DbNull,
        usarImagenesProductos: parsed.data.usarImagenesProductos,
        mensajeTicket: parsed.data.mensajeTicket ?? null,
        anchoTicket: parsed.data.anchoTicket,
        vistaDefectoPOS: parsed.data.vistaDefectoPOS,
        datosFiscales: parsed.data.datosFiscales ?? Prisma.DbNull,
        configVersion: proximaVersion,
        setupPendiente: false,
        updatedById: user.idPersona,
      },
    });

    const [, config] = await Promise.all([
      prisma.bitacoraLog.create({
        data: {
          idUsuario: user.idPersona,
          accion: `Configuración de negocio actualizada → v${proximaVersion}`,
          moduloSistema: "CONFIGURACION",
          jsonPayload: { configVersion: proximaVersion },
        },
      }),
      // Fase B: la relectura firmada es independiente de la auditoría;
      // se ejecuta en paralelo a la bitácora para recortar latencia.
      getBusinessConfig(),
    ]);

    return NextResponse.json({ ok: true, ...buildSignedConfig(config) });
  } catch {
    return NextResponse.json({ error: "Error al actualizar configuración" }, { status: 500 });
  }
}