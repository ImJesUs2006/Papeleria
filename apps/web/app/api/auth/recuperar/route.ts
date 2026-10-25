import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { tenantDb } from "@/lib/tenant";
import { claveUsuario } from "@/lib/tenant-keys";
import { esObjetoJson } from "@/lib/validacion";
import { registrarFallo, segundosBloqueado } from "@/lib/rate-limit";
import { correoConfigurado, enviarCorreo } from "@/lib/correo";
import { crearEnlace } from "@/lib/recuperacion";

// ============================================================
// POST /api/auth/recuperar  { negocio?, usuario }
// Si la cuenta existe, está activa y tiene correo, envía un enlace de
// un solo uso para elegir una contraseña nueva. La respuesta es SIEMPRE
// la misma (no revela qué usuarios existen ni si tienen correo).
// Límite: 5 solicitudes cada 15 min por negocio + usuario + IP.
// ============================================================

const LIMITE = { maxIntentos: 5, ventanaMs: 15 * 60_000, bloqueoMs: 15 * 60_000 };

export async function POST(request: Request) {
  const body = await request.json().then((b) => (esObjetoJson(b) ? b : null), () => null);
  if (!body) return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  const usuario = typeof body.usuario === "string" ? body.usuario.trim().toLowerCase().slice(0, 80) : "";
  const codigo = typeof body.negocio === "string" ? body.negocio.trim().toLowerCase().slice(0, 80) : "";
  if (!usuario) return NextResponse.json({ error: "Escribe tu usuario" }, { status: 400 });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
  const llave = `recuperar|${codigo}|${usuario}|${ip}`;
  const espera = segundosBloqueado(llave);
  if (espera > 0) {
    return NextResponse.json(
      { error: `Demasiadas solicitudes. Intenta de nuevo en ${Math.ceil(espera / 60)} min.` },
      { status: 429, headers: { "Retry-After": String(espera) } }
    );
  }
  registrarFallo(llave, LIMITE);

  const respuesta = NextResponse.json({ ok: true, correoConfigurado: correoConfigurado() });

  const negocio = codigo
    ? await prisma.negocio.findUnique({ where: { codigo } })
    : await prisma.negocio.findMany({ take: 2 }).then((n) => (n.length === 1 ? n[0] : null));
  if (!negocio?.activo) return respuesta;
  const db = tenantDb(negocio.idNegocio);
  const user = await db.usuario.findUnique({ where: claveUsuario(usuario) });
  if (!user || !user.activa || user.eliminadoEn || !user.email) return respuesta;

  const token = await crearEnlace(user);
  const origen = process.env.URL_PUBLICA || new URL(request.url).origin;
  const enlace = `${origen}/recuperar/${token}`;
  const enviado = await enviarCorreo({
    para: user.email,
    asunto: "Restablece tu contraseña",
    texto:
      `Hola ${user.nombre}:\n\nAlguien pidió restablecer la contraseña de tu usuario "${user.username}" en ${negocio.nombre}.\n` +
      `Si fuiste tú, abre este enlace (vale 1 hora y sirve una sola vez):\n\n${enlace}\n\n` +
      `Si no lo pediste, ignora este correo: tu contraseña no cambia.`,
  });
  if (!enviado && process.env.NODE_ENV !== "production") {
    // Desarrollo sin SMTP: el enlace aparece en la consola del servidor.
    console.log(`[recuperar] enlace para ${user.username}: ${enlace}`);
  }
  await db.bitacoraLog.create({
    data: {
      idUsuario: user.idPersona,
      accion: `Solicitud de recuperación de contraseña (${user.username})${enviado ? "" : " · correo no enviado"}`,
      moduloSistema: "SEGURIDAD",
      ipOrigen: ip,
    },
  });
  return respuesta;
}
