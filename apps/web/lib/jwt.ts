import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export interface AuthPayload extends JWTPayload {
  idPersona: string;
  nombre: string;
  rol: "ADMINISTRADORA" | "CAJERA";
}

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "fallback-secret-change-me"
);
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h";

export async function signToken(payload: Omit<AuthPayload, "iat" | "exp">) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(EXPIRES_IN)
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<AuthPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as AuthPayload;
  } catch {
    return null;
  }
}