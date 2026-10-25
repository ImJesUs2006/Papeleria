import { normalizarPersonalizacion, validarCamposProducto } from "@/lib/personalizacion";
import { NextResponse } from "next/server";
import { Prisma } from "@papeleria/database";
import { getBusinessConfig } from "@/lib/feature-flags";
import { tenantDb } from "@/lib/tenant";
import { esObjetoJson } from "@/lib/validacion";

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
  const config = await getBusinessConfig(session.idNegocio);
  return NextResponse.json({ config });
}

export async function PUT(request: Request) {
  try {
    const auth = await import("@/lib/auth").then((m) => m.requireAuth(["ADMINISTRADORA"])());
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const prisma = tenantDb(auth.user.idNegocio);
    const user = auth.user;

    const { validateConfigInput } = await import("@/lib/validate-config");
    const { CONFIG_PROPIA } = await import("@/lib/feature-flags");
    const { buildSignedConfig } = await import("@/lib/config-signing");

    const body = await request.json().then((b) => (esObjetoJson(b) ? b : null), () => null);
    if (!body) return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    const parsed = validateConfigInput(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    // Personalización: los campos de producto se validan; lo demás se normaliza.
    let personalizacionGuardar: any = undefined;
    if (body?.personalizacion !== undefined) {
      try {
        if (Array.isArray(body.personalizacion?.camposProducto)) {
          validarCamposProducto(body.personalizacion.camposProducto);
        }
        personalizacionGuardar = normalizarPersonalizacion(
          body.personalizacion,
          parsed.data.tipoNegocio
        ) as any;
      } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
    }

    const previa = await prisma.configuracionNegocio.findUnique({ where: CONFIG_PROPIA });
    const proximaVersion = (previa?.configVersion ?? 0) + 1;

    // Fase Pulido (bug de toggles fantasma): deep merge de flags. Aunque un
    // cliente envíe un objeto featureFlags parcial, los módulos no mencionados
    // conservan su estado previo en la BD y en el estado global/Store.
    const { normalizeFlags, mergeFeatureFlags } = await import("@/lib/feature-flags");
    const flagsMerged = mergeFeatureFlags(
      normalizeFlags(previa?.featureFlags ?? null),
      (parsed.data.featureFlags ?? {}) as Record<string, unknown>
    );

    // upsert: un negocio que aún no pasó por el asistente no tiene fila propia
    // (la lectura devuelve los valores por defecto) y antes el PUT tronaba.
    const datos = {
      nombreNegocio: parsed.data.nombreNegocio,
      tipoNegocio: parsed.data.tipoNegocio,
      moneda: parsed.data.moneda,
      ivaRate: parsed.data.ivaRate,
      ...(body?.preciosIncluyenIva !== undefined
        ? { preciosIncluyenIva: parsed.data.preciosIncluyenIva }
        : {}),
      ...(body?.cobraImpuestos !== undefined ? { cobraImpuestos: parsed.data.cobraImpuestos } : {}),
      ...(body?.descuentoMaxCajera !== undefined
        ? { descuentoMaxCajera: parsed.data.descuentoMaxCajera }
        : {}),
      ...(personalizacionGuardar !== undefined ? { personalizacion: personalizacionGuardar } : {}),
      featureFlags: flagsMerged,
      metodosPago: parsed.data.metodosPago,
      politicaStockOffline: parsed.data.politicaStockOffline,
      logo: parsed.data.logo ?? null,
      temaBase: parsed.data.temaBase,
      colorAcento: parsed.data.colorAcento,
      datosBancarios: parsed.data.datosBancarios ?? Prisma.DbNull,
      mensajeTicket: parsed.data.mensajeTicket ?? null,
      anchoTicket: parsed.data.anchoTicket,
      vistaDefectoPOS: parsed.data.vistaDefectoPOS,
      datosFiscales: parsed.data.datosFiscales ?? Prisma.DbNull,
      usarCaducidad: parsed.data.usarCaducidad,
      usarUbicaciones: parsed.data.usarUbicaciones,
      requerirFondoInicial: parsed.data.requerirFondoInicial,
      diasApartado: parsed.data.diasApartado,
      corteConReferencia: parsed.data.corteConReferencia,
      imprimirCorteAuto: parsed.data.imprimirCorteAuto,
      diasDevolucion: parsed.data.diasDevolucion,
      montoAutorizarDevolucion:
        parsed.data.montoAutorizarDevolucion && parsed.data.montoAutorizarDevolucion > 0
          ? parsed.data.montoAutorizarDevolucion
          : null,
      puntosConfig: parsed.data.puntosConfig ?? Prisma.DbNull,
      configVersion: proximaVersion,
      setupPendiente: false,
      updatedById: user.idPersona,
    };
    await prisma.configuracionNegocio.upsert({ where: CONFIG_PROPIA, update: datos, create: datos as any });

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
      getBusinessConfig(user.idNegocio),
    ]);

    return NextResponse.json({ ok: true, ...buildSignedConfig(config) });
  } catch {
    return NextResponse.json({ error: "Error al actualizar configuración" }, { status: 500 });
  }
}