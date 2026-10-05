import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { compare } from "bcryptjs";
import { signToken } from "@/lib/auth";
import { limpiarIntentos, registrarFallo, segundosBloqueado } from "@/lib/rate-limit";
import { tenantDb } from "@/lib/tenant";
import { claveUsuario } from "@/lib/tenant-keys";
import { CONFIG_PROPIA } from "@/lib/snapshots";

// ============================================================
// POST /api/auth/login   { negocio?, username, password }
//
// Multi-tenant: el usuario es único POR negocio, así que el login
// resuelve primero el negocio por su código. Si la instalación tiene
// un solo negocio, el código es opcional (se asume ese).
// Único punto donde se usa el cliente global: aún no hay sesión.
// ============================================================

async function resolverNegocio(codigo: unknown) {
  const limpio = typeof codigo === "string" ? codigo.trim().toLowerCase() : "";
  if (limpio) {
    return prisma.negocio.findUnique({ where: { codigo: limpio } });
  }
  const negocios = await prisma.negocio.findMany({ take: 2 });
  return negocios.length === 1 ? negocios[0] : null;
}

export async function POST(request: Request) {
  try {
    const { username, password, negocio: codigoNegocio } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: "Usuario y contraseña requeridos" },
        { status: 400 }
      );
    }
    if (typeof username !== "string" || typeof password !== "string") {
      return NextResponse.json(
        { error: "Usuario y contraseña requeridos" },
        { status: 400 }
      );
    }

    // Anti fuerza bruta: 5 fallos en 15 min bloquean la combinación
    // negocio + usuario + IP durante 15 min.
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "local";
    const codigoLlave = typeof codigoNegocio === "string" ? codigoNegocio.trim().toLowerCase() : "";
    const llave = `${codigoLlave}|${username.trim().toLowerCase()}|${ip}`;
    const espera = segundosBloqueado(llave);
    if (espera > 0) {
      return NextResponse.json(
        { error: `Demasiados intentos fallidos. Intenta de nuevo en ${Math.ceil(espera / 60)} min.` },
        { status: 429, headers: { "Retry-After": String(espera) } }
      );
    }

    const negocio = await resolverNegocio(codigoNegocio);
    if (!negocio && !codigoLlave) {
      return NextResponse.json(
        { error: "Indica el código de tu negocio", requiereNegocio: true },
        { status: 400 }
      );
    }

    // Negocio inexistente o suspendido responde igual que una contraseña
    // incorrecta: no se revela qué negocios existen.
    const db = negocio && negocio.activo ? tenantDb(negocio.idNegocio) : null;
    const user = db
      ? await db.usuario.findUnique({ where: claveUsuario(username) })
      : null;

    const validPassword =
      user && user.activa ? await compare(password, user.passwordHash) : false;
    if (!db || !negocio || !user || !validPassword) {
      const bloqueada = registrarFallo(llave);
      if (bloqueada && db) {
        await db.bitacoraLog
          .create({
            data: {
              idUsuario: user?.idPersona ?? null,
              accion: `Login bloqueado por intentos fallidos (usuario "${username.slice(0, 60)}")`,
              moduloSistema: "SEGURIDAD",
              ipOrigen: ip,
            },
          })
          .catch(() => {});
      }
      return NextResponse.json(
        { error: "Credenciales inválidas" },
        { status: 401 }
      );
    }
    limpiarIntentos(llave);

    const token = await signToken({
      idPersona: user.idPersona,
      idNegocio: negocio.idNegocio,
      nombre: user.nombre,
      rol: user.rol,
      permisoCobrar: user.permisoCobrar ?? true,
      permisoInventario: user.permisoInventario ?? true,
      permisoReportes: user.permisoReportes ?? true,
    });

    await db.$transaction([
      db.usuario.update({
        where: { idPersona: user.idPersona },
        data: { ultimoLoginAt: new Date() },
      }),
      db.bitacoraLog.create({
        data: {
          idUsuario: user.idPersona,
          accion: "Login exitoso",
          moduloSistema: "PUNTO_VENTA",
        },
      }),
    ]);

    const config = await db.configuracionNegocio.findUnique({
      where: CONFIG_PROPIA,
      select: { setupPendiente: true },
    });

    const canPurge =
      user.isRoot === true ||
      (user.rol === "ADMINISTRADORA" &&
        user.permisoCobrar === true &&
        user.permisoInventario === true &&
        user.permisoReportes === true);

    const response = NextResponse.json({
      idPersona: user.idPersona,
      nombre: user.nombre,
      rol: user.rol,
      negocio: { codigo: negocio.codigo, nombre: negocio.nombre },
      permisoCobrar: user.permisoCobrar ?? true,
      permisoInventario: user.permisoInventario ?? true,
      permisoReportes: user.permisoReportes ?? true,
      canPurge,
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
    // Nunca se registra el cuerpo de la petición (contiene la contraseña).
    console.error("[auth:login]", error);
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
