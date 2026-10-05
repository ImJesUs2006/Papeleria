import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export interface AuthPayload extends JWTPayload {
  idPersona: string;
  nombre: string;
  rol: "ADMINISTRADORA" | "CAJERA";
  // Permisos granulares (Fase 9). Ausentes en tokens antiguos ⇒ true.
  permisoCobrar?: boolean;
  permisoInventario?: boolean;
  permisoReportes?: boolean;
}

const DEV_SECRET = "dev-only-insecure-secret";

/**
 * Secreto de firma. En producción es OBLIGATORIO definir JWT_SECRET: con un
 * valor por defecto conocido cualquiera podría forjar un token de
 * administradora. Se resuelve de forma perezosa para no romper `next build`.
 */
function getSecret(): Uint8Array {
  const raw = process.env.JWT_SECRET;
  if (!raw || raw.length < 16) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "JWT_SECRET no está definido (o es menor a 16 caracteres). Defínelo antes de arrancar en producción."
      );
    }
    return new TextEncoder().encode(raw || DEV_SECRET);
  }
  return new TextEncoder().encode(raw);
}

const EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h";

export async function signToken(payload: Omit<AuthPayload, "iat" | "exp">) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(EXPIRES_IN)
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<AuthPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    return payload as AuthPayload;
  } catch {
    return null;
  }
}
