import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";
import { bajaSerie, SerieError } from "@/lib/series";
import { esObjetoJson } from "@/lib/validacion";

// DELETE /api/series/[id] { motivo } → baja de una pieza DISPONIBLE con serie.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(["ADMINISTRADORA"], { permiso: "inventario", modulo: "lotesSeries" })();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const prisma = tenantDb(auth.user.idNegocio);
  const { id } = await params;
  const body = await request.json().then((b) => (esObjetoJson(b) ? b : {}), () => ({}));
  const motivo = typeof body.motivo === "string" ? body.motivo : "";
  if (motivo.trim().length < 3) {
    return NextResponse.json({ error: "Indica el motivo de la baja (dañada, capturada por error…)" }, { status: 400 });
  }
  try {
    const serie = await prisma.$transaction(async (tx) => {
      const s = await bajaSerie(tx, { idSerie: id, motivo, idUsuario: auth.user.idPersona });
      await tx.bitacoraLog.create({
        data: {
          idUsuario: auth.user.idPersona,
          accion: `Baja de la serie ${s.serie} (${s.codigoItem}): ${motivo.trim().slice(0, 120)}`,
          moduloSistema: "INVENTARIO",
        },
      });
      return s;
    });
    return NextResponse.json({ ok: true, serie: serie.serie });
  } catch (e) {
    if (e instanceof SerieError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[series:delete]", e);
    return NextResponse.json({ error: "No se pudo dar de baja la serie" }, { status: 500 });
  }
}
