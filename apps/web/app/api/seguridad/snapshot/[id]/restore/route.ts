import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { compare } from "bcryptjs";
import { requireAuth } from "@/lib/auth";
import { restoreFromSnapshot } from "@/lib/snapshots";

// ============================================================
// POST /api/seguridad/snapshot/[id]/restore
// Restaura la configuración guardada en un snapshot.
// Exige ADMINISTRADORA raíz (isRoot) + contraseña verificada.
// ============================================================

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const session = auth.user;
  const { id } = await params;

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

  const user = await prisma.usuario.findUnique({ where: { idPersona: session.idPersona } });
  if (!user) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 401 });
  }
  const valida = await compare(password, user.passwordHash);
  if (!valida) {
    return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
  }
  if (user.isRoot !== true) {
    return NextResponse.json(
      { error: "Solo la cuenta raíz puede restaurar snapshots" },
      { status: 403 }
    );
  }

  try {
    const resultado = await prisma.$transaction((tx) =>
      restoreFromSnapshot(tx as any, { id, idUsuario: session.idPersona })
    );
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : 500;
    const mensaje =
      e instanceof Error && e.message ? e.message : "No se pudo restaurar el snapshot";
    if (status >= 500) console.error("[snapshot:restore]", e);
    return NextResponse.json({ error: mensaje }, { status });
  }
}