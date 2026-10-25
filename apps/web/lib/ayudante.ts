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
    ruta: "/dashboard",
    titulo: "Dashboard",
    saludo: "Este es el resumen del día: ventas, horas fuertes y lo que hay que atender.",
    preguntas: [
      {
        id: "db-que",
        pregunta: "¿Qué veo en el Dashboard?",
        respuesta: [
          "Arriba, lo vendido y los tickets; en medio, a qué horas vendes más; y la lista de productos con poco inventario.",
          "Los avisos importantes (pagos, caducidades, apartados) llegan también a la campana.",
        ],
      },
      {
        id: "db-analisis",
        pregunta: "¿Dónde veo un análisis más completo?",
        respuesta: [
          "En Reportes → Análisis del negocio: tendencia, días y horas pico, qué productos sostienen tu venta, margen por categoría y cuánto te dura la mercancía.",
          "Cada gráfica trae su «¿Qué significa?» explicado en sencillo.",
        ],
        ir: { etiqueta: "Ir a Reportes", href: "/reportes" },
      },
      {
        id: "db-alerta",
        pregunta: "¿Por qué me sale un producto en rojo?",
        respuesta: ["Su existencia llegó a cero o está por debajo del mínimo que capturaste en el producto. Haz un pedido o ajusta el mínimo."],
        ir: { etiqueta: "Ir a Pedidos", href: "/pedidos" },
      },
    ],
  },
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
          "Elige el método de pago y escribe con cuánto te pagan (o toca uno de los billetes sugeridos).",
          "El sistema te muestra en grande el cambio que debes entregar.",
        ],
      },
      {
        id: "c-cliente",
        pregunta: "¿Cómo le sumo puntos a un cliente?",
        respuesta: [
          "Debajo del carrito dice «Público general»: toca «Cliente registrado», búscalo o dalo de alta en ese momento.",
          "Verás sus puntos y cuántos gana con la compra. Los puntos funcionan si el negocio activó «Puntos Monedero» como método de pago.",
        ],
      },
      {
        id: "c-mayoreo",
        pregunta: "¿Cómo funciona el mayoreo?",
        respuesta: [
          "Si un producto tiene precios de mayoreo («desde 12 piezas a $X»), el precio baja solo al llegar a esa cantidad y el carrito te avisa cuántas faltan.",
          "Con «Precio mayorista» activado se cobra la escala más baja sin importar la cantidad (para clientes mayoristas).",
        ],
      },
      {
        id: "c-apartado",
        pregunta: "¿Qué es un apartado?",
        respuesta: [
          "El cliente deja un anticipo y tú le guardas la mercancía unos días.",
          "Arma el carrito y usa «Crear apartado»; los abonos y la liquidación se registran en Apartados.",
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
        respuesta: ["Cuenta el efectivo con el que empiezas (el fondo) y escríbelo al abrir.", "Sin caja abierta no se pueden cobrar ventas."],
      },
      {
        id: "k-corte",
        pregunta: "¿Cómo hago el corte?",
        respuesta: [
          "Cuenta billetes y monedas por denominación; el sistema suma el total.",
          "En el corte a ciegas no ves cuánto «debería» haber hasta que confirmas tu conteo: así el arqueo es honesto.",
          "Al final verás si cuadra; imprime el ticket del corte solo si lo necesitas.",
        ],
      },
      {
        id: "k-retiro",
        pregunta: "¿Y si saco dinero de la caja?",
        respuesta: ["La administración registra un retiro con su motivo (pago a proveedor, depósito…). Así el corte cuadra y queda quién lo hizo."],
      },
      {
        id: "k-cajon",
        pregunta: "¿Cómo abro el cajón sin vender?",
        respuesta: [
          "Con la impresora térmica configurada aparece el botón «Abrir cajón». Pide el motivo (dar cambio, revisar) y queda en la bitácora.",
          "Se configura en Configuración → Equipo.",
        ],
      },
    ],
  },
  {
    ruta: "/apartados",
    titulo: "Apartados",
    saludo: "Aquí ves los apartados vigentes, sus abonos y cuándo vencen.",
    preguntas: [
      {
        id: "ap-abono",
        pregunta: "¿Cómo registro un abono?",
        respuesta: ["Abre el apartado y registra el pago; el saldo baja y el dinero entra a la caja abierta."],
      },
      {
        id: "ap-liquidar",
        pregunta: "¿Qué pasa al liquidar?",
        respuesta: ["Al pagar el saldo completo el apartado se vuelve una venta normal con su ticket, y el cliente se lleva la mercancía."],
      },
      {
        id: "ap-vencido",
        pregunta: "¿Y si el cliente ya no vino?",
        respuesta: [
          "Pasado el plazo (Configuración → días de apartado) la campana te avisa.",
          "La administración puede cancelarlo: la mercancía regresa al inventario y decides si devuelves el anticipo.",
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
          "Arriba del monto configurado, una administradora debe autorizar con su clave.",
        ],
      },
      {
        id: "d-plazo",
        pregunta: "¿Hay plazo para devolver?",
        respuesta: ["Sí, el que fijes en Configuración (por defecto 30 días). Pasado ese plazo el sistema no deja devolver."],
      },
      {
        id: "d-serie",
        pregunta: "¿Y si el producto tiene número de serie?",
        respuesta: ["Se pide la serie que regresa; vuelve a quedar disponible para venderse."],
      },
    ],
  },
  {
    ruta: "/promociones",
    titulo: "Promociones",
    saludo: "Aquí creas descuentos que el cobro aplica solo.",
    preguntas: [
      {
        id: "pr-tipos",
        pregunta: "¿Qué tipos de promoción hay?",
        respuesta: ["Porcentaje (ej. 10% de descuento) o NxM (lleva 3, paga 2). Pueden aplicar a todo, a una categoría o a un producto."],
      },
      {
        id: "pr-fechas",
        pregunta: "¿Puedo programarlas?",
        respuesta: ["Sí: con fecha de inicio y fin se activan y desactivan solas. También puedes pausarlas cuando quieras."],
      },
      {
        id: "pr-quieto",
        pregunta: "¿Qué producto conviene promocionar?",
        respuesta: ["Los que no se mueven. En Reportes → Análisis del negocio verás cuáles tienen existencia y no se vendieron en el periodo."],
        ir: { etiqueta: "Ver análisis", href: "/reportes" },
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
          "Usa «Nuevo producto»: descripción, código, precio y dos preguntas: ¿cómo se vende? (pieza, granel o servicio) y ¿control extra? (lotes, series o variantes).",
          "Si apenas empiezas, en Configuración puedes cargar el catálogo de ejemplo de tu giro.",
        ],
      },
      {
        id: "i-paquete",
        pregunta: "Lo compro por paquete, ¿cómo lo registro?",
        respuesta: [
          "En «¿Cómo lo compras al proveedor?» escribe la unidad (Paquete, Caja) y cuántas piezas trae.",
          "Los pedidos se capturan en paquetes; al recibir entran piezas y el costo se reparte por pieza.",
        ],
      },
      {
        id: "i-escalas",
        pregunta: "¿Cómo pongo precios de mayoreo?",
        respuesta: ["En el producto agrega escalas: «desde 12 piezas a $X», «desde 50 a $Y». Cada escala debe ser más barata que la anterior."],
      },
      {
        id: "i-excel",
        pregunta: "¿Puedo cargar muchos productos con Excel?",
        respuesta: [
          "Sí: en Carga Masiva descarga la plantilla (trae instrucciones y ejemplos), llénala y súbela.",
          "Si el código ya existe se actualiza solo con las columnas que traiga el archivo.",
        ],
      },
      {
        id: "i-quitar",
        pregunta: "¿Cómo quito un producto?",
        respuesta: ["Con el botón de basura: si nunca se movió se elimina; si ya tiene ventas se da de baja (deja de aparecer, pero su historial se conserva)."],
      },
    ],
  },
  {
    ruta: "/lotes",
    titulo: "Lotes y series",
    saludo: "Aquí ves y administras lotes con caducidad, números de serie y variantes.",
    preguntas: [
      {
        id: "l-lote",
        pregunta: "¿Qué es un lote?",
        respuesta: [
          "Piezas que llegaron juntas con la misma caducidad. Al vender se descuenta primero lo que caduca antes y nunca un lote vencido.",
          "Lo cómodo es capturarlo al recibir un pedido.",
        ],
      },
      {
        id: "l-baja",
        pregunta: "¿Qué hago con un lote caducado?",
        respuesta: ["Dalo de baja como merma (queda en el kardex). Un lote agotado se puede eliminar de la lista."],
      },
      {
        id: "l-serie",
        pregunta: "¿Para qué sirven las series?",
        respuesta: ["Para artículos únicos con garantía: cada pieza tiene su número y al vender se indica cuál sale. Una vendida se conserva como historial."],
      },
      {
        id: "l-variantes",
        pregunta: "¿Cómo creo tallas o colores?",
        respuesta: ["En Variantes elige el producto modelo y escribe los ejes (Talla: CH, M, G · Color: Rojo, Azul). Cada combinación lleva su propia existencia."],
      },
    ],
  },
  {
    ruta: "/traspasos",
    titulo: "Traspasos",
    saludo: "Aquí mueves mercancía entre sucursales.",
    preguntas: [
      {
        id: "t-como",
        pregunta: "¿Cómo hago un traspaso?",
        respuesta: ["Elige sucursal de origen y destino, busca los productos y la cantidad. La existencia sale de una y entra a la otra al instante, con kardex en ambas."],
      },
      {
        id: "t-sucursal",
        pregunta: "No veo otras sucursales",
        respuesta: ["Las sucursales se dan de alta en Configuración → Negocio. Con una sola sucursal no hay a dónde traspasar."],
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
          "Cada pedido recibido a crédito genera una cuenta por pagar con vencimiento, y la campana te avisa antes.",
        ],
        ir: { etiqueta: "Ver pedidos", href: "/pedidos" },
      },
      {
        id: "p-abono",
        pregunta: "¿Cómo registro un pago al proveedor?",
        respuesta: ["Abre el proveedor → Abonos: el pago se aplica primero a lo más antiguo y el saldo se actualiza."],
      },
    ],
  },
  {
    ruta: "/pedidos",
    titulo: "Pedidos",
    saludo: "Aquí pides mercancía y la recibes en inventario.",
    preguntas: [
      {
        id: "o-crear",
        pregunta: "¿Cómo armo un pedido?",
        respuesta: [
          "Elige el proveedor y busca los productos. El precio se propone con tu último costo y en la unidad de compra (paquete, caja).",
          "Elige si es de contado o a crédito.",
        ],
      },
      {
        id: "o-recibir",
        pregunta: "¿Cómo recibo un pedido?",
        respuesta: [
          "Usa «Recibido» (o «Recibir parcial» si llegó incompleto): la existencia sube y el costo promedio se actualiza.",
          "Si el producto maneja lotes, te pedirá lote y caducidad.",
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
        id: "cl-datos",
        pregunta: "¿Por qué aparecen datos ocultos?",
        respuesta: ["Teléfono, correo y RFC se muestran enmascarados para proteger su privacidad. Toca el ojo para verlos un momento."],
      },
      {
        id: "cl-factura",
        pregunta: "¿Qué necesito para facturarle?",
        respuesta: ["RFC, nombre o razón social exacta, régimen fiscal, C.P. fiscal y uso de CFDI. La ficha del cliente te dice qué falta."],
      },
      {
        id: "cl-puntos",
        pregunta: "¿Cómo funcionan los puntos?",
        respuesta: ["Cada compra con cliente registrado suma puntos según la tasa de Configuración; luego puede pagar con ellos («Puntos Monedero»)."],
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
          "El sistema no timbra: arma un paquete con tus datos, los del cliente y los conceptos de la venta.",
          "Copia cada dato al portal del SAT, timbra allá y regresa a registrar el folio fiscal.",
        ],
      },
      {
        id: "f-emisor",
        pregunta: "¿Dónde cambio mis datos fiscales?",
        respuesta: ["En Configuración → Financiero. Facturación solo los muestra y te dice si falta algo."],
        ir: { etiqueta: "Ir a Configuración", href: "/configuracion?tab=negocio&seccion=financiero" },
      },
    ],
  },
  {
    ruta: "/reportes",
    titulo: "Reportes",
    saludo: "Aquí ves cómo va tu negocio y descargas reportes en Excel.",
    preguntas: [
      {
        id: "r-abc",
        pregunta: "¿Qué es el análisis ABC?",
        respuesta: [
          "Ordena tus productos de más a menos vendido. Los de clase A son los pocos que juntos hacen el 80% de tu venta: son los que nunca deben faltar.",
        ],
      },
      {
        id: "r-utilidad",
        pregunta: "¿Cómo sé cuánto gano?",
        respuesta: [
          "Mira «Margen por categoría» en el análisis, o descarga «Margen por Producto»: compara el precio de venta contra el costo de cada producto.",
        ],
      },
      {
        id: "r-cobertura",
        pregunta: "¿Qué significa «días de inventario»?",
        respuesta: ["Cuántos días te alcanza la existencia al ritmo de venta actual. Menos de 7 días: pide ya. Más de 90: tienes dinero detenido en el estante."],
      },
    ],
  },
  {
    ruta: "/bitacora",
    titulo: "Bitácora",
    saludo: "Aquí queda registrado quién hizo qué y cuándo.",
    preguntas: [
      {
        id: "b-que",
        pregunta: "¿Qué se registra?",
        respuesta: ["Ventas, cortes, retiros, aperturas del cajón, cambios de precios, usuarios, devoluciones y configuración. Nadie puede editar la bitácora."],
      },
      {
        id: "b-buscar",
        pregunta: "¿Cómo encuentro algo?",
        respuesta: ["Filtra por fechas, usuario o módulo. También puedes exportarla a Excel."],
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
        id: "s-roles",
        pregunta: "¿Qué puede hacer cada tipo de usuario?",
        respuesta: [
          "Dueño(a): todo, y es la única persona que maneja administradores. Administrador(a): todo menos otros administradores.",
          "Encargado(a): inventario, compras y reportes. Cajero(a): cobro y caja. Puedes ajustar permisos con perfiles.",
        ],
      },
      {
        id: "s-usuarios",
        pregunta: "¿Cómo creo a mi cajera?",
        respuesta: ["En Usuarios, agrega uno nuevo con rol Cajero(a) y una contraseña. Cada quien entra con su usuario: así sabes quién cobró."],
      },
      {
        id: "s-ejemplo",
        pregunta: "¿Qué es el catálogo de ejemplo?",
        respuesta: ["Productos típicos de tu giro con códigos EJ- para practicar. Puedes editarlos o quitarlos; cargarlo dos veces no los duplica."],
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
