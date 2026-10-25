import nodemailer from "nodemailer";

// ============================================================
// Envío de correos por SMTP (Gmail, Outlook, el del hosting…).
// Variables: SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASS y
// CORREO_REMITENTE ("Mi POS <avisos@midominio.com>").
// Sin SMTP_HOST el sistema funciona igual; solo no envía correos.
// ============================================================

export function correoConfigurado(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.CORREO_REMITENTE);
}

let transporte: nodemailer.Transporter | null = null;
function obtenerTransporte() {
  if (!transporte) {
    const puerto = Number(process.env.SMTP_PORT) || 587;
    transporte = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: puerto,
      secure: puerto === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transporte;
}

export async function enviarCorreo(m: { para: string; asunto: string; texto: string; html?: string }): Promise<boolean> {
  if (!correoConfigurado()) return false;
  try {
    await obtenerTransporte().sendMail({
      from: process.env.CORREO_REMITENTE,
      to: m.para,
      subject: m.asunto,
      text: m.texto,
      html: m.html,
    });
    return true;
  } catch (e) {
    console.error("[correo]", e);
    return false;
  }
}

/** Correo válido con forma razonable (no verifica que exista). */
export function correoValido(v: unknown): v is string {
  return typeof v === "string" && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}
