import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";
import { validar } from "@/lib/validacion";
import { PROVEEDOR_PATCH_SCHEMA, PROVEEDOR_SCHEMA } from "@/lib/esquemas";

export async function GET(request: Request) {
  const auth = await requireAuth(["ADMINISTRADORA"], { permiso: "inventario", modulo: "proveedores" })();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);

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
        diasCredito: p.diasCredito,
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
  const auth = await requireAuth(["ADMINISTRADORA"], { permiso: "inventario", modulo: "proveedores" })();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  const user = auth.user;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const v = validar(PROVEEDOR_SCHEMA, body);
  if (!v.ok) {
    return NextResponse.json({ error: v.error, campos: v.campos }, { status: 400 });
  }
  const data = {
    nombre: v.datos.nombre,
    telefono: v.datos.telefono ?? null,
    email: v.datos.email ?? null,
    direccion: v.datos.direccion ?? null,
    contacto: v.datos.contacto ?? null,
    limiteCredito: v.datos.limiteCredito ?? null,
    diasCredito: v.datos.diasCredito ?? 0,
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