import { NextResponse } from "next/server";
import { esObjetoJson } from "@/lib/validacion";
import { EnlaceError, restablecerConEnlace, validarEnlace } from "@/lib/recuperacion";

// GET  /api/auth/restablecer?token=…  → ¿el enlace sirve? (y de quién es)
// POST /api/auth/restablecer { token, password } → cambia la contraseña.
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  try {
    const { usuario } = await validarEnlace(token);
    return NextResponse.json({ valido: true, nombre: usuario.nombre, username: usuario.username });
  } catch (e) {
    if (e instanceof EnlaceError) return NextResponse.json({ valido: false, error: e.message }, { status: 410 });
    throw e;
  }
}

export async function POST(request: Request) {
  const body = await request.json().then((b) => (esObjetoJson(b) ? b : null), () => null);
  if (!body) return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  try {
    const usuario = await restablecerConEnlace(body.token, body.password);
    return NextResponse.json({ ok: true, username: usuario.username });
  } catch (e) {
    if (e instanceof EnlaceError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
