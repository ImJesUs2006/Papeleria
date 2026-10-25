import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";
import { esObjetoJson } from "@/lib/validacion";

// POST /api/caja/cajon { motivo } → registra en la bitácora que alguien abrió
// el cajón SIN venta (el pulso lo manda el navegador a la impresora térmica).
// Abrir el cajón sin cobrar es un punto de control clásico de una caja.
export async function POST(request: Request) {
  const auth = await requireAuth()();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await request.json().then((b) => (esObjetoJson(b) ? b : {}), () => ({}));
  const motivo = typeof body.motivo === "string" ? body.motivo.trim().slice(0, 120) : "";
  if (motivo.length < 3) {
    return NextResponse.json({ error: "Indica por qué se abre el cajón (cambio, revisión…)" }, { status: 400 });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  const sesion = await prisma.sesionCaja.findFirst({
    where: { estado: "ABIERTA", idUsuario: auth.user.idPersona },
    select: { idCaja: true, folioCaja: true },
  });
  await prisma.bitacoraLog.create({
    data: {
      idUsuario: auth.user.idPersona,
      accion: `Cajón abierto sin venta${sesion?.folioCaja ? ` (${sesion.folioCaja})` : ""}: ${motivo}`,
      moduloSistema: "CAJA",
      jsonPayload: { idCaja: sesion?.idCaja ?? null, motivo },
    },
  });
  return NextResponse.json({ ok: true });
}
