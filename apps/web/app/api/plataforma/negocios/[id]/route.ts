import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@papeleria/database";
import { registrarPlataforma, requirePlataforma } from "@/lib/plataforma";
import { nivelDe, NIVELES } from "@/lib/roles";
import { esObjetoJson } from "@/lib/validacion";

// ============================================================
// GET   /api/plataforma/negocios/[id] → ficha: configuración, usuarios,
//                                        actividad y bitácora reciente
// PATCH /api/plataforma/negocios/[id]
//   { activo: boolean }           → suspende / reactiva el negocio
//   { nuevaClaveAdmin: string }   → restablece la clave de su administradora
//   { usuario: { idPersona, activa?, nuevaClave? } } → soporte a un usuario
// Cada acción queda en la bitácora de ESE negocio.
// ============================================================

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requirePlataforma())) return NextResponse.json({ error: "Sin sesión de plataforma" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().then((b) => (esObjetoJson(b) ? b : {}), () => ({}));

  const negocio = await prisma.negocio.findUnique({ where: { idNegocio: id } });
  if (!negocio) return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 });
  const admin = await prisma.usuario.findFirst({
    where: { idNegocio: id, rol: "ADMINISTRADORA", activa: true },
    orderBy: [{ isRoot: "desc" }, { createdAt: "asc" }],
    select: { idPersona: true, username: true },
  });
  const bitacora = (accion: string) =>
    admin
      ? prisma.bitacoraLog.create({
          data: { idNegocio: id, idUsuario: admin.idPersona, accion: `[Plataforma] ${accion}`, moduloSistema: "SEGURIDAD" },
        })
      : Promise.resolve(null);

  if (typeof body?.activo === "boolean") {
    await prisma.negocio.update({ where: { idNegocio: id }, data: { activo: body.activo } });
    await bitacora(body.activo ? "Negocio reactivado" : "Negocio suspendido: nadie puede iniciar sesión");
    await registrarPlataforma(`${body.activo ? "Reactivación" : "Suspensión"} de ${negocio.nombre}`, id);
    return NextResponse.json({ activo: body.activo });
  }

  // Soporte a un usuario concreto del negocio (activar/desactivar, clave).
  if (body?.usuario && typeof body.usuario === "object") {
    const u = await prisma.usuario.findFirst({ where: { idNegocio: id, idPersona: String(body.usuario.idPersona ?? "") } });
    if (!u) return NextResponse.json({ error: "Usuario no encontrado en ese negocio" }, { status: 404 });
    const data: Record<string, unknown> = {};
    if (typeof body.usuario.activa === "boolean") {
      if (!body.usuario.activa && u.isRoot) {
        return NextResponse.json({ error: "No se desactiva al dueño(a): suspende el negocio si hace falta" }, { status: 409 });
      }
      data.activa = body.usuario.activa;
    }
    if (body.usuario.nuevaClave !== undefined) {
      const clave = String(body.usuario.nuevaClave);
      if (clave.length < 8) return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 });
      data.passwordHash = await hash(clave, 12);
      data.passwordCambiadaEn = new Date();
    }
    if (!Object.keys(data).length) return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
    await prisma.usuario.update({ where: { idPersona: u.idPersona }, data });
    const que = [
      data.activa === true ? "reactivado" : data.activa === false ? "desactivado" : null,
      data.passwordHash ? "contraseña restablecida" : null,
    ].filter(Boolean).join(" y ");
    await bitacora(`Usuario ${u.username}: ${que} por soporte`);
    await registrarPlataforma(`Usuario ${u.username} de ${negocio.nombre}: ${que}`, id);
    return NextResponse.json({ ok: true });
  }

  if (body?.nuevaClaveAdmin !== undefined) {
    const clave = String(body.nuevaClaveAdmin);
    if (clave.length < 8) {
      return NextResponse.json({ error: "La nueva contraseña debe tener al menos 8 caracteres" }, { status: 400 });
    }
    if (!admin) return NextResponse.json({ error: "El negocio no tiene una administradora activa" }, { status: 409 });
    await prisma.usuario.update({
      where: { idPersona: admin.idPersona },
      data: { passwordHash: await hash(clave, 12) },
    });
    await bitacora(`Contraseña de ${admin.username} restablecida por soporte`);
    await registrarPlataforma(`Contraseña de ${admin.username} (${negocio.nombre}) restablecida`, id);
    return NextResponse.json({ ok: true, usuario: admin.username });
  }

  return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
}

const DIA = 86_400_000;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requirePlataforma())) return NextResponse.json({ error: "Sin sesión de plataforma" }, { status: 401 });
  const { id } = await params;
  const negocio = await prisma.negocio.findUnique({
    where: { idNegocio: id },
    include: {
      configuracion: { select: { nombreNegocio: true, tipoNegocio: true, setupPendiente: true, featureFlags: true, metodosPago: true } },
      _count: { select: { productos: true, clientes: true, sucursales: true } },
    },
  });
  if (!negocio) return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 });
  const hace30 = new Date(Date.now() - 30 * DIA);
  const [usuarios, ventas, bitacora] = await Promise.all([
    prisma.usuario.findMany({
      where: { idNegocio: id },
      orderBy: [{ isRoot: "desc" }, { rol: "asc" }, { nombre: "asc" }],
      select: {
        idPersona: true,
        nombre: true,
        username: true,
        rol: true,
        isRoot: true,
        activa: true,
        permisoInventario: true,
        permisoReportes: true,
        ultimoLoginAt: true,
      },
    }),
    prisma.venta.aggregate({
      where: { idNegocio: id, fechaHora: { gte: hace30 }, estado: { not: "CANCELADA" } },
      _sum: { totalNeto: true },
      _count: { _all: true },
    }),
    prisma.bitacoraLog.findMany({
      where: { idNegocio: id },
      orderBy: { fechaHora: "desc" },
      take: 15,
      select: { fechaHora: true, accion: true, usuario: { select: { nombre: true } } },
    }),
  ]);
  return NextResponse.json({
    negocio: {
      idNegocio: negocio.idNegocio,
      codigo: negocio.codigo,
      nombre: negocio.configuracion?.nombreNegocio || negocio.nombre,
      activo: negocio.activo,
      creado: negocio.createdAt,
      giro: negocio.configuracion?.tipoNegocio ?? null,
      setupPendiente: negocio.configuracion?.setupPendiente ?? true,
      modulos: Object.entries((negocio.configuracion?.featureFlags as Record<string, boolean> | null) ?? {})
        .filter(([, v]) => v === true)
        .map(([k]) => k),
      metodosPago: (negocio.configuracion?.metodosPago as string[] | null) ?? [],
      productos: negocio._count.productos,
      clientes: negocio._count.clientes,
      sucursales: negocio._count.sucursales,
      ventas30: ventas._count._all,
      importe30: Math.round(Number(ventas._sum.totalNeto ?? 0) * 100) / 100,
    },
    usuarios: usuarios.map((u) => ({
      idPersona: u.idPersona,
      nombre: u.nombre,
      username: u.username,
      tipo: NIVELES[nivelDe(u)].titulo,
      esDueno: u.isRoot,
      activa: u.activa,
      ultimoAcceso: u.ultimoLoginAt,
    })),
    bitacora: bitacora.map((b) => ({ fecha: b.fechaHora, accion: b.accion, usuario: b.usuario?.nombre ?? "—" })),
  });
}
