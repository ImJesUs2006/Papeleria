import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";
import { actuaComoDueno } from "@/lib/usuarios";

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const prisma = tenantDb(session.idNegocio);

    // canPurge: solo el dueño(a) (autoritativo desde la base, no del token).
    let canPurge = false;
    let isRoot = false;
    const user = await prisma.usuario.findUnique({
      where: { idPersona: session.idPersona },
      select: {
        isRoot: true,
        rol: true,
        permisoCobrar: true,
        permisoInventario: true,
        permisoReportes: true,
      },
    });

    if (user) {
      isRoot = user.isRoot === true;
      canPurge = await actuaComoDueno(prisma, user);
    }

    return NextResponse.json({
      idPersona: session.idPersona,
      nombre: session.nombre,
      rol: session.rol,
      permisoCobrar: session.permisoCobrar ?? true,
      permisoInventario: session.permisoInventario ?? true,
      permisoReportes: session.permisoReportes ?? true,
      isRoot,
      canPurge,
      // Sesión abierta por el soporte de la plataforma (y cuándo vence).
      soporte: session.soporte === true,
      soporteHasta: session.soporte && session.exp ? new Date(session.exp * 1000).toISOString() : null,
    });
  } catch {
    return NextResponse.json(
      { error: "Error al verificar sesión" },
      { status: 500 }
    );
  }
}