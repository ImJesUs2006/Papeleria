import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { requireAuth } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  const soloActivos = searchParams.get("activos") === "true";

  try {
    const proveedores = await prisma.proveedor.findMany({
      where: {
        ...(soloActivos ? { activo: true } : {}),
        ...(q
          ? {
              OR: [
                { nombre: { contains: q, mode: "insensitive" } },
                { contacto: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { nombre: "asc" },
    });

    return NextResponse.json({
      data: proveedores.map((p) => ({
        idProveedor: p.idProveedor,
        nombre: p.nombre,
        telefono: p.telefono,
        email: p.email,
        direccion: p.direccion,
        contacto: p.contacto,
        limiteCredito: p.limiteCredito != null ? Number(p.limiteCredito) : null,
        saldoCredito: p.saldoCredito != null ? Number(p.saldoCredito) : 0,
        activo: p.activo,
        createdAt: p.createdAt,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al consultar proveedores" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const user = auth.user;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!body.nombre || typeof body.nombre !== "string" || !body.nombre.trim()) {
    return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  }

  let limiteCredito: number | null = null;
  if (body.limiteCredito !== undefined && body.limiteCredito !== null && body.limiteCredito !== "") {
    const lim = Number(body.limiteCredito);
    if (!Number.isFinite(lim) || lim < 0) {
      return NextResponse.json({ error: "Límite de crédito inválido" }, { status: 400 });
    }
    limiteCredito = Math.round(lim * 100) / 100;
  }

  const data = {
    nombre: body.nombre.trim(),
    telefono: body.telefono || null,
    email: body.email || null,
    direccion: body.direccion || null,
    contacto: body.contacto || null,
    ...(limiteCredito !== null ? { limiteCredito } : {}),
  };

  try {
    const nuevo = await prisma.$transaction(async (tx) => {
      const proveedor = await tx.proveedor.create({ data });
      await tx.bitacoraLog.create({
        data: {
          idUsuario: user.idPersona,
          accion: `Proveedor creado: ${proveedor.nombre}`,
          moduloSistema: "CONFIGURACION",
          jsonPayload: { idProveedor: proveedor.idProveedor },
        },
      });
      return proveedor;
    });

    return NextResponse.json(
      { idProveedor: nuevo.idProveedor, nombre: nuevo.nombre },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Error al crear proveedor" },
      { status: 500 }
    );
  }
}