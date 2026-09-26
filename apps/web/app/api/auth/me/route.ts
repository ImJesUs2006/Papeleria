import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    return NextResponse.json({
      idPersona: session.idPersona,
      nombre: session.nombre,
      rol: session.rol,
      permisoCobrar: session.permisoCobrar ?? true,
      permisoInventario: session.permisoInventario ?? true,
      permisoReportes: session.permisoReportes ?? true,
    });
  } catch {
    return NextResponse.json(
      { error: "Error al verificar sesión" },
      { status: 500 }
    );
  }
}
