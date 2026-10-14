import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";

// ============================================================
// PATCH /api/sucursales/[id] { nombre?, direccion?, activa? }
// Solo administradora. La matriz no se desactiva; una sucursal con cajas
// abiertas tampoco.
// ============================================================

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  const { id } = await params;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const actual = await prisma.sucursal.findUnique({ where: { idSucursal: id } });
  if (!actual) {
    return NextResponse.json({ error: "Sucursal no encontrada" }, { status: 404 });
  }

  const data: { nombre?: string; direccion?: string | null; activa?: boolean } = {};
  if (body.nombre !== undefined) {
    const nombre = String(body.nombre).trim();
    if (nombre.length < 2 || nombre.length > 60) {
      return NextResponse.json({ error: "El nombre debe tener entre 2 y 60 caracteres" }, { status: 400 });
    }
    data.nombre = nombre;
  }
  if (body.direccion !== undefined) {
    data.direccion = String(body.direccion ?? "").trim().slice(0, 200) || null;
  }
  if (body.activa !== undefined) {
    if (typeof body.activa !== "boolean") {
      return NextResponse.json({ error: "Valor de activa inválido" }, { status: 400 });
    }
    if (body.activa === false) {
      if (actual.esMatriz) {
        return NextResponse.json({ error: "La matriz no se puede desactivar" }, { status: 409 });
      }
      const abiertas = await prisma.sesionCaja.count({
        where: { idSucursal: id, estado: { in: ["ABIERTA", "EN_CIERRE"] } },
      });
      if (abiertas > 0) {
        return NextResponse.json(
          { error: "La sucursal tiene cajas abiertas: ciérralas antes de desactivarla" },
          { status: 409 }
        );
      }
    }
    data.activa = body.activa;
  }

  const sucursal = await prisma.sucursal.update({ where: { idSucursal: id }, data });
  return NextResponse.json({ sucursal });
}
