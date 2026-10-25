import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";

// GET /api/variantes[?q=] → modelos con sus variantes (talla, color…) y existencia.
export async function GET(request: Request) {
  const auth = await requireAuth(["ADMINISTRADORA"], { permiso: "inventario", modulo: "lotesSeries" })();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const prisma = tenantDb(auth.user.idNegocio);
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 60);
  const productos = await prisma.producto.findMany({
    where: {
      grupoVariante: { not: null },
      activo: true,
      ...(q
        ? {
            OR: [
              { grupoVariante: { contains: q, mode: "insensitive" } },
              { codigoItem: { contains: q, mode: "insensitive" } },
              { descripcion: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ grupoVariante: "asc" }, { codigoItem: "asc" }],
    select: {
      codigoItem: true,
      descripcion: true,
      grupoVariante: true,
      atributosVariante: true,
      stockActual: true,
      precioUnitario: true,
      codigoBarras: true,
    },
    take: 600,
  });
  const grupos = new Map<string, { modelo: string; descripcion: string; variantes: typeof productos }>();
  for (const p of productos) {
    const g = p.grupoVariante!;
    const grupo = grupos.get(g) ?? { modelo: g, descripcion: g, variantes: [] };
    if (p.codigoItem === g) grupo.descripcion = p.descripcion;
    else grupo.variantes.push(p);
    grupos.set(g, grupo);
  }
  return NextResponse.json({
    modelos: [...grupos.values()]
      .filter((g) => g.variantes.length > 0)
      .map((g) => ({
        modelo: g.modelo,
        descripcion: g.descripcion,
        existenciaTotal: g.variantes.reduce((s, v) => s + Number(v.stockActual), 0),
        variantes: g.variantes.map((v) => ({
          codigoItem: v.codigoItem,
          descripcion: v.descripcion,
          atributos: (v.atributosVariante as Record<string, string> | null) ?? {},
          existencia: Number(v.stockActual),
          precio: Number(v.precioUnitario),
          codigoBarras: v.codigoBarras,
        })),
      })),
  });
}
