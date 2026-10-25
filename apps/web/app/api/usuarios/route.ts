import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";
import { claveUsuario } from "@/lib/tenant-keys";
import { datosPorPerfil, PerfilError } from "@/lib/perfiles";
import { esObjetoJson } from "@/lib/validacion";
import { actuaComoDueno } from "@/lib/usuarios";
import { RolError, validarGestion } from "@/lib/roles";

// ============================================================
// /api/usuarios  (solo ADMINISTRADORA)
//   GET  → lista de usuarios del negocio.
//   POST → crea usuario (valida username único y contraseña).
// ============================================================

const ROLES = ["ADMINISTRADORA", "CAJERA"];

export async function GET() {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);

  const usuarios = await prisma.usuario.findMany({
    orderBy: [{ activa: "desc" }, { nombre: "asc" }],
    select: {
      idPersona: true,
      nombre: true,
      username: true,
      rol: true,
      activa: true,
      permisoCobrar: true,
      permisoInventario: true,
      permisoReportes: true,
      idPerfil: true,
      perfil: { select: { nombre: true } },
      idSucursal: true,
      isRoot: true,
      ultimoLoginAt: true,
      passwordCambiadaEn: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    usuarios,
    // Quién pregunta: la pantalla decide qué ofrece (solo el dueño maneja administradores).
    yo: { idPersona: auth.user.idPersona, esDueno: await actuaComoDueno(prisma, auth.user) },
  });
}

export async function POST(request: Request) {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  const user = auth.user;

  let body: any;
  try {
    body = await request.json();
    if (!esObjetoJson(body)) throw new TypeError("Se esperaba un objeto JSON");
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  let rol = typeof body.rol === "string" ? body.rol : "";
  // Con perfil, el rol base y los permisos salen del perfil.
  let desdePerfil: Awaited<ReturnType<typeof datosPorPerfil>> | null = null;
  if (typeof body.idPerfil === "string" && body.idPerfil) {
    try {
      desdePerfil = await datosPorPerfil(prisma, body.idPerfil);
      rol = desdePerfil.rol;
    } catch (e) {
      if (e instanceof PerfilError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }
  }

  if (!nombre || !username || !password) {
    return NextResponse.json({ error: "Nombre, usuario y contraseña son obligatorios" }, { status: 400 });
  }
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
    return NextResponse.json(
      { error: "Usuario inválido (3-30: letras minúsculas, números, . _ -)" },
      { status: 400 }
    );
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 });
  }
  if (!ROLES.includes(rol)) {
    return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
  }
  try {
    validarGestion({
      actorId: auth.user.idPersona,
      actorEsDueno: await actuaComoDueno(prisma, auth.user),
      objetivo: null,
      cambio: { rolNuevo: rol },
    });
  } catch (e) {
    if (e instanceof RolError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  // Permisos de módulo: el perfil manda; si no hay perfil, los enviados.
  // Por defecto una cajera cobra pero NO entra a inventario ni reportes.
  const permisos = (k: "permisoCobrar" | "permisoInventario" | "permisoReportes") =>
    desdePerfil
      ? desdePerfil[k]
      : typeof body[k] === "boolean"
        ? body[k]
        : rol === "ADMINISTRADORA" || k === "permisoCobrar";
  const permisoCobrar = permisos("permisoCobrar");
  const permisoInventario = permisos("permisoInventario");
  const permisoReportes = permisos("permisoReportes");

  // Sucursal donde opera (null = la matriz).
  let idSucursal: string | null = null;
  if (typeof body.idSucursal === "string" && body.idSucursal) {
    const suc = await prisma.sucursal.findFirst({ where: { idSucursal: body.idSucursal, activa: true } });
    if (!suc) return NextResponse.json({ error: "Sucursal no encontrada" }, { status: 404 });
    idSucursal = suc.idSucursal;
  }

  try {
    const existe = await prisma.usuario.findUnique({ where: claveUsuario(username) });
    if (existe) {
      return NextResponse.json({ error: "El usuario ya existe" }, { status: 409 });
    }

    const passwordHash = await hash(password, 10);
    const nuevo = await prisma.$transaction(async (tx) => {
      const creado = await tx.usuario.create({
        data: {
          nombre,
          username,
          passwordHash,
          rol,
          permisoCobrar,
          permisoInventario,
          permisoReportes,
          idPerfil: desdePerfil?.idPerfil ?? null,
          idSucursal: idSucursal ?? null,
          passwordCambiadaEn: new Date(),
        },
        select: {
          idPersona: true,
          nombre: true,
          username: true,
          rol: true,
          activa: true,
          permisoCobrar: true,
          permisoInventario: true,
          permisoReportes: true,
          ultimoLoginAt: true,
          createdAt: true,
        },
      });
      await tx.bitacoraLog.create({
        data: {
          idUsuario: user.idPersona,
          accion: `Usuario creado: ${username} (${rol}) cobrar=${permisoCobrar} inventario=${permisoInventario} reportes=${permisoReportes}`,
          moduloSistema: "SEGURIDAD",
          jsonPayload: {
            idCreado: creado.idPersona,
            username,
            rol,
            permisoCobrar,
            permisoInventario,
            permisoReportes,
          },
        },
      });
      return creado;
    });

    return NextResponse.json({ usuario: nuevo }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Error al crear usuario" }, { status: 500 });
  }
}