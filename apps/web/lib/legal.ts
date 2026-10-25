// ============================================================
// Aviso de privacidad y términos y condiciones de la plataforma.
// Es una PLANTILLA razonable para México: antes de vender, revísala con un
// abogado y completa los datos del responsable en las variables de entorno:
//   LEGAL_RESPONSABLE  = "Nombre o razón social de quien opera el sistema"
//   LEGAL_DOMICILIO    = "Calle, número, colonia, municipio, estado, CP"
//   LEGAL_CORREO       = correo para privacidad (si falta, SOPORTE_CORREO)
// Al cambiar el texto de fondo, sube VERSION_LEGAL: el dueño(a) de cada
// negocio vuelve a aceptarlo la siguiente vez que entre.
// ============================================================

export const VERSION_LEGAL = "2026-10-26";

export interface DatosResponsable {
  nombre: string;
  domicilio: string | null;
  correo: string | null;
}

export function datosResponsable(): DatosResponsable {
  return {
    nombre: process.env.LEGAL_RESPONSABLE?.trim() || "El operador de esta plataforma",
    domicilio: process.env.LEGAL_DOMICILIO?.trim() || null,
    correo: process.env.LEGAL_CORREO?.trim() || process.env.SOPORTE_CORREO?.trim() || null,
  };
}

export interface SeccionLegal {
  titulo: string;
  parrafos: string[];
}

export function avisoPrivacidad(r: DatosResponsable): SeccionLegal[] {
  const contacto = r.correo ? `al correo ${r.correo}` : "por los medios de contacto publicados en esta plataforma";
  return [
    {
      titulo: "1. Quién es responsable de tus datos",
      parrafos: [
        `${r.nombre}${r.domicilio ? `, con domicilio en ${r.domicilio},` : ""} opera este sistema de punto de venta e inventario ("la plataforma") y es responsable del tratamiento de los datos de las cuentas de los negocios y de sus usuarios, conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.`,
        "Cada negocio que usa la plataforma es responsable de los datos de SUS clientes (por ejemplo, nombre, teléfono o datos fiscales para facturar). Respecto de esos datos, la plataforma actúa como encargada: los guarda y procesa solo para dar el servicio al negocio y siguiendo sus instrucciones.",
      ],
    },
    {
      titulo: "2. Qué datos tratamos",
      parrafos: [
        "De las personas usuarias del sistema: nombre, nombre de usuario, contraseña (guardada cifrada, nunca en texto legible), correo electrónico opcional, rol y permisos, y registros de actividad (fecha, hora, acciones y dirección IP) para seguridad y auditoría.",
        "Del negocio: nombre, giro, datos fiscales que capture (RFC, régimen, domicilio fiscal), productos, ventas, cortes de caja, proveedores y demás información de operación.",
        "De los clientes del negocio, solo lo que el negocio decida registrar: nombre, teléfono, correo, datos fiscales y su historial de compras y puntos.",
        "No tratamos datos personales sensibles. No guardamos datos de tarjetas bancarias: los cobros con tarjeta se hacen en la terminal del banco del negocio.",
      ],
    },
    {
      titulo: "3. Para qué los usamos",
      parrafos: [
        "Finalidades necesarias: dar acceso al sistema, registrar ventas, inventario y caja; generar tickets, reportes y la información para facturar; mantener la seguridad (bitácora, bloqueo de intentos de acceso); recuperar contraseñas; respaldar la información; y dar soporte técnico cuando el negocio lo permita.",
        "No usamos los datos para publicidad ni los vendemos.",
      ],
    },
    {
      titulo: "4. Con quién los compartimos",
      parrafos: [
        "Solo con proveedores que hacen posible el servicio (alojamiento del servidor y la base de datos, envío de correos, almacenamiento de imágenes), obligados a protegerlos, y con autoridades cuando una ley o una orden lo exija. Estas transferencias no requieren tu consentimiento según la ley.",
      ],
    },
    {
      titulo: "5. Tus derechos (ARCO) y cómo ejercerlos",
      parrafos: [
        `Puedes Acceder a tus datos, Rectificarlos, Cancelarlos u Oponerte a su uso, así como revocar tu consentimiento o limitar su uso, escribiendo ${contacto}. Indica tu nombre, el negocio al que perteneces, qué derecho quieres ejercer y un medio para responderte. Te contestaremos en un máximo de 20 días hábiles.`,
        "Si eres cliente de un negocio, dirígete primero a ese negocio, que es el responsable de tus datos; nosotros lo apoyaremos para atender tu solicitud.",
        "Cuando un negocio elimina a una persona usuaria, sus datos personales se anonimizan: sus ventas y movimientos se conservan por obligaciones fiscales y de auditoría, pero ya no muestran su nombre.",
      ],
    },
    {
      titulo: "6. Cookies y almacenamiento en el equipo",
      parrafos: [
        "Usamos únicamente cookies técnicas para mantener la sesión iniciada y recordar la sucursal, y el almacenamiento del navegador para que el sistema funcione sin internet (catálogo y ventas pendientes de enviar). No usamos cookies de publicidad ni de rastreo.",
      ],
    },
    {
      titulo: "7. Cuánto tiempo los guardamos y cómo los protegemos",
      parrafos: [
        "Mientras el negocio tenga su cuenta activa y, después, el tiempo que exijan las leyes fiscales (en general, cinco años para la información de ventas). Los datos viajan cifrados (https), las contraseñas se guardan con cifrado de un solo sentido y cada negocio solo puede ver su propia información.",
      ],
    },
    {
      titulo: "8. Cambios a este aviso",
      parrafos: [
        "Si cambiamos este aviso lo publicaremos en esta misma página con su nueva fecha, y pediremos de nuevo la aceptación del dueño(a) de cada negocio.",
      ],
    },
  ];
}

export function terminosCondiciones(r: DatosResponsable): SeccionLegal[] {
  return [
    {
      titulo: "1. El servicio",
      parrafos: [
        `${r.nombre} ofrece a negocios un sistema de punto de venta, inventario, caja, clientes, compras y reportes que se usa desde el navegador ("el servicio"). Al aceptar estos términos, el dueño(a) del negocio los acepta en nombre de su negocio y de las personas a quienes dé acceso.`,
      ],
    },
    {
      titulo: "2. Cuentas y accesos",
      parrafos: [
        "El dueño(a) del negocio administra los accesos de su equipo y es responsable de lo que se haga con ellos. Cada persona debe tener su propio usuario; las contraseñas son personales y no deben compartirse.",
        "Si sospechas que alguien entró sin permiso, cambia las contraseñas y avísanos.",
      ],
    },
    {
      titulo: "3. Uso aceptable",
      parrafos: [
        "No se permite usar el servicio para actividades ilícitas, intentar acceder a información de otros negocios, alterar su funcionamiento ni revenderlo sin autorización.",
      ],
    },
    {
      titulo: "4. La información es del negocio",
      parrafos: [
        "Los productos, ventas, clientes y demás información que captura el negocio le pertenecen. Puede descargar un respaldo de su información desde Configuración en cualquier momento. Trataremos esa información conforme al aviso de privacidad.",
      ],
    },
    {
      titulo: "5. Facturación e impuestos",
      parrafos: [
        "El servicio ayuda a preparar la información para facturar, pero el timbrado ante el SAT, el cálculo correcto de impuestos según el régimen del negocio y sus declaraciones son responsabilidad del negocio. Revisa la configuración de impuestos con tu contador(a).",
      ],
    },
    {
      titulo: "6. Disponibilidad, uso sin internet y respaldos",
      parrafos: [
        "Buscamos que el servicio esté disponible siempre, pero puede haber interrupciones por mantenimiento o causas ajenas. El modo sin internet guarda las ventas en el equipo y las envía al volver la conexión; borrar los datos del navegador antes de sincronizar puede hacer que se pierdan.",
        "Hacemos respaldos periódicos de la base de datos; aun así, recomendamos descargar respaldos propios con regularidad.",
      ],
    },
    {
      titulo: "7. Soporte técnico",
      parrafos: [
        "Para resolver un problema, el equipo de soporte puede entrar temporalmente al negocio solo si el dueño(a) lo permite en Configuración. Cada acceso queda registrado en la bitácora del negocio.",
      ],
    },
    {
      titulo: "8. Pagos, suspensión y baja",
      parrafos: [
        "Las condiciones de pago del servicio se acuerdan por separado. Podemos suspender un negocio por falta de pago o por uso contrario a estos términos, avisando previamente cuando sea posible. Al dar de baja la cuenta, el negocio puede pedir su información antes de que se elimine.",
      ],
    },
    {
      titulo: "9. Responsabilidad",
      parrafos: [
        "El servicio se ofrece como herramienta de apoyo. No somos responsables por pérdidas derivadas de datos capturados de forma incorrecta, de configuraciones hechas por el negocio o de fallas de internet, equipos o servicios de terceros. Nuestra responsabilidad máxima se limita a lo pagado por el servicio en los últimos tres meses.",
      ],
    },
    {
      titulo: "10. Cambios y ley aplicable",
      parrafos: [
        "Podemos actualizar estos términos; la nueva versión se publicará aquí y el dueño(a) deberá aceptarla para seguir usando el servicio. Estos términos se rigen por las leyes de los Estados Unidos Mexicanos.",
      ],
    },
  ];
}
