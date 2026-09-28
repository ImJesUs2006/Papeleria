import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { compare } from "bcryptjs";
import { requireAuth } from "@/lib/auth";

// ============================================================
// POST /api/bitacora/purgar
// Purga registros de bitácora anteriores a N meses (por defecto 6).
// Antes de borrar genera un respaldo JSON que se devuelve en la
// respuesta para que el cliente lo descargue.
// Exige ADMINISTRADORA + contraseña + isRoot (o ADMINISTRADORA con
// TODOS los permisos de módulo activos). Lo exige el propio servidor.
// ============================================================

const MESES_VALIDOS = [3, 6, 12, 24];
const MAX_BACKUP = 20000;

export async function POST(request: Request) {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const session = auth.user;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const password = body?.password;
  if (typeof password !== "string" || !password) {
    return NextResponse.json({ error: "La contraseña es requerida" }, { status: 400 });
  }

  const meses = MESES_VALIDOS.includes(Number(body?.meses))
    ? Number(body.meses)
    : 6;

  try {
    const user = await prisma.usuario.findUnique({
      where: { idPersona: session.idPersona },
    });
    if (!user || !user.activa) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 401 });
    }

    const valida = await compare(password, user.passwordHash);
    if (!valida) {
      return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
    }

    // Gate server-side: isRoot || (ADMIN + todos los permisos).
    const cumplePermisos =
      user.isRoot === true ||
      (user.rol === "ADMINISTRADORA" &&
        user.permisoCobrar === true &&
        user.permisoInventario === true &&
        user.permisoReportes === true);

    if (!cumplePermisos) {
      return NextResponse.json(
        { error: "Solo la cuenta raíz o una administradora con todos los permisos puede purgar la bitácora" },
        { status: 403 }
      );
    }

    const corte = new Date();
    corte.setMonth(corte.getMonth() - meses);

    // 1) Respaldo JSON ANTES de borrar.
    const antiguos = await prisma.bitacoraLog.findMany({
      where: { fechaHora: { lt: corte } },
      orderBy: { fechaHora: "asc" },
      take: MAX_BACKUP,
      include: {
        usuario: { select: { nombre: true, username: true, rol: true } },
      },
    });

    const backup = JSON.stringify(
      {
        sistema: "Papelería - Bitácora de Auditoría",
        generado: new Date().toISOString(),
        porQuien: { idPersona: user.idPersona, nombre: user.nombre },
        mesesPurgados: meses,
        corte: corte.toISOString(),
        registros: antiguos.map((log) => ({
          fechaHora: log.fechaHora.toISOString(),
          moduloSistema: log.moduloSistema,
          accion: log.accion,
          usuario: log.usuario?.nombre ?? null,
          username: log.usuario?.username ?? null,
          rol: log.usuario?.rol ?? null,
          jsonPayload: log.jsonPayload ?? null,
          detallesError: log.detallesError ?? null,
          ipOrigen: log.ipOrigen ?? null,
        })),
        totalRespaldados: antiguos.length,
      },
      null,
      2
    );

    // 2) Purga.
    const { count } = await prisma.bitacoraLog.deleteMany({
      where: { fechaHora: { lt: corte } },
    });

    // 3) Deja evidencia de la purga (fuera del rango borrado).
    await prisma.bitacoraLog.create({
      data: {
        idUsuario: user.idPersona,
        accion: `Purga de bitácora: ${count} registros previos a ${corte.toISOString()}`,
        moduloSistema: "SEGURIDAD",
        jsonPayload: {
          purgados: count,
          meses,
          corte: corte.toISOString(),
          backup: antiguos.length,
        },
      },
    });

    return NextResponse.json({
      ok: true,
      purgados: count,
      backupRegistros: antiguos.length,
      corte: corte.toISOString(),
      backup,
    });
  } catch (error) {
    console.error("[bitacora:purgar]", error);
    return NextResponse.json(
      { error: "No se pudo purgar la bitácora" },
      { status: 500 }
    );
  }
}