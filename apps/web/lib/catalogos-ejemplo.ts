import type { TipoNegocio } from "./business-types";
import type { EscalaPrecio } from "./precios";

// ============================================================
// Catálogos de ejemplo por giro (Fase C). Opcionales: sirven para probar
// el sistema con productos que tengan sentido para cada negocio (una
// ferretería no arranca vendiendo lápices). Los códigos empiezan con
// "EJ-" para reconocerlos y borrarlos cuando se capture el catálogo real.
// ============================================================

export interface ProductoEjemplo {
  codigo: string;
  descripcion: string;
  precio: number;
  costo: number;
  stock: number;
  minimo: number;
  categoria: string;
  esServicio?: boolean;
  permiteDecimales?: boolean;
  usaLotes?: boolean;
  /** Días hasta la caducidad del lote de ejemplo (si usa lotes). */
  caducidadDias?: number;
  escalas?: EscalaPrecio[];
  exentoIva?: boolean;
  atributos?: Record<string, string>;
}

export interface CatalogoEjemplo {
  categorias: Array<{ nombre: string; color: string }>;
  productos: ProductoEjemplo[];
}

const C = {
  verde: "#10b981",
  azul: "#0ea5e9",
  indigo: "#6366f1",
  ambar: "#f59e0b",
  rojo: "#ef4444",
  rosa: "#ec4899",
  teal: "#14b8a6",
  lima: "#84cc16",
};

export const CATALOGOS_EJEMPLO: Record<TipoNegocio, CatalogoEjemplo> = {
  PAPELERIA_RETAIL: {
    categorias: [
      { nombre: "Escolar", color: C.verde },
      { nombre: "Oficina", color: C.azul },
      { nombre: "Arte y manualidades", color: C.rosa },
      { nombre: "Copias e impresiones", color: C.ambar },
    ],
    productos: [
      { codigo: "EJ-CUAD-100", descripcion: "Cuaderno profesional raya 100 hojas", precio: 45, costo: 28, stock: 60, minimo: 10, categoria: "Escolar", escalas: [{ desde: 12, precio: 40, nombre: "Docena" }], atributos: { linea: "Escolar", presentacion: "Pieza" } },
      { codigo: "EJ-LAP-HB", descripcion: "Lápiz HB #2", precio: 6, costo: 2.5, stock: 300, minimo: 50, categoria: "Escolar", escalas: [{ desde: 12, precio: 5, nombre: "Docena" }, { desde: 144, precio: 4, nombre: "Gruesa" }] },
      { codigo: "EJ-PLU-AZ", descripcion: "Pluma bolígrafo azul punto medio", precio: 8, costo: 3.5, stock: 200, minimo: 40, categoria: "Escolar", escalas: [{ desde: 12, precio: 7, nombre: "Docena" }] },
      { codigo: "EJ-GOMA", descripcion: "Goma blanca para lápiz", precio: 7, costo: 3, stock: 120, minimo: 20, categoria: "Escolar" },
      { codigo: "EJ-RESMA", descripcion: "Resma papel bond carta 500 hojas", precio: 115, costo: 82, stock: 25, minimo: 5, categoria: "Oficina", atributos: { linea: "Oficina", presentacion: "Resma" } },
      { codigo: "EJ-FOLDER", descripcion: "Folder tamaño carta crema", precio: 4, costo: 1.8, stock: 400, minimo: 50, categoria: "Oficina", escalas: [{ desde: 25, precio: 3.5 }, { desde: 100, precio: 3, nombre: "Paquete" }] },
      { codigo: "EJ-GRAPAS", descripcion: "Caja de grapas estándar 5000", precio: 38, costo: 22, stock: 30, minimo: 5, categoria: "Oficina" },
      { codigo: "EJ-PEGA", descripcion: "Pegamento en barra 40 g", precio: 32, costo: 18, stock: 50, minimo: 10, categoria: "Arte y manualidades" },
      { codigo: "EJ-FOAMY", descripcion: "Hoja de foamy carta colores", precio: 6, costo: 2.8, stock: 150, minimo: 30, categoria: "Arte y manualidades" },
      { codigo: "EJ-COPIA-BN", descripcion: "Copia blanco y negro carta", precio: 1.5, costo: 0.4, stock: 0, minimo: 0, categoria: "Copias e impresiones", esServicio: true, escalas: [{ desde: 50, precio: 1, nombre: "Mayoreo" }] },
      { codigo: "EJ-IMP-COLOR", descripcion: "Impresión a color carta", precio: 8, costo: 2.5, stock: 0, minimo: 0, categoria: "Copias e impresiones", esServicio: true },
    ],
  },
  ABARROTES: {
    categorias: [
      { nombre: "Abarrotes", color: C.ambar },
      { nombre: "Lácteos", color: C.azul },
      { nombre: "Bebidas", color: C.rojo },
      { nombre: "Limpieza", color: C.teal },
      { nombre: "Granel", color: C.lima },
    ],
    productos: [
      { codigo: "EJ-ARROZ", descripcion: "Arroz súper extra 1 kg", precio: 32, costo: 23, stock: 40, minimo: 10, categoria: "Abarrotes", exentoIva: true },
      { codigo: "EJ-FRIJOL", descripcion: "Frijol negro 1 kg", precio: 38, costo: 27, stock: 40, minimo: 10, categoria: "Abarrotes", exentoIva: true },
      { codigo: "EJ-ACEITE", descripcion: "Aceite vegetal 1 L", precio: 45, costo: 33, stock: 30, minimo: 8, categoria: "Abarrotes", exentoIva: true },
      { codigo: "EJ-LECHE", descripcion: "Leche entera 1 L", precio: 28, costo: 22, stock: 48, minimo: 12, categoria: "Lácteos", usaLotes: true, caducidadDias: 12, exentoIva: true },
      { codigo: "EJ-YOGUR", descripcion: "Yogur bebible fresa 250 ml", precio: 15, costo: 10, stock: 36, minimo: 12, categoria: "Lácteos", usaLotes: true, caducidadDias: 20, exentoIva: true },
      { codigo: "EJ-REFRESCO", descripcion: "Refresco de cola 600 ml", precio: 20, costo: 14, stock: 72, minimo: 24, categoria: "Bebidas", escalas: [{ desde: 24, precio: 18, nombre: "Caja" }] },
      { codigo: "EJ-AGUA", descripcion: "Agua natural 1 L", precio: 13, costo: 8, stock: 60, minimo: 20, categoria: "Bebidas", escalas: [{ desde: 12, precio: 11, nombre: "Paquete" }] },
      { codigo: "EJ-JABON", descripcion: "Jabón en polvo 1 kg", precio: 42, costo: 30, stock: 20, minimo: 5, categoria: "Limpieza" },
      { codigo: "EJ-CLORO", descripcion: "Cloro 950 ml", precio: 22, costo: 14, stock: 24, minimo: 6, categoria: "Limpieza" },
      { codigo: "EJ-AZUCAR-KG", descripcion: "Azúcar estándar a granel (kg)", precio: 30, costo: 22, stock: 50, minimo: 10, categoria: "Granel", permiteDecimales: true, exentoIva: true },
      { codigo: "EJ-HUEVO-KG", descripcion: "Huevo blanco (kg)", precio: 48, costo: 38, stock: 30, minimo: 8, categoria: "Granel", permiteDecimales: true, exentoIva: true },
    ],
  },
  FARMACIA: {
    categorias: [
      { nombre: "Analgésicos", color: C.azul },
      { nombre: "Antigripales", color: C.indigo },
      { nombre: "Curación", color: C.rojo },
      { nombre: "Cuidado personal", color: C.rosa },
      { nombre: "Vitaminas", color: C.lima },
    ],
    productos: [
      { codigo: "EJ-PARACET", descripcion: "Paracetamol 500 mg 20 tabletas", precio: 35, costo: 18, stock: 40, minimo: 10, categoria: "Analgésicos", usaLotes: true, caducidadDias: 420, exentoIva: true, atributos: { sustancia: "Paracetamol", laboratorio: "Genérico", presentacion: "Tabletas", receta: "No" } },
      { codigo: "EJ-IBUPRO", descripcion: "Ibuprofeno 400 mg 10 tabletas", precio: 42, costo: 22, stock: 30, minimo: 8, categoria: "Analgésicos", usaLotes: true, caducidadDias: 360, exentoIva: true, atributos: { sustancia: "Ibuprofeno", presentacion: "Tabletas", receta: "No" } },
      { codigo: "EJ-AMOXI", descripcion: "Amoxicilina 500 mg 12 cápsulas", precio: 95, costo: 55, stock: 20, minimo: 5, categoria: "Analgésicos", usaLotes: true, caducidadDias: 25, exentoIva: true, atributos: { sustancia: "Amoxicilina", presentacion: "Cápsulas", receta: "Sí" } },
      { codigo: "EJ-ANTIGRIP", descripcion: "Antigripal 12 cápsulas", precio: 68, costo: 40, stock: 25, minimo: 6, categoria: "Antigripales", usaLotes: true, caducidadDias: 300, exentoIva: true },
      { codigo: "EJ-JARABE", descripcion: "Jarabe para la tos 120 ml", precio: 89, costo: 52, stock: 15, minimo: 4, categoria: "Antigripales", usaLotes: true, caducidadDias: 200, exentoIva: true },
      { codigo: "EJ-GASAS", descripcion: "Gasas estériles 10 piezas", precio: 28, costo: 14, stock: 30, minimo: 6, categoria: "Curación" },
      { codigo: "EJ-ALCOHOL", descripcion: "Alcohol etílico 250 ml", precio: 35, costo: 20, stock: 25, minimo: 6, categoria: "Curación" },
      { codigo: "EJ-CURITAS", descripcion: "Vendas adhesivas caja 20", precio: 32, costo: 17, stock: 30, minimo: 8, categoria: "Curación" },
      { codigo: "EJ-PASTA", descripcion: "Pasta dental 100 ml", precio: 38, costo: 24, stock: 24, minimo: 6, categoria: "Cuidado personal" },
      { codigo: "EJ-VITC", descripcion: "Vitamina C 1 g 10 tabletas efervescentes", precio: 75, costo: 42, stock: 18, minimo: 5, categoria: "Vitaminas", usaLotes: true, caducidadDias: 500 },
      { codigo: "EJ-TOMA-PRESION", descripcion: "Toma de presión arterial", precio: 30, costo: 0, stock: 0, minimo: 0, categoria: "Cuidado personal", esServicio: true, exentoIva: true },
    ],
  },
  FERRETERIA: {
    categorias: [
      { nombre: "Herramienta", color: C.ambar },
      { nombre: "Tornillería", color: C.indigo },
      { nombre: "Eléctrico", color: C.azul },
      { nombre: "Plomería", color: C.teal },
      { nombre: "Pintura", color: C.rosa },
    ],
    productos: [
      { codigo: "EJ-MARTILLO", descripcion: "Martillo uña 16 oz mango fibra", precio: 185, costo: 115, stock: 12, minimo: 3, categoria: "Herramienta", atributos: { marca: "Genérica", material: "Acero" } },
      { codigo: "EJ-DESARM", descripcion: "Juego de desarmadores 6 piezas", precio: 165, costo: 98, stock: 10, minimo: 3, categoria: "Herramienta" },
      { codigo: "EJ-FLEXO", descripcion: "Flexómetro 5 m", precio: 95, costo: 55, stock: 15, minimo: 4, categoria: "Herramienta", atributos: { medida: "5 m" } },
      { codigo: "EJ-TORN-1", descripcion: "Tornillo para madera 1\" (pieza)", precio: 1, costo: 0.35, stock: 2000, minimo: 300, categoria: "Tornillería", escalas: [{ desde: 100, precio: 0.7, nombre: "Ciento" }], atributos: { medida: "1 pulgada" } },
      { codigo: "EJ-TAQUETE", descripcion: "Taquete plástico 1/4 (pieza)", precio: 1, costo: 0.3, stock: 1500, minimo: 200, categoria: "Tornillería", escalas: [{ desde: 100, precio: 0.6, nombre: "Ciento" }] },
      { codigo: "EJ-CABLE-12", descripcion: "Cable calibre 12 (metro)", precio: 18, costo: 11, stock: 300, minimo: 50, categoria: "Eléctrico", permiteDecimales: true, escalas: [{ desde: 100, precio: 15, nombre: "Rollo" }], atributos: { medida: "Calibre 12" } },
      { codigo: "EJ-FOCO-LED", descripcion: "Foco LED 9 W luz blanca", precio: 45, costo: 26, stock: 40, minimo: 10, categoria: "Eléctrico", escalas: [{ desde: 10, precio: 40 }] },
      { codigo: "EJ-CONTACTO", descripcion: "Contacto doble polarizado", precio: 38, costo: 21, stock: 25, minimo: 6, categoria: "Eléctrico" },
      { codigo: "EJ-TUBO-PVC", descripcion: "Tubo PVC hidráulico 1/2\" (metro)", precio: 22, costo: 13, stock: 120, minimo: 20, categoria: "Plomería", permiteDecimales: true },
      { codigo: "EJ-CINTA-TEF", descripcion: "Cinta teflón 1/2\"", precio: 12, costo: 5, stock: 60, minimo: 15, categoria: "Plomería" },
      { codigo: "EJ-PINTURA", descripcion: "Pintura vinílica blanca 4 L", precio: 420, costo: 290, stock: 8, minimo: 2, categoria: "Pintura" },
      { codigo: "EJ-BROCHA", descripcion: "Brocha 3\"", precio: 48, costo: 27, stock: 20, minimo: 5, categoria: "Pintura" },
    ],
  },
  BOUTIQUE: {
    categorias: [
      { nombre: "Blusas", color: C.rosa },
      { nombre: "Pantalones", color: C.indigo },
      { nombre: "Vestidos", color: C.rojo },
      { nombre: "Accesorios", color: C.ambar },
    ],
    productos: [
      { codigo: "EJ-BLUSA-CH", descripcion: "Blusa manga corta lisa CH", precio: 289, costo: 150, stock: 6, minimo: 2, categoria: "Blusas", atributos: { marca: "Casa", temporada: "Primavera-Verano", material: "Algodón" } },
      { codigo: "EJ-BLUSA-M", descripcion: "Blusa manga corta lisa M", precio: 289, costo: 150, stock: 8, minimo: 2, categoria: "Blusas", atributos: { marca: "Casa", temporada: "Primavera-Verano", material: "Algodón" } },
      { codigo: "EJ-BLUSA-G", descripcion: "Blusa manga corta lisa G", precio: 289, costo: 150, stock: 5, minimo: 2, categoria: "Blusas", atributos: { marca: "Casa", temporada: "Primavera-Verano", material: "Algodón" } },
      { codigo: "EJ-JEAN-28", descripcion: "Pantalón mezclilla corte recto 28", precio: 549, costo: 300, stock: 4, minimo: 1, categoria: "Pantalones" },
      { codigo: "EJ-JEAN-30", descripcion: "Pantalón mezclilla corte recto 30", precio: 549, costo: 300, stock: 5, minimo: 1, categoria: "Pantalones" },
      { codigo: "EJ-JEAN-32", descripcion: "Pantalón mezclilla corte recto 32", precio: 549, costo: 300, stock: 3, minimo: 1, categoria: "Pantalones" },
      { codigo: "EJ-VESTIDO", descripcion: "Vestido casual estampado", precio: 699, costo: 360, stock: 6, minimo: 2, categoria: "Vestidos", atributos: { temporada: "Primavera-Verano" } },
      { codigo: "EJ-BOLSA", descripcion: "Bolsa de mano sintética", precio: 459, costo: 230, stock: 5, minimo: 1, categoria: "Accesorios" },
      { codigo: "EJ-ARETES", descripcion: "Aretes de fantasía", precio: 129, costo: 45, stock: 20, minimo: 5, categoria: "Accesorios" },
      { codigo: "EJ-AJUSTE", descripcion: "Ajuste de bastilla", precio: 80, costo: 0, stock: 0, minimo: 0, categoria: "Pantalones", esServicio: true },
    ],
  },
  SERVICIOS: {
    categorias: [
      { nombre: "Servicios", color: C.indigo },
      { nombre: "Paquetes", color: C.teal },
      { nombre: "Productos de reventa", color: C.ambar },
    ],
    productos: [
      { codigo: "EJ-SERV-BASICO", descripcion: "Servicio básico (1 hora)", precio: 350, costo: 0, stock: 0, minimo: 0, categoria: "Servicios", esServicio: true, atributos: { duracion: "60" } },
      { codigo: "EJ-SERV-EXPRESS", descripcion: "Servicio exprés (30 min)", precio: 200, costo: 0, stock: 0, minimo: 0, categoria: "Servicios", esServicio: true, atributos: { duracion: "30" } },
      { codigo: "EJ-SERV-DOMICILIO", descripcion: "Visita a domicilio", precio: 150, costo: 0, stock: 0, minimo: 0, categoria: "Servicios", esServicio: true },
      { codigo: "EJ-DIAGNOSTICO", descripcion: "Diagnóstico", precio: 250, costo: 0, stock: 0, minimo: 0, categoria: "Servicios", esServicio: true },
      { codigo: "EJ-PAQ-5", descripcion: "Paquete 5 sesiones", precio: 1500, costo: 0, stock: 0, minimo: 0, categoria: "Paquetes", esServicio: true },
      { codigo: "EJ-PAQ-10", descripcion: "Paquete 10 sesiones", precio: 2800, costo: 0, stock: 0, minimo: 0, categoria: "Paquetes", esServicio: true },
      { codigo: "EJ-PROD-REV-1", descripcion: "Producto de reventa A", precio: 180, costo: 110, stock: 10, minimo: 3, categoria: "Productos de reventa" },
      { codigo: "EJ-PROD-REV-2", descripcion: "Producto de reventa B", precio: 95, costo: 55, stock: 15, minimo: 4, categoria: "Productos de reventa" },
    ],
  },
  MIXTO: {
    categorias: [
      { nombre: "Productos", color: C.verde },
      { nombre: "Servicios", color: C.indigo },
      { nombre: "Recargas y pagos", color: C.ambar },
    ],
    productos: [
      { codigo: "EJ-CUAD", descripcion: "Cuaderno profesional 100 hojas", precio: 45, costo: 28, stock: 40, minimo: 10, categoria: "Productos" },
      { codigo: "EJ-PLUMA", descripcion: "Pluma bolígrafo azul", precio: 8, costo: 3.5, stock: 150, minimo: 30, categoria: "Productos", escalas: [{ desde: 12, precio: 7, nombre: "Docena" }] },
      { codigo: "EJ-REFRESCO-M", descripcion: "Refresco 600 ml", precio: 20, costo: 14, stock: 48, minimo: 12, categoria: "Productos" },
      { codigo: "EJ-USB", descripcion: "Memoria USB 32 GB", precio: 129, costo: 80, stock: 12, minimo: 3, categoria: "Productos" },
      { codigo: "EJ-COPIA", descripcion: "Copia blanco y negro", precio: 1.5, costo: 0.4, stock: 0, minimo: 0, categoria: "Servicios", esServicio: true },
      { codigo: "EJ-ENGARGOL", descripcion: "Engargolado", precio: 35, costo: 10, stock: 0, minimo: 0, categoria: "Servicios", esServicio: true },
      { codigo: "EJ-ENMICADO", descripcion: "Enmicado tamaño credencial", precio: 15, costo: 4, stock: 0, minimo: 0, categoria: "Servicios", esServicio: true },
      { codigo: "EJ-CAPTURA", descripcion: "Captura y trámite en línea", precio: 60, costo: 0, stock: 0, minimo: 0, categoria: "Recargas y pagos", esServicio: true },
    ],
  },
};

/** Resumen para mostrar antes de cargar ("11 productos en 4 categorías"). */
export function resumenCatalogo(tipo: TipoNegocio): { productos: number; categorias: number; ejemplos: string[] } {
  const c = CATALOGOS_EJEMPLO[tipo];
  return {
    productos: c.productos.length,
    categorias: c.categorias.length,
    ejemplos: c.productos.slice(0, 3).map((p) => p.descripcion),
  };
}
