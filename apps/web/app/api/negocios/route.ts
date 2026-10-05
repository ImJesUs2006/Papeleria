import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@papeleria/database";
import { crearNegocio, NegocioError } from "@/lib/negocios";

// ============================================================
// POST /api/negocios — alta de un negocio (operación de PLATAFORMA).
//
// No depende de la sesión de ningún negocio: se autoriza con el token de
// plataforma (variable PLATAFORMA_TOKEN, >= 24 caracteres) enviado en el
// encabezado `x-plataforma-token`. Sin esa variable el alta está apagada.
//
//   { codigo, nombre, admin: { nombre, username, password } }
// ============================================================

function tokenValido(recibido: string | null): boolean {
  const esperado = process.env.PLATAFORMA_TOKEN ?? "";
  if (esperado.length < 24 || !recibido) return false;
  const a = Buffer.from(esperado);
  const b = Buffer.from(recibido);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if ((process.env.PLATAFORMA_TOKEN ?? "").length < 24) {
    return NextResponse.json(
      { error: "El alta de negocios está deshabilitada (define PLATAFORMA_TOKEN)" },
      { status: 403 }
    );
  }
  if (!tokenValido(request.headers.get("x-plataforma-token"))) {
    return NextResponse.json({ error: "Token de plataforma inválido" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  try {
    const negocio = await crearNegocio(prisma, body);
    return NextResponse.json(negocio, { status: 201 });
  } catch (error) {
    if (error instanceof NegocioError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[negocios:post]", error);
    return NextResponse.json({ error: "Error interno al crear el negocio" }, { status: 500 });
  }
}
