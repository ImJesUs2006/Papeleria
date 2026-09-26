import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { compare } from "bcryptjs";
import { requireAuth } from "@/lib/auth";
import { resetNegocio, MOTIVO_REINICIO } from "@/lib/snapshots";

// ============================================================
// POST /api/seguridad/reset — Factory Reset NO destructivo.
//
// Requisitos duros de seguridad:
//   1. Rol ADMINISTRADORA (cualquier cuenta con ese rol, Fase 9
//      ABAC: ya no se limita a la raíz; la contraseña es la llave).
//   2. Contraseña del usuario verificada contra passwordHash.
//   3. Confirmación textual exacta: "CONFIRMAR BORRADO".
// El reset guarda un SnapshotSeguridad (config + totales) y
// reinicia el SetupWizard a PENDIENTE. NO elimina datos.
// ============================================================

const PHRASE = "CONFIRMAR BORRADO";

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

  const { password, confirmacion, motivo } = body ?? {};
  if (typeof confirmacion !== "string" || confirmacion !== PHRASE) {
    return NextResponse.json(
      { error: `Escribe exactamente "${PHRASE}" para confirmar` },
      { status: 400 }
    );
  }
  if (typeof password !== "string" || !password) {
    return NextResponse.json({ error: "La contraseña es requerida" }, { status: 400 });
  }

  const user = await prisma.usuario.findUnique({ where: { idPersona: session.idPersona } });
  if (!user) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 401 });
  }
  const valida = await compare(password, user.passwordHash);
  if (!valida) {
    return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
  }
  // Fase 9 (ABAC): cualquier administradora con su contraseña y la frase
  // exacta puede reiniciar; el snapshot protege la información previa.

  try {
    const snapshotId = await prisma.$transaction((tx) =>
      resetNegocio(tx as any, {
        idUsuario: session.idPersona,
        motivo: typeof motivo === "string" && motivo.trim() ? motivo.trim() : MOTIVO_REINICIO,
      })
    );

    return NextResponse.json({
      ok: true,
      snapshotId,
      mensaje: "Sistema reiniciado. Se creó un snapshot de recuperación.",
    });
  } catch (e: any) {
    // Fase B: no esconder el diagnóstico real bajo un mensaje genérico.
    // Los campos opcionales del snapshot (logo, datosBancarios, fechas…)
    // se normalizan con ?? null/{}/toNumber en lib/snapshots.ts.
    console.error("[snapshot:reset]", e);
    const status = typeof e?.status === "number" ? e.status : 500;
    // El detalle real del fallo se devuelve para que la UI lo muestre
    // en un toast (requisito Fase 9).
    const mensaje =
      e?.message || "No se pudo reiniciar el sistema. Revisa la bitácora de eventos (snapshot no creado).";
    return NextResponse.json({ error: mensaje }, { status });
  }
}