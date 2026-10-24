import { timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

// ============================================================
// Consola de PLATAFORMA (dueño del SaaS). Es independiente de los
// negocios: no usa usuarios ni la cookie de sesión de ningún negocio.
// La clave es la variable de entorno PLATAFORMA_TOKEN (≥ 24 caracteres);
// al entrar se emite una cookie propia, firmada y de corta duración.
// ============================================================

export const COOKIE_PLATAFORMA = "papeleria_plataforma";
const DURACION = "4h";
const AUDIENCIA = "plataforma";

function secreto(): Uint8Array {
  const raw = process.env.JWT_SECRET;
  if (!raw || raw.length < 16) {
    if (process.env.NODE_ENV === "production") throw new Error("JWT_SECRET no está definido");
    return new TextEncoder().encode(raw || "dev-only-insecure-secret");
  }
  return new TextEncoder().encode(raw);
}

/** ¿La plataforma está habilitada en este servidor? */
export function plataformaHabilitada(): boolean {
  return (process.env.PLATAFORMA_TOKEN ?? "").length >= 24;
}

/** Comparación en tiempo constante contra PLATAFORMA_TOKEN. */
export function claveValida(recibida: unknown): boolean {
  const esperada = process.env.PLATAFORMA_TOKEN ?? "";
  if (esperada.length < 24 || typeof recibida !== "string" || !recibida) return false;
  const a = Buffer.from(esperada);
  const b = Buffer.from(recibida);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function firmarSesionPlataforma(): Promise<string> {
  return new SignJWT({ tipo: "plataforma" })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(AUDIENCIA)
    .setIssuedAt()
    .setExpirationTime(DURACION)
    .sign(secreto());
}

export async function sesionPlataformaValida(token: string | undefined): Promise<boolean> {
  if (!token || !plataformaHabilitada()) return false;
  try {
    const { payload } = await jwtVerify(token, secreto(), { algorithms: ["HS256"], audience: AUDIENCIA });
    return payload.tipo === "plataforma";
  } catch {
    return false;
  }
}

/** Para las rutas de /api/plataforma: true si hay sesión de plataforma. */
export async function requirePlataforma(): Promise<boolean> {
  const c = await cookies();
  return sesionPlataformaValida(c.get(COOKIE_PLATAFORMA)?.value);
}
