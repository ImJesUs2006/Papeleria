import { NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";
import { esObjetoJson } from "@/lib/validacion";
import { actuaComoDueno } from "@/lib/usuarios";
import { fechaCorte, libroRespaldo, mesesValidos } from "@/lib/bitacora-purga";

// ============================================================
// POST /api/bitacora/purgar  { password, meses }
// Purga los registros anteriores a N meses (1, 3, 6, 12 o 24).
// Antes de borrar arma un respaldo en Excel que se devuelve en la
// respuesta para descargarlo, y deja constancia de la purga.
// Solo el Dueño(a), confirmando con su contraseña.
// ============================================================

const MAX_BACKUP = 50000;

export async function POST(request: Request) {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  const session = auth.user;

  let body: any;
  try {
    body = await request.json();
    if (!esObjetoJson(body)) throw new TypeError("Se esperaba un objeto JSON");
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const password = body?.password;
  if (typeof password !== "string" || !password) {
    return NextResponse.json({ error: "La contraseña es requerida" }, { status: 400 });
  }
  const meses = mesesValidos(body?.meses);

  try {
    const user = await prisma.usuario.findUnique({
      where: { idPersona: session.idPersona },
    });
    if (!user || !user.activa) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 401 });
    }
    if (!(await actuaComoDueno(prisma, session))) {
      return NextResponse.json({ error: "Solo el dueño(a) del negocio puede purgar la bitácora" }, { status: 403 });
    }
    if (!(await compare(password, user.passwordHash))) {
      return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
    }

    const corte = fechaCorte(meses);
    const antiguos = await prisma.bitacoraLog.findMany({
      where: { fechaHora: { lt: corte } },
      orderBy: { fechaHora: "asc" },
      take: MAX_BACKUP,
      include: { usuario: { select: { nombre: true, username: true } } },
    });
    if (antiguos.length === 0) {
      return NextResponse.json({ ok: true, purgados: 0, corte: corte.toISOString() });
    }
    // Respaldo ANTES de borrar; si hay más de lo que cabe, solo se purga lo respaldado.
    const respaldo = await libroRespaldo(
      `Bitácora del negocio · respaldo previo a la purga (${new Date().toLocaleDateString("es-MX")})`,
      antiguos.map((l) => ({
        fecha: l.fechaHora,
        modulo: l.moduloSistema,
        usuario: l.usuario ? `${l.usuario.nombre} (${l.usuario.username})` : null,
        accion: l.accion,
        detalle: l.detallesError ?? (l.jsonPayload ? JSON.stringify(l.jsonPayload).slice(0, 500) : null),
      })),
      corte
    );

    const { count } = await prisma.bitacoraLog.deleteMany({
      where: { idLog: { in: antiguos.map((l) => l.idLog) } },
    });
    await prisma.bitacoraLog.create({
      data: {
        idUsuario: user.idPersona,
        accion: `Purga de bitácora: ${count} registros de hace más de ${meses} ${meses === 1 ? "mes" : "meses"}`,
        moduloSistema: "SEGURIDAD",
        jsonPayload: { purgados: count, meses, corte: corte.toISOString() },
      },
    });

    return NextResponse.json({
      ok: true,
      purgados: count,
      corte: corte.toISOString(),
      respaldoXlsx: respaldo.toString("base64"),
      archivo: `respaldo-bitacora-${new Date().toISOString().slice(0, 10)}.xlsx`,
    });
  } catch (error) {
    console.error("[bitacora:purgar]", error);
    return NextResponse.json({ error: "No se pudo purgar la bitácora" }, { status: 500 });
  }
}
