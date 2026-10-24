// ============================================================
// Ayudante con GUIONES (sin IA): cada módulo tiene un saludo y un
// puñado de preguntas frecuentes con su respuesta escrita a mano.
// La lista de "Primeros pasos" se marca sola con /api/ayudante/progreso.
// ============================================================

export interface Pregunta {
  id: string;
  pregunta: string;
  /** Cada elemento es una burbuja del ayudante. */
  respuesta: string[];
  ir?: { etiqueta: string; href: string };
}

export interface Tema {
  /** Prefijo de ruta al que aplica ("/cobro"). */
  ruta: string;
  titulo: string;
  saludo: string;
  preguntas: Pregunta[];
}

export type Rol = "ADMINISTRADORA" | "CAJERA";

export interface Paso {
  id: PasoId;
  titulo: string;
  detalle: string;
  href: string;
  /** Solo se muestra a este rol (omitido = a todos). */
  rol?: Rol;
}

export type PasoId =
  | "configuracion"
  | "categorias"
  | "productos"
  | "cajera"
  | "caja"
  | "venta"
  | "corte";

export type Progreso = Record<PasoId, boolean>;

export const PRIMEROS_PASOS: Paso[] = [
  {
    id: "configuracion",
    titulo: "Configura tu negocio",
    detalle: "Nombre, giro, impuestos y métodos de pago.",
    href: "/configuracion",
    rol: "ADMINISTRADORA",
  },
  {
    id: "categorias",
    titulo: "Crea tus categorías",
    detalle: "Agrupan los productos en pestañas del cobro.",
    href: "/inventario",
    rol: "ADMINISTRADORA",
  },
  {
    id: "productos",
    titulo: "Da de alta productos",
    detalle: "Uno por uno, por carga masiva o con el catálogo de ejemplo.",
    href: "/inventario",
    rol: "ADMINISTRADORA",
  },
  {
    id: "cajera",
    titulo: "Crea el usuario de tu cajera",
    detalle: "Cada quien entra con su usuario: así sabes quién cobró.",
    href: "/configuracion",
    rol: "ADMINISTRADORA",
  },
  { id: "caja", titulo: "Abre la caja", detalle: "Cuenta el fondo inicial con el que empiezas.", href: "/caja" },
  { id: "venta", titulo: "Haz tu primera venta", detalle: "Busca o escanea, cobra y entrega el ticket.", href: "/cobro" },
  { id: "corte", titulo: "Haz tu primer corte", detalle: "Cuenta el efectivo al cerrar la caja.", href: "/caja" },
];

export function pasosDe(rol: Rol | null): Paso[] {
  return PRIMEROS_PASOS.filter((p) => !p.rol || p.rol === rol);
}

export const TEMA_GENERAL: Tema = {
  ruta: "/",
  titulo: "General",
  saludo: "¡Hola! Soy tu ayudante. Elige una pregunta y te explico paso a paso.",
  preguntas: [
    {
      id: "g-menu",
      pregunta: "¿Cómo me muevo por el sistema?",
      respuesta: [
        "El menú de la izquierda está agrupado en Ventas, Inventario, Compras y Administración.",
        "Si una opción no aparece es porque tu usuario no tiene permiso o el módulo está apagado para tu giro.",
        "Tip: presiona ? para ver los atajos de teclado.",
      ],
    },
    {
      id: "g-alertas",
      pregunta: "¿Qué es la campana?",
      respuesta: [
        "La campana junto al nombre del negocio junta los pendientes: stock bajo, pagos a proveedores, apartados por vencer y la caja abierta de días anteriores.",
        "Cada aviso tiene un botón que te lleva directo a resolverlo. \"Entendido\" lo oculta hasta mañana.",
      ],
    },
    {
      id: "g-offline",
      pregunta: "¿Qué pasa si se va el internet?",
      respuesta: [
        "Puedes seguir cobrando: las ventas se guardan en el equipo y se envían solas cuando vuelve la conexión.",
        "No cierres sesión mientras haya ventas pendientes de enviar.",
      ],
    },
  ],
};

export const TEMAS: Tema[] = [
  {
    ruta: "/cobro",
    titulo: "Cobro",
    saludo: "Estás en el cobro. Aquí se arma la venta y se cobra.",
    preguntas: [
      {
        id: "c-agregar",
        pregunta: "¿Cómo agrego productos?",
        respuesta: [
          "Escanea el código de barras o escribe parte del nombre en el buscador y presiona Enter.",
          "También puedes tocar las tarjetas del catálogo, filtradas por categoría.",
        ],
      },
      {
        id: "c-cambio",
        pregunta: "¿Cómo cobro y calculo el cambio?",
        respuesta: [
          "Presiona Cobrar, elige el método de pago y escribe con cuánto te pagan (o toca uno de los billetes sugeridos).",
          "El sistema te muestra en grande el cambio que debes entregar.",
        ],
      },
      {
        id: "c-mayoreo",
        pregunta: "¿Cómo funciona el mayoreo?",
        respuesta: [
          "Si un producto tiene precios por escala (por ejemplo, de 12 piezas en adelante), el precio baja solo al llegar a esa cantidad.",
          "El carrito te avisa cuántas piezas faltan para el siguiente precio.",
        ],
      },
      {
        id: "c-apartado",
        pregunta: "¿Qué es un apartado?",
        respuesta: [
          "El cliente deja un anticipo y tú le guardas la mercancía unos días.",
          "Arma el carrito y usa \"Crear apartado\"; los abonos y la liquidación se registran en el módulo Apartados.",
        ],
        ir: { etiqueta: "Ir a Apartados", href: "/apartados" },
      },
    ],
  },
  {
    ruta: "/caja",
    titulo: "Caja",
    saludo: "Esta es la caja: apertura, retiros y corte del día.",
    preguntas: [
      {
        id: "k-abrir",
        pregunta: "¿Cómo abro la caja?",
        respuesta: [
          "Cuenta el efectivo con el que empiezas (el fondo) y escríbelo al abrir.",
          "Sin caja abierta no se pueden cobrar ventas en efectivo.",
        ],
      },
      {
        id: "k-corte",
        pregunta: "¿Cómo hago el corte?",
        respuesta: [
          "Cuenta billetes y monedas por denominación; el sistema suma el total.",
          "En el corte a ciegas no ves cuánto \"debería\" haber hasta que confirmas tu conteo: así el arqueo es honesto.",
          "Al final verás la diferencia: sobrante o faltante.",
        ],
      },
      {
        id: "k-retiro",
        pregunta: "¿Y si saco dinero de la caja?",
        respuesta: [
          "Registra un retiro con su motivo (pago a proveedor, depósito, etc.).",
          "Así el corte cuadra y queda registro de quién lo hizo.",
        ],
      },
    ],
  },
  {
    ruta: "/inventario",
    titulo: "Inventario",
    saludo: "Aquí administras tus productos, precios y existencias.",
    preguntas: [
      {
        id: "i-alta",
        pregunta: "¿Cómo doy de alta un producto?",
        respuesta: [
          "Usa \"Nuevo producto\": código, descripción, precio y existencia inicial son lo mínimo.",
          "Si apenas empiezas, en Configuración puedes cargar el catálogo de ejemplo de tu giro y editarlo.",
        ],
      },
      {
        id: "i-escalas",
        pregunta: "¿Cómo pongo precios de mayoreo?",
        respuesta: [
          "En el producto, agrega escalas: \"desde 12 piezas a $X\", \"desde 50 a $Y\".",
          "Cada escala debe ser más barata que la anterior; el sistema te avisa si no.",
        ],
      },
      {
        id: "i-ficha",
        pregunta: "¿Dónde veo el historial de un producto?",
        respuesta: ["Abre la ficha del producto: ahí están sus movimientos (kardex), ventas recientes y lotes."],
      },
    ],
  },
  {
    ruta: "/proveedores",
    titulo: "Proveedores",
    saludo: "Aquí registras a quién le compras y cuánto le debes.",
    preguntas: [
      {
        id: "p-credito",
        pregunta: "¿Qué es el crédito con proveedores?",
        respuesta: [
          "Si un proveedor te da días para pagar, captura esos días de crédito.",
          "Cada pedido recibido a crédito genera una cuenta por pagar con fecha de vencimiento, y la campana te avisa antes.",
        ],
        ir: { etiqueta: "Ver pedidos", href: "/pedidos" },
      },
    ],
  },
  {
    ruta: "/pedidos",
    titulo: "Pedidos",
    saludo: "Aquí pides mercancía y la recibes en inventario.",
    preguntas: [
      {
        id: "o-recibir",
        pregunta: "¿Cómo recibo un pedido?",
        respuesta: [
          "En el pedido usa \"Recibido\" (o \"Recibir parcial\" si llegó incompleto): la existencia sube y el costo promedio se actualiza.",
          "Si el producto maneja lotes, te pedirá lote y caducidad.",
        ],
      },
    ],
  },
  {
    ruta: "/devoluciones",
    titulo: "Devoluciones",
    saludo: "Aquí se registran devoluciones de ventas.",
    preguntas: [
      {
        id: "d-como",
        pregunta: "¿Cómo registro una devolución?",
        respuesta: [
          "Busca el ticket, elige las piezas a devolver, el motivo y si regresan a inventario o a merma.",
          "Arriba del monto configurado, una administradora debe autorizar.",
        ],
      },
    ],
  },
  {
    ruta: "/clientes",
    titulo: "Clientes",
    saludo: "Aquí ves a tus clientes y lo que compran.",
    preguntas: [
      {
        id: "l-datos",
        pregunta: "¿Por qué aparecen datos ocultos?",
        respuesta: [
          "Teléfono, correo y RFC se muestran enmascarados para proteger la privacidad del cliente.",
          "Toca el ojo para verlos completos un momento (útil si la pantalla la ve el cliente).",
        ],
      },
      {
        id: "l-factura",
        pregunta: "¿Qué necesito para facturarle?",
        respuesta: ["RFC, razón social, código postal, régimen fiscal y uso de CFDI. La ficha del cliente te dice qué falta."],
      },
    ],
  },
  {
    ruta: "/facturacion",
    titulo: "Facturación",
    saludo: "Aquí preparas los datos para facturar en el portal del SAT.",
    preguntas: [
      {
        id: "f-flujo",
        pregunta: "¿Cómo facturo?",
        respuesta: [
          "El sistema no timbra: arma un paquete con los datos del cliente y los conceptos de la venta.",
          "Copia cada dato al portal del SAT, timbra allá y regresa a marcar la factura como emitida con su folio fiscal.",
        ],
      },
    ],
  },
  {
    ruta: "/configuracion",
    titulo: "Configuración",
    saludo: "Aquí ajustas tu negocio, usuarios y módulos.",
    preguntas: [
      {
        id: "s-modulos",
        pregunta: "¿Qué módulos debo prender?",
        respuesta: [
          "Cada módulo dice si es Recomendado, Opcional o No aplica para tu giro.",
          "Apagar un módulo lo oculta del menú y bloquea su uso, pero no borra datos.",
        ],
      },
      {
        id: "s-usuarios",
        pregunta: "¿Cómo creo a mi cajera?",
        respuesta: [
          "En Usuarios, agrega uno nuevo con rol Cajera y una contraseña.",
          "Puedes quitarle permisos finos, como ver reportes o editar inventario.",
        ],
      },
      {
        id: "s-ejemplo",
        pregunta: "¿Qué es el catálogo de ejemplo?",
        respuesta: [
          "Son productos típicos de tu giro con códigos que empiezan con EJ-, para practicar.",
          "Puedes editarlos o desactivarlos cuando captures los tuyos; cargarlo dos veces no los duplica.",
        ],
      },
    ],
  },
  {
    ruta: "/reportes",
    titulo: "Reportes",
    saludo: "Aquí ves cómo va tu negocio.",
    preguntas: [
      {
        id: "r-utilidad",
        pregunta: "¿Cómo sé cuánto gano?",
        respuesta: [
          "Abre \"Margen por Producto\": compara el precio de venta contra el costo promedio de cada producto.",
          "\"Reabastecimiento\" te dice qué conviene volver a pedir.",
        ],
      },
    ],
  },
];

/** Tema del módulo actual (el prefijo más largo que coincide). */
export function temaPara(ruta: string): Tema {
  const t = TEMAS.filter((x) => ruta === x.ruta || ruta.startsWith(`${x.ruta}/`)).sort(
    (a, b) => b.ruta.length - a.ruta.length
  )[0];
  return t ?? TEMA_GENERAL;
}
