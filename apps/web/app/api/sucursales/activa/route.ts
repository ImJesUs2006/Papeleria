import { NextResponse } from "next/server";
import { COOKIE_SUCURSAL, requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";

// ============================================================
// POST /api/sucursales/activa { idSucursal }
// La administradora elige en qué sucursal opera (inventario, ventas y
// caja usan esa existencia). El resto del personal opera siempre en la
// sucursal que tiene asignada.
// ============================================================

export async function POST(request: Request) {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const sucursal = await prisma.sucursal.findFirst({
    where: { idSucursal: String(body?.idSucursal ?? ""), activa: true },
    select: { idSucursal: true, nombre: true },
  });
  if (!sucursal) {
    return NextResponse.json({ error: "Sucursal no encontrada o inactiva" }, { status: 404 });
  }

  const res = NextResponse.json({ activa: sucursal });
  res.cookies.set(COOKIE_SUCURSAL, sucursal.idSucursal, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return res;
}
