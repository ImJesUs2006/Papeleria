import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";
import { moverStock } from "@/lib/existencias";
import { registrarMovimientosKardex } from "@/lib/kardex";
import { esObjetoJson } from "@/lib/validacion";

// ============================================================
// POST /api/lotes/[id]/baja { motivo? } → merma de lo que queda del lote
// (caducado, dañado). Sale de la existencia con kardex AJUSTE.
// Requiere permiso de inventario.
// ============================================================

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(["ADMINISTRADORA"], { permiso: "inventario", modulo: "lotesSeries" })();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  const { id } = await params;
  const body = await request.json().then((b) => (esObjetoJson(b) ? b : {}), () => ({}));
  const motivo = String(body?.motivo ?? "").trim().slice(0, 120) || "caducado";

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const lote = await tx.lote.findUnique({ where: { idLote: id } });
      if (!lote) throw Object.assign(new Error("Lote no encontrado"), { status: 404 });
      const cantidad = Number(lote.cantidad);
      if (cantidad <= 0) throw Object.assign(new Error("El lote ya no tiene existencia"), { status: 409 });

      const r = await tx.lote.updateMany({
        where: { idLote: id, cantidad: lote.cantidad },
        data: { cantidad: 0 },
      });
      if (r.count === 0) throw Object.assign(new Error("El lote cambió; recarga"), { status: 409 });
      await moverStock(tx, { codigoItem: lote.codigoItem, delta: -cantidad, idSucursal: lote.idSucursal });
      await registrarMovimientosKardex(tx, [
        {
          codigoItem: lote.codigoItem,
          tipo: "AJUSTE",
          cantidad: -cantidad,
          motivo: `Merma lote ${lote.numeroLote} (${motivo})`,
          idUsuario: auth.user.idPersona,
          idSucursal: lote.idSucursal,
        },
      ]);
      return { numeroLote: lote.numeroLote, cantidad };
    });
    return NextResponse.json(resultado);
  } catch (error: any) {
    if (typeof error?.status === "number") {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[lotes:baja]", error);
    return NextResponse.json({ error: "Error al dar de baja el lote" }, { status: 500 });
  }
}
