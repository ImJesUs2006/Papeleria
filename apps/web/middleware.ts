import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken } from "@/lib/jwt";

const PUBLIC_PATHS = ["/api/auth/login", "/(auth)/login", "/login", "/_next", "/favicon.ico"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get("papeleria_token")?.value;

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const payload = await verifyToken(token);

  if (!payload) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("papeleria_token");
    return response;
  }

  // Role-based route protection. La config firmada (GET cache) es de LECTURA
  // y la firma ya protege contra manipulación: cualquier usuario autenticado
  // puede hidratar los flags (las CAJERA no degradan a NO_VERIFICADA). Los
  // escritores de configuración SÍ siguen siendo exclusivos de ADMINISTRADORA.
  const esCacheConfigLectura = pathname === "/api/configuracion/negocio/cache";
  const isAdminRoute =
    !esCacheConfigLectura &&
    (pathname.startsWith("/setup") ||
      pathname.startsWith("/configuracion") ||
      pathname.startsWith("/reportes") ||
      pathname.startsWith("/bitacora") ||
      pathname.startsWith("/facturacion") ||
      pathname.includes("/inventario"));

  if (isAdminRoute && payload.rol !== "ADMINISTRADORA") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/cobro", request.url));
  }

  // Attach user to headers for server components
  const headers = new Headers(request.headers);
  headers.set("x-user-id", payload.idPersona);
  headers.set("x-user-name", payload.nombre);
  headers.set("x-user-rol", payload.rol);

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};