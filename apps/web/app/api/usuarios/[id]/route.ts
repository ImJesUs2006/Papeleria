import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { requireAuth } from "@/lib/auth";
import { tieneOtroAdminActivo } from "@/lib/usuarios";

// ============================================================
// /api/usuarios/[id]  (solo ADMINISTRADORA)
//   PATCH  → nombre, rol, activa.
//   DELETE → elimina si no tiene historial; si lo tiene, 409.
//
// Regla anti-bloqueo: nunca se puede dejar el sistema sin al
// menos una ADMINISTRADORA activa.
// ============================================================

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const user = auth.user;
  const { id } = await params;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const target = await prisma.usuario.findUnique({ where: { idPersona: id } });
  if (!target) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const data: Record<string, any> = {};

  if (body.nombre !== undefined) {
    const nombre = String(body.nombre).trim();
    if (!nombre) return NextResponse.json({ error: "Nombre inválido" }, { status: 400 });
    data.nombre = nombre;
  }

  if (body.rol !== undefined) {
    if (!["ADMINISTRADORA", "CAJERA"].includes(body.rol)) {
      return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
    }
    if (id === user.idPersona && body.rol !== "ADMINISTRADORA" && target.rol === "ADMINISTRADORA") {
      return NextResponse.json({ error: "No puedes quitarte tu propio rol de administradora" }, { status: 409 });
    }
    data.rol = body.rol;
  }

  if (body.activa !== undefined) {
    if (typeof body.activa !== "boolean") {
      return NextResponse.json({ error: "Valor de activa inválido" }, { status: 400 });
    }
    if (id === user.idPersona && body.activa === false) {
      return NextResponse.json({ error: "No puedes desactivar tu propia cuenta" }, { status: 409 });
    }
    data.activa = body.activa;
  }

  // Permisos granulares (Fase 9).
  for (const k of ["permisoCobrar", "permisoInventario", "permisoReportes"] as const) {
    if (body[k] !== undefined) {
      if (typeof body[k] !== "boolean") {
        return NextResponse.json({ error: `Valor de ${k} inválido` }, { status: 400 });
      }
      data[k] = body[k];
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Sin cambios" }, { status: 400 });
  }

  try {
    // Si el cambio quita condición de admin activa, verificar que quede otra.
    const quitaAdmin =
      target.rol === "ADMINISTRADORA" &&
      target.activa &&
      ((data.rol !== undefined && data.rol !== "ADMINISTRADORA") || data.activa === false);

    if (quitaAdmin && !(await tieneOtroAdminActivo(target.idPersona))) {
      return NextResponse.json(
        { error: "No se puede dejar el sistema sin administradora activa" },
        { status: 409 }
      );
    }

    const actualizado = await prisma.$transaction(async (tx) => {
      const u = await tx.usuario.update({
        where: { idPersona: id },
        data,
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
        },
      });
      await tx.bitacoraLog.create({
        data: {
          idUsuario: user.idPersona,
          accion: `Usuario ${target.username} actualizado: ${Object.entries(data)
            .map(([k, v]) => `${k}=${v}`)
            .join(", ")}`,
          moduloSistema: "SEGURIDAD",
          jsonPayload: { idActualizado: id, cambios: data },
        },
      });
      return u;
    });

    return NextResponse.json({ usuario: actualizado });
  } catch {
    return NextResponse.json({ error: "Error al actualizar usuario" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const user = auth.user;
  const { id } = await params;

  if (id === user.idPersona) {
    return NextResponse.json({ error: "No puedes eliminar tu propia cuenta" }, { status: 409 });
  }

  const target = await prisma.usuario.findUnique({
    where: { idPersona: id },
    include: {
      _count: { select: { ventas: true, sesionesCaja: true, bitacoraLogs: true } },
    },
  });
  if (!target) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const tieneHistorial =
    target._count.ventas > 0 ||
    target._count.sesionesCaja > 0 ||
    target._count.bitacoraLogs > 0;

  if (tieneHistorial) {
    return NextResponse.json(
      {
        error:
          "El usuario tiene historial de ventas/bitácora: desactívalo en lugar de eliminarlo (auditoría)",
      },
      { status: 409 }
    );
  }

  if (target.rol === "ADMINISTRADORA" && target.activa) {
    if (!(await tieneOtroAdminActivo(target.idPersona))) {
      return NextResponse.json(
        { error: "No se puede eliminar la última administradora activa" },
        { status: 409 }
      );
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.usuario.delete({ where: { idPersona: id } });
      await tx.bitacoraLog.create({
        data: {
          idUsuario: user.idPersona,
          accion: `Usuario eliminado: ${target.username} (${target.rol})`,
          moduloSistema: "SEGURIDAD",
          jsonPayload: { idEliminado: id, username: target.username },
        },
      });
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error al eliminar usuario" }, { status: 500 });
  }
}