import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { signToken } from "@/lib/auth";
import { registrarPlataforma, requirePlataforma } from "@/lib/plataforma";

// ============================================================
// POST /api/plataforma/negocios/[id]/soporte
// "Entrar como soporte": abre en este navegador una sesión de 1 hora
// dentro del negocio, como su dueño(a), marcada como soporte (no puede
// transferir la propiedad, reiniciar, purgar ni aceptar términos).
// Solo si el negocio lo permite; entrada queda en ambas bitácoras.
// ============================================================

const DURACION_SOPORTE_S = 60 * 60;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requirePlataforma())) return NextResponse.json({ error: "Sin sesión de plataforma" }, { status: 401 });
  const { id } = await params;
  const negocio = await prisma.negocio.findUnique({ where: { idNegocio: id } });
  if (!negocio) return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 });
  if (!negocio.activo) return NextResponse.json({ error: "El negocio está suspendido" }, { status: 409 });
  if (!negocio.permitirSoporte) {
    return NextResponse.json(
      { error: "El dueño(a) de este negocio no permite el acceso de soporte (Configuración → Seguridad)" },
      { status: 403 }
    );
  }
  const dueno = await prisma.usuario.findFirst({
    where: { idNegocio: id, rol: "ADMINISTRADORA", activa: true, eliminadoEn: null },
    orderBy: [{ isRoot: "desc" }, { createdAt: "asc" }],
  });
  if (!dueno) return NextResponse.json({ error: "El negocio no tiene una administradora activa" }, { status: 409 });

  const token = await signToken(
    {
      idPersona: dueno.idPersona,
      idNegocio: id,
      nombre: dueno.nombre,
      rol: dueno.rol,
      permisoCobrar: dueno.permisoCobrar,
      permisoInventario: dueno.permisoInventario,
      permisoReportes: dueno.permisoReportes,
      soporte: true,
    },
    `${DURACION_SOPORTE_S}s`
  );
  const hasta = new Date(Date.now() + DURACION_SOPORTE_S * 1000);
  await prisma.bitacoraLog.create({
    data: {
      idNegocio: id,
      idUsuario: null,
      accion: `Soporte técnico entró al negocio (sesión hasta las ${hasta.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })})`,
      moduloSistema: "SEGURIDAD",
    },
  });
  await registrarPlataforma(`Entrada como soporte a ${negocio.nombre}`, id);

  const res = NextResponse.json({ ok: true, destino: "/dashboard", hasta });
  res.cookies.set("papeleria_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DURACION_SOPORTE_S,
  });
  return res;
}
