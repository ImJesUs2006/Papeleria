import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";

// ============================================================
// GET  /api/categorias → categorías del negocio (cualquier usuario)
// POST /api/categorias → alta { nombre, color? } (administradora)
// ============================================================

export async function GET() {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  const categorias = await prisma.categoria.findMany({ orderBy: { nombre: "asc" } });
  return NextResponse.json({ categorias });
}

export async function POST(request: Request) {
  const auth = await requireAuth(["ADMINISTRADORA"], { permiso: "inventario" })();
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
  const nombre = String(body?.nombre ?? "").trim();
  if (nombre.length < 2 || nombre.length > 60) {
    return NextResponse.json({ error: "El nombre debe tener entre 2 y 60 caracteres" }, { status: 400 });
  }
  const color = /^#[0-9a-fA-F]{6}$/.test(String(body?.color ?? "")) ? String(body.color) : undefined;

  const repetida = await prisma.categoria.findFirst({
    where: { nombre: { equals: nombre, mode: "insensitive" } },
  });
  if (repetida) {
    return NextResponse.json({ error: "Ya existe una categoría con ese nombre" }, { status: 409 });
  }
  const categoria = await prisma.categoria.create({ data: { nombre, ...(color ? { color } : {}) } });
  return NextResponse.json({ categoria }, { status: 201 });
}
