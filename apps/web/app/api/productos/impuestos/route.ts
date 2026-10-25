import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";

// GET  /api/productos/impuestos → cuántos productos tienen tasa propia
//      (IVA distinto, exento o IEPS) y por lo tanto no siguen la del negocio.
// POST /api/productos/impuestos → todos vuelven a la tasa del negocio.
const CON_TASA_PROPIA = {
  activo: true,
  OR: [{ tasaIva: { not: null } }, { exentoIva: true }, { tasaIeps: { not: null } }],
};

export async function GET() {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const conTasaPropia = await tenantDb(auth.user.idNegocio).producto.count({ where: CON_TASA_PROPIA });
  return NextResponse.json({ conTasaPropia });
}

export async function POST() {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const prisma = tenantDb(auth.user.idNegocio);
  const { count } = await prisma.producto.updateMany({
    where: CON_TASA_PROPIA,
    data: { tasaIva: null, exentoIva: false, tasaIeps: null },
  });
  await prisma.bitacoraLog.create({
    data: {
      idUsuario: auth.user.idPersona,
      accion: `Impuestos: ${count} producto(s) vuelven a la tasa del negocio`,
      moduloSistema: "CONFIGURACION",
      jsonPayload: { actualizados: count },
    },
  });
  return NextResponse.json({ actualizados: count });
}
