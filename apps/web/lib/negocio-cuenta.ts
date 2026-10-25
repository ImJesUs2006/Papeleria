import { prisma } from "@papeleria/database";
import { VERSION_LEGAL } from "@/lib/legal";

// ============================================================
// Datos de la cuenta del negocio que viven en la tabla `negocios`
// (no tiene idNegocio propio que filtrar): aceptación de términos y
// permiso de acceso para soporte. Siempre por el id de la sesión.
// ============================================================

export async function estadoCuenta(idNegocio: string) {
  const n = await prisma.negocio.findUnique({
    where: { idNegocio },
    select: { terminosVersion: true, terminosAceptadosEn: true, terminosAceptadosPor: true, permitirSoporte: true },
  });
  return {
    versionVigente: VERSION_LEGAL,
    aceptada: n?.terminosVersion === VERSION_LEGAL,
    aceptadaEn: n?.terminosAceptadosEn ?? null,
    aceptadaPor: n?.terminosAceptadosPor ?? null,
    permitirSoporte: n?.permitirSoporte !== false,
  };
}

export async function aceptarLegal(idNegocio: string, quien: string) {
  await prisma.negocio.update({
    where: { idNegocio },
    data: { terminosVersion: VERSION_LEGAL, terminosAceptadosEn: new Date(), terminosAceptadosPor: quien.slice(0, 120) },
  });
}

export async function cambiarPermisoSoporte(idNegocio: string, permitir: boolean) {
  await prisma.negocio.update({ where: { idNegocio }, data: { permitirSoporte: permitir } });
}
