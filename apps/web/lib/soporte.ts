// ============================================================
// Contacto de soporte de la plataforma (lo define el dueño del SaaS en
// variables de entorno; si no hay ninguna, no se muestra nada).
//   SOPORTE_WHATSAPP = 5215512345678   (con lada de país, sin +)
//   SOPORTE_CORREO   = soporte@midominio.com
//   SOPORTE_HORARIO  = Lunes a sábado de 9 a 19 h
// ============================================================

export interface ContactoSoporte {
  whatsapp: string | null;
  correo: string | null;
  horario: string | null;
}

export function contactoSoporte(): ContactoSoporte {
  const wa = (process.env.SOPORTE_WHATSAPP ?? "").replace(/\D/g, "");
  const correo = (process.env.SOPORTE_CORREO ?? "").trim();
  return {
    whatsapp: wa.length >= 10 ? wa : null,
    correo: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) ? correo : null,
    horario: process.env.SOPORTE_HORARIO?.trim() || null,
  };
}
