import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";
import { eliminarLoteAgotado, LoteError } from "@/lib/lotes";

// DELETE /api/lotes/[id] → borra un lote AGOTADO (con existencia: dar de baja).
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(["ADMINISTRADORA"], { permiso: "inventario", modulo: "lotesSeries" })();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const prisma = tenantDb(auth.user.idNegocio);
  const { id } = await params;
  try {
    const lote = await prisma.$transaction(async (tx) => {
      const l = await eliminarLoteAgotado(tx, id);
      await tx.bitacoraLog.create({
        data: {
          idUsuario: auth.user.idPersona,
          accion: `Lote agotado ${l.numeroLote} de ${l.codigoItem} eliminado`,
          moduloSistema: "INVENTARIO",
        },
      });
      return l;
    });
    return NextResponse.json({ ok: true, numeroLote: lote.numeroLote });
  } catch (e) {
    if (e instanceof LoteError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[lotes:delete]", e);
    return NextResponse.json({ error: "No se pudo eliminar el lote" }, { status: 500 });
  }
}
