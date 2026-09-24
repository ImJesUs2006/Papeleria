import { PrismaClient, Rol } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Create admin user
  const adminPassword = await hash("admin123", 12);
  await prisma.usuario.upsert({
    where: { username: "admin" },
    update: { isRoot: true },
    create: {
      nombre: "Administradora",
      username: "admin",
      passwordHash: adminPassword,
      rol: Rol.ADMINISTRADORA,
      // Seguridad Root (Fase 3): solo esta cuenta puede reiniciar/restaurar.
      isRoot: true,
    },
  });

  // Create test cajera
  const cajeraPassword = await hash("cajera123", 12);
  await prisma.usuario.upsert({
    where: { username: "cajera1" },
    update: {},
    create: {
      nombre: "María (Cajera)",
      username: "cajera1",
      passwordHash: cajeraPassword,
      rol: Rol.CAJERA,
    },
  });

  // Sample products (favorito marca el catálogo táctil del POS)
  const sampleProducts = [
    {
      codigoItem: "001",
      descripcion: "Cuaderno Profesor 96hoj",
      precioUnitario: 45.0,
      stockActual: 50,
      stockMinimo: 10,
      ubicacionEstante: "Estante A-1",
      favorito: true,
    },
    {
      codigoItem: "002",
      descripcion: "Lápiz Hexagonal #2",
      precioUnitario: 8.5,
      stockActual: 200,
      stockMinimo: 50,
      ubicacionEstante: "Estante A-2",
      favorito: true,
    },
    {
      codigoItem: "003",
      descripcion: "Borrador Blanco",
      precioUnitario: 12.0,
      stockActual: 80,
      stockMinimo: 20,
      ubicacionEstante: "Estante A-2",
    },
    {
      codigoItem: "004",
      descripcion: "Pluma Azul Bic",
      precioUnitario: 15.0,
      stockActual: 150,
      stockMinimo: 30,
      ubicacionEstante: "Estante B-1",
      favorito: true,
    },
    {
      codigoItem: "005",
      descripcion: "Marcatextos Amarillo",
      precioUnitario: 22.0,
      stockActual: 35,
      stockMinimo: 10,
      ubicacionEstante: "Estante B-2",
    },
    {
      codigoItem: "006",
      descripcion: "Hojas Blancas 500p",
      precioUnitario: 65.0,
      stockActual: 25,
      stockMinimo: 5,
      ubicacionEstante: "Estante C-1",
    },
    {
      codigoItem: "007",
      descripcion: "Carpeta Grande Color",
      precioUnitario: 18.0,
      stockActual: 100,
      stockMinimo: 20,
      ubicacionEstante: "Estante C-2",
    },
    {
      codigoItem: "008",
      descripcion: "Tijera Escolar",
      precioUnitario: 28.0,
      stockActual: 40,
      stockMinimo: 8,
      ubicacionEstante: "Estante D-1",
    },
    {
      codigoItem: "009",
      descripcion: "Pegamento en Barra",
      precioUnitario: 20.0,
      stockActual: 60,
      stockMinimo: 15,
      ubicacionEstante: "Estante D-1",
    },
    {
      codigoItem: "010",
      descripcion: "Regla 30cm",
      precioUnitario: 14.0,
      stockActual: 45,
      stockMinimo: 10,
      ubicacionEstante: "Estante D-2",
    },
    {
      codigoItem: "011",
      descripcion: "Colores Básicos 12p",
      precioUnitario: 48.0,
      stockActual: 30,
      stockMinimo: 8,
      ubicacionEstante: "Estante D-2",
    },
    {
      codigoItem: "012",
      descripcion: "Sacapuntas Metálico",
      precioUnitario: 12.5,
      stockActual: 70,
      stockMinimo: 15,
      ubicacionEstante: "Estante A-2",
    },
    {
      codigoItem: "013",
      descripcion: "Pegamento Blanco 250ml",
      precioUnitario: 32.0,
      stockActual: 22,
      stockMinimo: 6,
      ubicacionEstante: "Estante A-3",
    },
    {
      codigoItem: "014",
      descripcion: "Cinta Adhesiva Transparente",
      precioUnitario: 16.0,
      stockActual: 90,
      stockMinimo: 20,
      ubicacionEstante: "Estante B-2",
    },
    {
      codigoItem: "015",
      descripcion: "Pluma Tinta Negra",
      precioUnitario: 12.0,
      stockActual: 130,
      stockMinimo: 30,
      ubicacionEstante: "Estante B-1",
    },
    {
      codigoItem: "016",
      descripcion: "Resistol 100ml",
      precioUnitario: 25.0,
      stockActual: 40,
      stockMinimo: 10,
      ubicacionEstante: "Estante A-3",
    },
    {
      codigoItem: "017",
      descripcion: "Cuaderno Espiral 100hoj",
      precioUnitario: 58.0,
      stockActual: 28,
      stockMinimo: 8,
      ubicacionEstante: "Estante A-1",
    },
    {
      codigoItem: "018",
      descripcion: "Folders Oficio",
      precioUnitario: 6.0,
      stockActual: 500,
      stockMinimo: 100,
      ubicacionEstante: "Estante C-2",
    },
    {
      codigoItem: "019",
      descripcion: "Engrapadora N.10",
      precioUnitario: 95.0,
      stockActual: 15,
      stockMinimo: 4,
      ubicacionEstante: "Estante E-1",
    },
    {
      codigoItem: "020",
      descripcion: "Notas Adhesivas 3x3",
      precioUnitario: 21.0,
      stockActual: 64,
      stockMinimo: 12,
      ubicacionEstante: "Estante B-3",
    },
    {
      codigoItem: "021",
      descripcion: "Marcadores Permanentes",
      precioUnitario: 27.0,
      stockActual: 48,
      stockMinimo: 10,
      ubicacionEstante: "Estante B-2",
    },
    {
      codigoItem: "022",
      descripcion: "Foamy Mezcla 20p",
      precioUnitario: 42.0,
      stockActual: 33,
      stockMinimo: 8,
      ubicacionEstante: "Estante F-1",
    },
  ];

  for (const product of sampleProducts) {
    await prisma.producto.upsert({
      where: { codigoItem: product.codigoItem },
      update: {},
      create: product,
    });
  }

  console.log("✅ Seed completed!");
  console.log("   - Admin user: admin / admin123");
  console.log("   - Cajera user: cajera1 / cajera123");
  console.log(`   - ${sampleProducts.length} sample products`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
