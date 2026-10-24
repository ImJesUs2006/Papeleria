import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";
import { getBusinessConfig } from "@/lib/feature-flags";
import { cargarCatalogoEjemplo } from "@/lib/cargar-catalogo";
import { resumenCatalogo } from "@/lib/catalogos-ejemplo";
import { TIPO_NEGOCIO, type TipoNegocio } from "@/lib/business-types";

// ============================================================
// GET  /api/setup/catalogo-ejemplo → qué traería el catálogo del giro
// POST /api/setup/catalogo-ejemplo → lo carga (no duplica si ya existe)
// ============================================================

function giroDe(v: unknown, porDefecto: TipoNegocio): TipoNegocio {
  return typeof v === "string" && v in TIPO_NEGOCIO ? (v as TipoNegocio) : porDefecto;
}

export async function GET(request: Request) {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const config = await getBusinessConfig(auth.user.idNegocio);
  const tipo = giroDe(new URL(request.url).searchParams.get("tipo"), config.tipoNegocio);
  return NextResponse.json({ tipo, ...resumenCatalogo(tipo) });
}

export async function POST(request: Request) {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const prisma = tenantDb(auth.user.idNegocio);
  const body = await request.json().catch(() => ({}));
  const config = await getBusinessConfig(auth.user.idNegocio);
  const tipo = giroDe(body?.tipoNegocio, config.tipoNegocio);

  try {
    const r = await prisma.$transaction(
      async (tx) => {
        const res = await cargarCatalogoEjemplo(tx, tipo, {
          idUsuario: auth.user.idPersona,
          idSucursal: auth.user.idSucursal ?? null,
        });
        await tx.bitacoraLog.create({
          data: {
            idUsuario: auth.user.idPersona,
            accion: `Catálogo de ejemplo cargado (${TIPO_NEGOCIO[tipo]}): ${res.productos} productos, ${res.categorias} categorías`,
            moduloSistema: "INVENTARIO",
            jsonPayload: { tipo, ...res },
          },
        });
        return res;
      },
      { timeout: 60_000 }
    );
    return NextResponse.json(r, { status: 201 });
  } catch (error) {
    console.error("[catalogo-ejemplo]", error);
    return NextResponse.json({ error: "No se pudo cargar el catálogo de ejemplo" }, { status: 500 });
  }
}
