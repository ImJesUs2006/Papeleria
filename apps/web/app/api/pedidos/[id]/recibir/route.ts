import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";
import { CompraError, recibirPedido } from "@/lib/compras";

// ============================================================
// POST /api/pedidos/[id]/recibir
//   { renglones: [{ idItemPedido, cantidad, costoUnitario?, numeroLote?, caducidad? }] }
// Recepción (total o parcial) en la sucursal activa: existencia, lote,
// kardex y costo promedio. Requiere permiso de inventario.
// ============================================================

function fecha(v: unknown): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v ?? ""));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(["ADMINISTRADORA"], { permiso: "inventario", modulo: "proveedores" })();
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
  const renglones = Array.isArray(body?.renglones)
    ? body.renglones
        .filter((r: any) => Number(r?.cantidad) > 0)
        .map((r: any) => ({
          idItemPedido: String(r.idItemPedido ?? ""),
          cantidad: Number(r.cantidad),
          costoUnitario: r.costoUnitario != null && r.costoUnitario !== "" ? Number(r.costoUnitario) : null,
          numeroLote: r.numeroLote ? String(r.numeroLote) : null,
          caducidad: fecha(r.caducidad),
        }))
    : [];
  if (renglones.length === 0) {
    return NextResponse.json({ error: "Indica cuánto se recibió de al menos un producto" }, { status: 400 });
  }

  try {
    const resultado = await prisma.$transaction(
      (tx) =>
        recibirPedido(tx, {
          idPedido: id,
          renglones,
          idUsuario: auth.user.idPersona,
          idSucursal: auth.user.idSucursal ?? null,
        }),
      { timeout: 60_000 }
    );
    return NextResponse.json(resultado);
  } catch (error) {
    if (error instanceof CompraError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[pedidos:recibir]", error);
    return NextResponse.json({ error: "Error al recibir el pedido" }, { status: 500 });
  }
}
