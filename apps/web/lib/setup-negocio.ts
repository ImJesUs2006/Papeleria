import { Prisma, type PrismaClient } from "@papeleria/database";
import { CONFIG_PROPIA } from "@/lib/feature-flags";
import { validateConfigInput } from "@/lib/validate-config";
import { normalizarPersonalizacion, validarCamposProducto } from "@/lib/personalizacion";

// ============================================================
// Aplicar el asistente de configuración inicial a un negocio.
// Lo usan /api/setup (la administradora del negocio) y la consola de
// plataforma al dar de alta un negocio: un solo flujo, mismas reglas.
// `prisma` es el cliente con alcance del negocio (lib/tenant).
// ============================================================

export class SetupError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function aplicarSetup(prisma: PrismaClient, body: any, idUsuario: string) {
  const parsed = validateConfigInput(body);
  if (!parsed.success) throw new SetupError(parsed.error);
  // Personalización: los campos de producto se validan; lo demás se normaliza.
  let personalizacionGuardar: any = undefined;
  if (body?.personalizacion !== undefined) {
    try {
      if (Array.isArray(body.personalizacion?.camposProducto)) {
        validarCamposProducto(body.personalizacion.camposProducto);
      }
      personalizacionGuardar = normalizarPersonalizacion(body.personalizacion, parsed.data.tipoNegocio) as any;
    } catch (e: any) {
      throw new SetupError(e.message);
    }
  }

  const previa = await prisma.configuracionNegocio.findUnique({ where: CONFIG_PROPIA });
  const proximaVersion = (previa?.configVersion ?? 0) + 1;

  // Deep merge: el setup (o una reconfiguración parcial) no borra módulos.
  const { normalizeFlags, mergeFeatureFlags } = await import("@/lib/feature-flags");
  const flagsMerged = mergeFeatureFlags(
    normalizeFlags(previa?.featureFlags ?? null),
    (parsed.data.featureFlags ?? {}) as Record<string, unknown>
  );

  // Lo que el asistente siempre define.
  const base = {
    nombreNegocio: parsed.data.nombreNegocio,
    tipoNegocio: parsed.data.tipoNegocio,
    metodosPago: parsed.data.metodosPago,
    featureFlags: flagsMerged,
    ivaRate: parsed.data.ivaRate,
    usarCaducidad: parsed.data.usarCaducidad,
    usarUbicaciones: parsed.data.usarUbicaciones,
    requerirFondoInicial: parsed.data.requerirFondoInicial,
    configVersion: proximaVersion,
    setupPendiente: false,
    updatedById: idUsuario,
    ...(personalizacionGuardar !== undefined ? { personalizacion: personalizacionGuardar } : {}),
  };
  // El resto solo se toca si viene en la petición: volver a correr el
  // asistente NO debe borrar logo, tema, datos fiscales ni el mensaje del
  // ticket que el negocio ya había capturado.
  const enviado = (k: string) => body?.[k] !== undefined;
  const opcionales = {
    ...(enviado("preciosIncluyenIva") ? { preciosIncluyenIva: parsed.data.preciosIncluyenIva } : {}),
    ...(enviado("descuentoMaxCajera") ? { descuentoMaxCajera: parsed.data.descuentoMaxCajera } : {}),
    ...(enviado("politicaStockOffline") ? { politicaStockOffline: parsed.data.politicaStockOffline } : {}),
    ...(enviado("logo") ? { logo: parsed.data.logo ?? null } : {}),
    ...(enviado("temaBase") ? { temaBase: parsed.data.temaBase } : {}),
    ...(enviado("colorAcento") ? { colorAcento: parsed.data.colorAcento } : {}),
    ...(enviado("mensajeTicket") ? { mensajeTicket: parsed.data.mensajeTicket ?? null } : {}),
    ...(enviado("anchoTicket") ? { anchoTicket: parsed.data.anchoTicket } : {}),
    ...(enviado("vistaDefectoPOS") ? { vistaDefectoPOS: parsed.data.vistaDefectoPOS } : {}),
    ...(enviado("datosFiscales") ? { datosFiscales: parsed.data.datosFiscales ?? Prisma.DbNull } : {}),
  };

  await prisma.configuracionNegocio.upsert({
    where: CONFIG_PROPIA,
    update: { ...base, ...opcionales },
    create: {
      ...base,
      politicaStockOffline: parsed.data.politicaStockOffline,
      logo: parsed.data.logo ?? null,
      temaBase: parsed.data.temaBase,
      colorAcento: parsed.data.colorAcento,
      mensajeTicket: parsed.data.mensajeTicket ?? null,
      anchoTicket: parsed.data.anchoTicket,
      vistaDefectoPOS: parsed.data.vistaDefectoPOS,
      datosFiscales: parsed.data.datosFiscales ?? Prisma.DbNull,
      ...opcionales,
    } as any,
  });

  await prisma.bitacoraLog.create({
    data: {
      idUsuario,
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
  return { configVersion: proximaVersion, tipoNegocio: parsed.data.tipoNegocio };
}
