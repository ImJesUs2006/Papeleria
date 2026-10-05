// ============================================================
// Limitador de intentos en memoria (ventana deslizante + bloqueo).
// Pensado para el login: frena la fuerza bruta de contraseñas.
// Vive en el proceso; con varias instancias debe moverse a un
// almacén compartido (Redis / tabla en BD).
// ============================================================

interface Registro {
  fallos: number[];
  bloqueadoHasta: number;
}

export interface RateLimitOpciones {
  maxIntentos: number;
  ventanaMs: number;
  bloqueoMs: number;
}

export const LOGIN_LIMITE: RateLimitOpciones = {
  maxIntentos: 5,
  ventanaMs: 15 * 60_000,
  bloqueoMs: 15 * 60_000,
};

const registros = new Map<string, Registro>();
const MAX_LLAVES = 10_000;

/** Segundos restantes de bloqueo para la llave (0 = puede intentar). */
export function segundosBloqueado(llave: string, ahora = Date.now()): number {
  const r = registros.get(llave);
  if (!r || r.bloqueadoHasta <= ahora) return 0;
  return Math.ceil((r.bloqueadoHasta - ahora) / 1000);
}

/** Registra un intento fallido; devuelve true si la llave quedó bloqueada. */
export function registrarFallo(
  llave: string,
  opts: RateLimitOpciones = LOGIN_LIMITE,
  ahora = Date.now()
): boolean {
  if (registros.size >= MAX_LLAVES) {
    for (const [k, v] of registros) {
      const ultimo = v.fallos[v.fallos.length - 1] ?? 0;
      if (v.bloqueadoHasta <= ahora && ahora - ultimo > opts.ventanaMs) registros.delete(k);
    }
    if (registros.size >= MAX_LLAVES) registros.clear();
  }
  const r = registros.get(llave) ?? { fallos: [], bloqueadoHasta: 0 };
  r.fallos = r.fallos.filter((t) => ahora - t < opts.ventanaMs);
  r.fallos.push(ahora);
  if (r.fallos.length >= opts.maxIntentos) {
    r.bloqueadoHasta = ahora + opts.bloqueoMs;
    r.fallos = [];
  }
  registros.set(llave, r);
  return r.bloqueadoHasta > ahora;
}

export function limpiarIntentos(llave: string): void {
  registros.delete(llave);
}

/** Solo para pruebas. */
export function _reiniciarRateLimit(): void {
  registros.clear();
}
