import { PrismaClient, Rol } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Create admin user
  const adminPassword = await hash("admin123", 12);
  await prisma.usuario.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      nombre: "Administradora",
      username: "admin",
      passwordHash: adminPassword,
      rol: Rol.ADMINISTRADORA,
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

  // Sample products
  const sampleProducts = [
    {
      codigoItem: "001",
      descripcion: "Cuaderno Profesor 96hoj",
      precioUnitario: 45.0,
      stockActual: 50,
      stockMinimo: 10,
      ubicacionEstante: "Estante A-1",
    },
    {
      codigoItem: "002",
      descripcion: "Lápiz Hexagonal #2",
      precioUnitario: 8.5,
      stockActual: 200,
      stockMinimo: 50,
      ubicacionEstante: "Estante A-2",
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
