import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";
import { estadoLote, listarLotes, LoteError, lotesPorCaducar, registrarEntradaLote, type EstadoLote } from "@/lib/lotes";
import { esObjetoJson } from "@/lib/validacion";

// ============================================================
// GET  /api/lotes?dias=30[&todas=1] → lotes por caducar (o caducados) de la
//                                     sucursal activa (todas=1: del negocio)
// GET  /api/lotes?vista=lista[&estado=VIGENTE|POR_CADUCAR|CADUCADO|AGOTADO][&q=]
//                                   → lista completa con su estado
// POST /api/lotes { codigoItem, numeroLote, caducidad?, cantidad }
//                 → entrada de mercancía con lote en la sucursal activa
// Requiere permiso de inventario.
// ============================================================

export async function GET(request: Request) {
  const auth = await requireAuth(["ADMINISTRADORA"], { permiso: "inventario", modulo: "lotesSeries" })();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  const { searchParams } = new URL(request.url);
  const dias = Math.min(Math.max(Number(searchParams.get("dias") ?? 30) || 30, 0), 365);
  const idSucursal = searchParams.get("todas") === "1" ? null : auth.user.idSucursal;

  if (searchParams.get("vista") === "lista") {
    const estados: EstadoLote[] = ["VIGENTE", "POR_CADUCAR", "CADUCADO", "AGOTADO"];
    const e = searchParams.get("estado") as EstadoLote | null;
    const lista = await listarLotes(prisma, {
      idSucursal,
      estado: e && estados.includes(e) ? e : "TODOS",
      q: (searchParams.get("q") ?? "").slice(0, 60),
    });
    return NextResponse.json({
      lotes: lista.map((l) => ({
        idLote: l.idLote,
        codigoItem: l.codigoItem,
        descripcion: l.producto.descripcion,
        numeroLote: l.numeroLote,
        caducidad: l.caducidad?.toISOString().slice(0, 10) ?? null,
        cantidad: Number(l.cantidad),
        estado: estadoLote(l),
        registrado: l.createdAt,
      })),
    });
  }

  const lotes = await lotesPorCaducar(prisma, dias, idSucursal);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return NextResponse.json({
    dias,
    lotes: lotes.map((l) => ({
      idLote: l.idLote,
      codigoItem: l.codigoItem,
      descripcion: l.producto.descripcion,
      numeroLote: l.numeroLote,
      caducidad: l.caducidad?.toISOString().slice(0, 10) ?? null,
      cantidad: Number(l.cantidad),
      caducado: !!l.caducidad && l.caducidad.getTime() < hoy.getTime(),
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireAuth(["ADMINISTRADORA"], { permiso: "inventario", modulo: "lotesSeries" })();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  if (!auth.user.idSucursal) {
    return NextResponse.json({ error: "Tu sesión no tiene sucursal" }, { status: 409 });
  }

  let body: any;
  try {
    body = await request.json();
    if (!esObjetoJson(body)) throw new TypeError("Se esperaba un objeto JSON");
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  let caducidad: Date | null = null;
  if (body?.caducidad) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(body.caducidad));
    caducidad = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
    if (!caducidad) return NextResponse.json({ error: "Caducidad inválida (AAAA-MM-DD)" }, { status: 400 });
  }

  try {
    const lote = await prisma.$transaction((tx) =>
      registrarEntradaLote(tx, {
        codigoItem: String(body?.codigoItem ?? "").trim(),
        idSucursal: auth.user.idSucursal!,
        numeroLote: String(body?.numeroLote ?? ""),
        caducidad,
        cantidad: Number(body?.cantidad),
        idUsuario: auth.user.idPersona,
      })
    );
    return NextResponse.json(
      { lote: { ...lote, cantidad: Number(lote.cantidad) } },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof LoteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[lotes:post]", error);
    return NextResponse.json({ error: "Error al registrar el lote" }, { status: 500 });
  }
}
