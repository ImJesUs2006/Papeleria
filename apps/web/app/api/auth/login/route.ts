import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { compare } from "bcryptjs";
import { signToken } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: "Usuario y contraseña requeridos" },
        { status: 400 }
      );
    }

    const user = await prisma.usuario.findUnique({
      where: { username },
    });

    if (!user || !user.activa) {
      return NextResponse.json(
        { error: "Credenciales inválidas" },
        { status: 401 }
      );
    }

    const validPassword = await compare(password, user.passwordHash);
    if (!validPassword) {
      return NextResponse.json(
        { error: "Credenciales inválidas" },
        { status: 401 }
      );
    }

    const token = await signToken({
      idPersona: user.idPersona,
      nombre: user.nombre,
      rol: user.rol,
      permisoCobrar: user.permisoCobrar ?? true,
      permisoInventario: user.permisoInventario ?? true,
      permisoReportes: user.permisoReportes ?? true,
    });

    await prisma.$transaction([
      prisma.usuario.update({
        where: { idPersona: user.idPersona },
        data: { ultimoLoginAt: new Date() },
      }),
      prisma.bitacoraLog.create({
        data: {
          idUsuario: user.idPersona,
          accion: "Login exitoso",
          moduloSistema: "PUNTO_VENTA",
        },
      }),
    ]);

    const config = await prisma.configuracionNegocio.findUnique({
      where: { id: 1 },
      select: { setupPendiente: true },
    });

    const response = NextResponse.json({
      idPersona: user.idPersona,
      nombre: user.nombre,
      rol: user.rol,
      permisoCobrar: user.permisoCobrar ?? true,
      permisoInventario: user.permisoInventario ?? true,
      permisoReportes: user.permisoReportes ?? true,
      setupPendiente: config?.setupPendiente ?? true,
    });

    response.cookies.set("papeleria_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 8 * 60 * 60, // 8 hours
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("papeleria_token");
  return response;
}
