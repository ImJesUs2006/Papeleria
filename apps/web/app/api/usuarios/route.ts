import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { hash } from "bcryptjs";
import { requireAuth } from "@/lib/auth";

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

  const usuarios = await prisma.usuario.findMany({
    orderBy: [{ activa: "desc" }, { nombre: "asc" }],
    select: {
      idPersona: true,
      nombre: true,
      username: true,
      rol: true,
      activa: true,
      ultimoLoginAt: true,
      passwordCambiadaEn: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ usuarios });
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

  const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const rol = typeof body.rol === "string" ? body.rol : "";

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
    const existe = await prisma.usuario.findUnique({ where: { username } });
    if (existe) {
      return NextResponse.json({ error: "El usuario ya existe" }, { status: 409 });
    }

    const passwordHash = await hash(password, 10);
    const nuevo = await prisma.$transaction(async (tx) => {
      const creado = await tx.usuario.create({
        data: { nombre, username, passwordHash, rol, passwordCambiadaEn: new Date() },
        select: {
          idPersona: true,
          nombre: true,
          username: true,
          rol: true,
          activa: true,
          ultimoLoginAt: true,
          createdAt: true,
        },
      });
      await tx.bitacoraLog.create({
        data: {
          idUsuario: user.idPersona,
          accion: `Usuario creado: ${username} (${rol})`,
          moduloSistema: "SEGURIDAD",
          jsonPayload: { idCreado: creado.idPersona, username, rol },
        },
      });
      return creado;
    });

    return NextResponse.json({ usuario: nuevo }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Error al crear usuario" }, { status: 500 });
  }
}