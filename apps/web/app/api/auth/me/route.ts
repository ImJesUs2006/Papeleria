import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const prisma = tenantDb(session.idNegocio);

    // canPurge: isRoot ⇒ sí; si no, ADMINISTRADORA con TODOS los permisos
    // de módulo activos (autoritativo desde la base, no del token).
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
      canPurge =
        isRoot ||
        (user.rol === "ADMINISTRADORA" &&
          user.permisoCobrar === true &&
          user.permisoInventario === true &&
          user.permisoReportes === true);
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
    });
  } catch {
    return NextResponse.json(
      { error: "Error al verificar sesión" },
      { status: 500 }
    );
  }
}