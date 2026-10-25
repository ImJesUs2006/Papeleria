import { NextResponse } from "next/server";
import {
  claveValida,
  COOKIE_PLATAFORMA,
  firmarSesionPlataforma,
  plataformaHabilitada,
  registrarPlataforma,
  requirePlataforma,
} from "@/lib/plataforma";
import { limpiarIntentos, registrarFallo, segundosBloqueado } from "@/lib/rate-limit";
import { esObjetoJson } from "@/lib/validacion";

// GET    → ¿hay sesión de plataforma?
// POST   { clave } → inicia sesión (limitado contra fuerza bruta)
// DELETE → cierra sesión

export async function GET() {
  return NextResponse.json({ habilitada: plataformaHabilitada(), activa: await requirePlataforma() });
}

export async function POST(request: Request) {
  if (!plataformaHabilitada()) {
    return NextResponse.json(
      { error: "La consola de plataforma está deshabilitada: define PLATAFORMA_TOKEN (24+ caracteres) en el servidor" },
      { status: 403 }
    );
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const llave = `plataforma:${ip}`;
  const espera = segundosBloqueado(llave);
  if (espera > 0) {
    return NextResponse.json({ error: `Demasiados intentos. Espera ${Math.ceil(espera / 60)} min.` }, { status: 429 });
  }
  const body = await request.json().then((b) => (esObjetoJson(b) ? b : {}), () => ({}));
  if (!claveValida(body?.clave)) {
    registrarFallo(llave);
    return NextResponse.json({ error: "Clave de plataforma incorrecta" }, { status: 401 });
  }
  limpiarIntentos(llave);
  await registrarPlataforma("Inicio de sesión en la consola", null, { ip });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_PLATAFORMA, await firmarSesionPlataforma(), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 4 * 60 * 60,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE_PLATAFORMA);
  return res;
}
