// ============================================================
// Verificación de firma SEGURA PARA CLIENTE (WebCrypto).
// El cliente NUNCA firma: sólo verifica la firma emitida por el
// servidor usando la sessionKey que el servidor entregó en
// memoria tras el login/carga de cache.
// ============================================================
import type { BusinessConfig } from "@/lib/business-types";

export function canonicalize(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(canonicalize).join(",")}]`;
  const entries = Object.entries(obj as Record<string, unknown>)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`);
  return `{${entries.join(",")}}`;
}

async function importHmacKey(sessionKey: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(sessionKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
}

/** Verifica que `config` no fue manipulada; requiere la sessionKey en memoria. */
export async function isConfigSignatureValidClient(
  config: BusinessConfig,
  firma: string,
  sessionKey: string
): Promise<boolean> {
  try {
    if (!sessionKey || sessionKey.length < 32) return false;
    const key = await importHmacKey(sessionKey);
    const sig = hexToBytes(firma);
    if (sig.length !== 32) return false;
    return crypto.subtle.verify(
      "HMAC",
      key,
      sig.buffer as ArrayBuffer,
      new TextEncoder().encode(canonicalize(config))
    );
  } catch {
    return false;
  }
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "");
  if (clean.length % 2 !== 0) throw new Error("firma hex inválida");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}