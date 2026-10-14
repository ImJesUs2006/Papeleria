-- AlterTable
ALTER TABLE "configuracion_negocio" ADD COLUMN     "personalizacion" JSONB;

-- AlterTable
ALTER TABLE "productos" ADD COLUMN     "atributos" JSONB;

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "idPerfil" TEXT;

-- CreateTable
CREATE TABLE "perfiles" (
    "idPerfil" TEXT NOT NULL,
    "idNegocio" TEXT NOT NULL DEFAULT 'default',
    "nombre" TEXT NOT NULL,
    "rolBase" "Rol" NOT NULL DEFAULT 'CAJERA',
    "permisoCobrar" BOOLEAN NOT NULL DEFAULT true,
    "permisoInventario" BOOLEAN NOT NULL DEFAULT false,
    "permisoReportes" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "perfiles_pkey" PRIMARY KEY ("idPerfil")
);

-- CreateIndex
CREATE INDEX "perfiles_idNegocio_idx" ON "perfiles"("idNegocio");

-- CreateIndex
CREATE UNIQUE INDEX "perfiles_idNegocio_nombre_key" ON "perfiles"("idNegocio", "nombre");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_idPerfil_fkey" FOREIGN KEY ("idPerfil") REFERENCES "perfiles"("idPerfil") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfiles" ADD CONSTRAINT "perfiles_idNegocio_fkey" FOREIGN KEY ("idNegocio") REFERENCES "negocios"("idNegocio") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Permisos de módulo efectivos (Paso 4): hasta ahora inventario y reportes
-- eran solo de ADMINISTRADORA aunque las cajeras tuvieran la casilla en
-- true (valor por defecto). Para conservar EXACTAMENTE el acceso actual,
-- las cajeras existentes quedan sin esos dos permisos; la administradora
-- puede concederlos después, ahora con efecto real.
UPDATE "usuarios" SET "permisoInventario" = false, "permisoReportes" = false WHERE "rol" = 'CAJERA';
