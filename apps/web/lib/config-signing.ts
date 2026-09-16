import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { BusinessConfig } from "@/lib/business-types";

// ============================================================
// Firma HMAC de la configuración de negocio (Feature Flags).
//
// Modelo de confianza "signed replica + server authoritative":
//   1. El MASTER_SECRET nunca abandona el servidor.
//   2. Por cada login se genera un sessionId aleatorio; derivamos
//      una sessionKey = HMAC(master, sessionId). El servidor firma
//      la config con la sessionKey y la entrega al cliente JUNTO
//      con la sessionKey. El cliente conserva la sessionKey SOLO
//      en memoria (React state, no persistida).
//   3. En localStorage/IndexedDB sólo vive { config, firma }.
//      Si una cajera la altera, la firma deja de cuadrar y la app
//      entra en "modo no verificado" (módulos no críticos en false).
//   4. Aunque el atacante extraiga la sessionKey en runtime, el
//      SERVIDOR re-valida flags en cada endpoint (requireFeature):
//      la autoridad final es siempre la BD.
// ============================================================

const MASTER_SECRET =
  process.env.CONFIG_SIGNING_SECRET || process.env.JWT_SECRET || "insecure-cfg-secret";

/** Serializa de forma canónica y estable (orden de llaves). */
export function canonicalize(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(canonicalize).join(",")}]`;
  const entries = Object.entries(obj as Record<string, unknown>)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`);
  return `{${entries.join(",")}}`;
}

export function newSessionId(): string {
  return randomBytes(24).toString("hex");
}

/** Derivación de la llave de sesión: HMAC(master, "session:" + sessionId). */
export function deriveSessionKey(sessionId: string): string {
  return createHmac("sha256", MASTER_SECRET).update(`session:${sessionId}`).digest("hex");
}

export function signConfigWithKey(config: BusinessConfig, sessionKey: string): string {
  return createHmac("sha256", Buffer.from(sessionKey, "utf8"))
    .update(canonicalize(config))
    .digest("hex");
}

export function verifyConfigSignature(
  config: BusinessConfig,
  sessionKey: string,
  firma: string
): boolean {
  const expected = signConfigWithKey(config, sessionKey);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(firma, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type SignedConfigPayload = {
  sessionId: string;
  sessionKey: string;
  config: BusinessConfig;
  firma: string;
};

export function buildSignedConfig(config: BusinessConfig): SignedConfigPayload {
  const sessionId = newSessionId();
  const sessionKey = deriveSessionKey(sessionId);
  return { sessionId, sessionKey, config, firma: signConfigWithKey(config, sessionKey) };
}

/**
 * Ruta usada SOLO en pruebas/lint: expone sessionKey de forma explícita.
 * El transporte real entrega la sessionKey en la respuesta del endpoint
 * `/api/configuracion/negocio/cache` (jamás a terceros).
 */
export { MASTER_SECRET };