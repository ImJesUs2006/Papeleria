-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMINISTRADORA', 'CAJERA');

-- CreateEnum
CREATE TYPE "EstadoVenta" AS ENUM ('ACTIVA', 'COMPLETADA', 'CANCELADA', 'REEMBOLSADA');

-- CreateEnum
CREATE TYPE "TipoImpresion" AS ENUM ('BLANCO_NEGRO', 'COLOR', 'PLOTTER');

-- CreateEnum
CREATE TYPE "TipoNegocio" AS ENUM ('PAPELERIA_RETAIL', 'ABARROTES', 'SERVICIOS', 'MIXTO', 'FERRETERIA', 'FARMACIA', 'BOUTIQUE');

-- CreateEnum
CREATE TYPE "EstadoApartado" AS ENUM ('PENDIENTE', 'LIQUIDADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "EstadoSesionCaja" AS ENUM ('ABIERTA', 'EN_CIERRE', 'CERRADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "ModuloSistema" AS ENUM ('PUNTO_VENTA', 'INVENTARIO', 'CAJA', 'REPORTES', 'CONFIGURACION', 'BITACORA', 'CARGA_MASIVA', 'SYNC', 'SETUP', 'SEGURIDAD');

-- CreateEnum
CREATE TYPE "TipoDevolucion" AS ENUM ('DEVOLUCION', 'NOTA_CREDITO');

-- CreateEnum
CREATE TYPE "TipoMovimientoKardex" AS ENUM ('ENTRADA', 'SALIDA', 'AJUSTE');

-- CreateEnum
CREATE TYPE "EstadoFactura" AS ENUM ('EMITIDA', 'CANCELADA');

-- CreateTable
CREATE TABLE "usuarios" (
    "idPersona" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "rol" "Rol" NOT NULL DEFAULT 'CAJERA',
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "isRoot" BOOLEAN NOT NULL DEFAULT false,
    "permisoCobrar" BOOLEAN NOT NULL DEFAULT true,
    "permisoInventario" BOOLEAN NOT NULL DEFAULT true,
    "permisoReportes" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ultimoLoginAt" TIMESTAMP(3),
    "passwordCambiadaEn" TIMESTAMP(3),

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("idPersona")
);

-- CreateTable
CREATE TABLE "productos" (
    "codigoItem" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "precioUnitario" DECIMAL(10,2) NOT NULL,
    "precioCompra" DECIMAL(10,2),
    "precioMayoreo" DECIMAL(10,2),
    "imagenUrl" TEXT,
    "stockActual" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "stockMinimo" DECIMAL(10,3) NOT NULL DEFAULT 5,
    "permiteDecimales" BOOLEAN NOT NULL DEFAULT false,
    "esServicio" BOOLEAN NOT NULL DEFAULT false,
    "idCategoria" TEXT,
    "ubicacionEstante" TEXT,
    "fechaCaducidad" TIMESTAMP(3),
    "tipoImpresion" "TipoImpresion",
    "proveedor" TEXT,
    "codigoBarras" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "favorito" BOOLEAN NOT NULL DEFAULT false,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "productos_pkey" PRIMARY KEY ("codigoItem")
);

-- CreateTable
CREATE TABLE "categorias" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "idNegocio" TEXT NOT NULL DEFAULT 'default',

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedores" (
    "idProveedor" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "email" TEXT,
    "direccion" TEXT,
    "contacto" TEXT,
    "limiteCredito" DECIMAL(10,2),
    "saldoCredito" DECIMAL(10,2) DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proveedores_pkey" PRIMARY KEY ("idProveedor")
);

-- CreateTable
CREATE TABLE "pedidos_proveedor" (
    "idPedido" TEXT NOT NULL,
    "idProveedor" TEXT NOT NULL,
    "fechaPedido" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEntrega" TIMESTAMP(3),
    "totalEstimado" DECIMAL(10,2) NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "notas" TEXT,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "pedidos_proveedor_pkey" PRIMARY KEY ("idPedido")
);

-- CreateTable
CREATE TABLE "items_pedido_proveedor" (
    "idItemPedido" TEXT NOT NULL,
    "idPedido" TEXT NOT NULL,
    "codigoItem" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precioCotizado" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "items_pedido_proveedor_pkey" PRIMARY KEY ("idItemPedido")
);

-- CreateTable
CREATE TABLE "ventas" (
    "folioVenta" TEXT NOT NULL,
    "fechaHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "iva" DECIMAL(10,2) NOT NULL,
    "totalNeto" DECIMAL(10,2) NOT NULL,
    "idUsuario" TEXT NOT NULL,
    "idCaja" TEXT,
    "idCliente" TEXT,
    "estado" "EstadoVenta" NOT NULL DEFAULT 'ACTIVA',
    "metodoPago" TEXT NOT NULL DEFAULT 'EFECTIVO',
    "referenciaTransferencia" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idLocal" TEXT,
    "origen" TEXT NOT NULL DEFAULT 'ONLINE',
    "dispositivoId" TEXT,
    "fechaHoraCliente" TIMESTAMP(3),

    CONSTRAINT "ventas_pkey" PRIMARY KEY ("folioVenta")
);

-- CreateTable
CREATE TABLE "lineas_detalle_venta" (
    "idLinea" TEXT NOT NULL,
    "folioVenta" TEXT NOT NULL,
    "codigoItem" TEXT NOT NULL,
    "cantidad" DECIMAL(10,3) NOT NULL,
    "precioMomento" DECIMAL(10,2) NOT NULL,
    "descuentoLinea" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "subtotalLinea" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "lineas_detalle_venta_pkey" PRIMARY KEY ("idLinea")
);

-- CreateTable
CREATE TABLE "sesiones_caja" (
    "idCaja" TEXT NOT NULL,
    "folioCaja" TEXT,
    "nombreCaja" TEXT,
    "idUsuario" TEXT NOT NULL,
    "fondoInicial" DECIMAL(10,2) NOT NULL,
    "totalVentasEfectivo" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalVentasDigital" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalRecargas" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalEgresos" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "horaApertura" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "horaCierre" TIMESTAMP(3),
    "estado" "EstadoSesionCaja" NOT NULL DEFAULT 'ABIERTA',
    "notasCierre" TEXT,
    "motivoAnulacion" TEXT,
    "cierreToken" TEXT,
    "cierreInicioEn" TIMESTAMP(3),
    "cierreIniciadoPor" TEXT,
    "efectivoContado" DECIMAL(10,2),
    "vouchersContado" DECIMAL(10,2),
    "recargasContado" DECIMAL(10,2),
    "faltanteTotal" DECIMAL(10,2),
    "descuadre" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "sesiones_caja_pkey" PRIMARY KEY ("idCaja")
);

-- CreateTable
CREATE TABLE "configuracion_negocio" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "nombreNegocio" TEXT NOT NULL DEFAULT 'Mi Negocio',
    "tipoNegocio" "TipoNegocio" NOT NULL DEFAULT 'PAPELERIA_RETAIL',
    "moneda" TEXT NOT NULL DEFAULT 'MXN',
    "ivaRate" DECIMAL(5,2) NOT NULL DEFAULT 16,
    "featureFlags" JSONB NOT NULL DEFAULT '{}',
    "metodosPago" JSONB NOT NULL DEFAULT '[]',
    "politicaStockOffline" TEXT NOT NULL DEFAULT 'PERMITIR_NEGATIVO',
    "logo" TEXT,
    "temaBase" TEXT NOT NULL DEFAULT 'NEON',
    "colorAcento" TEXT NOT NULL DEFAULT '#10b981',
    "mensajeTicket" TEXT,
    "anchoTicket" TEXT NOT NULL DEFAULT '80mm',
    "vistaDefectoPOS" TEXT NOT NULL DEFAULT 'ESCANER',
    "datosFiscales" JSONB,
    "datosBancarios" JSONB,
    "usarCaducidad" BOOLEAN NOT NULL DEFAULT false,
    "usarUbicaciones" BOOLEAN NOT NULL DEFAULT true,
    "requerirFondoInicial" BOOLEAN NOT NULL DEFAULT true,
    "puntosConfig" JSONB,
    "configVersion" INTEGER NOT NULL DEFAULT 1,
    "setupPendiente" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracion_negocio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "snapshots_seguridad" (
    "id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "datosJson" JSONB NOT NULL,
    "motivo" TEXT NOT NULL,
    "idUsuario" TEXT,

    CONSTRAINT "snapshots_seguridad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bitacora_logs" (
    "idLog" TEXT NOT NULL,
    "fechaHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idUsuario" TEXT,
    "accion" TEXT NOT NULL,
    "moduloSistema" "ModuloSistema" NOT NULL,
    "jsonPayload" JSONB,
    "detallesError" TEXT,
    "ipOrigen" TEXT,

    CONSTRAINT "bitacora_logs_pkey" PRIMARY KEY ("idLog")
);

-- CreateTable
CREATE TABLE "devoluciones" (
    "idDevolucion" TEXT NOT NULL,
    "folioDevolucion" TEXT NOT NULL,
    "folioVenta" TEXT NOT NULL,
    "fechaHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipo" "TipoDevolucion" NOT NULL DEFAULT 'DEVOLUCION',
    "motivo" TEXT,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "iva" DECIMAL(10,2) NOT NULL,
    "totalNeto" DECIMAL(10,2) NOT NULL,
    "metodoReembolso" TEXT NOT NULL DEFAULT 'EFECTIVO',
    "idUsuario" TEXT NOT NULL,
    "idCaja" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devoluciones_pkey" PRIMARY KEY ("idDevolucion")
);

-- CreateTable
CREATE TABLE "devolucion_lineas" (
    "idLineaDevolucion" TEXT NOT NULL,
    "idDevolucion" TEXT NOT NULL,
    "codigoItem" TEXT NOT NULL,
    "cantidad" DECIMAL(10,3) NOT NULL,
    "precioMomento" DECIMAL(10,2) NOT NULL,
    "subtotalLinea" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "devolucion_lineas_pkey" PRIMARY KEY ("idLineaDevolucion")
);

-- CreateTable
CREATE TABLE "pagos_proveedor" (
    "idPago" TEXT NOT NULL,
    "idProveedor" TEXT NOT NULL,
    "fechaHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "monto" DECIMAL(10,2) NOT NULL,
    "metodoPago" TEXT NOT NULL DEFAULT 'EFECTIVO',
    "referencia" TEXT,
    "notas" TEXT,
    "idUsuario" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagos_proveedor_pkey" PRIMARY KEY ("idPago")
);

-- CreateTable
CREATE TABLE "clientes" (
    "idCliente" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "saldoDeudor" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "puntosFidelidad" INTEGER NOT NULL DEFAULT 0,
    "rfc" TEXT,
    "razonSocial" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("idCliente")
);

-- CreateTable
CREATE TABLE "facturas" (
    "idFactura" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "fechaEmision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idCliente" TEXT NOT NULL,
    "folioVenta" TEXT NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "iva" DECIMAL(10,2) NOT NULL,
    "totalNeto" DECIMAL(10,2) NOT NULL,
    "metodoPago" TEXT NOT NULL,
    "usoCfdi" TEXT NOT NULL DEFAULT 'S01',
    "formaPago" TEXT NOT NULL DEFAULT 'PUE',
    "estado" "EstadoFactura" NOT NULL DEFAULT 'EMITIDA',
    "idUsuario" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facturas_pkey" PRIMARY KEY ("idFactura")
);

-- CreateTable
CREATE TABLE "apartados" (
    "idApartado" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "idCliente" TEXT NOT NULL,
    "idCaja" TEXT,
    "anticipo" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "estado" "EstadoApartado" NOT NULL DEFAULT 'PENDIENTE',
    "fechaCreado" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaLiquidacion" TIMESTAMP(3),
    "notas" TEXT,
    "idUsuario" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "apartados_pkey" PRIMARY KEY ("idApartado")
);

-- CreateTable
CREATE TABLE "apartado_lineas" (
    "idLineaApartado" TEXT NOT NULL,
    "idApartado" TEXT NOT NULL,
    "codigoItem" TEXT NOT NULL,
    "cantidad" DECIMAL(10,3) NOT NULL,
    "precioMomento" DECIMAL(10,2) NOT NULL,
    "descuentoLinea" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "subtotalLinea" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "apartado_lineas_pkey" PRIMARY KEY ("idLineaApartado")
);

-- CreateTable
CREATE TABLE "movimientos_kardex" (
    "idMovimiento" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "codigoItem" TEXT NOT NULL,
    "cantidadCambio" DECIMAL(10,3) NOT NULL,
    "tipo" "TipoMovimientoKardex" NOT NULL,
    "motivo" TEXT NOT NULL,
    "idUsuario" TEXT NOT NULL,

    CONSTRAINT "movimientos_kardex_pkey" PRIMARY KEY ("idMovimiento")
);

-- CreateTable
CREATE TABLE "retiros_efectivo" (
    "idRetiro" TEXT NOT NULL,
    "idCaja" TEXT NOT NULL,
    "idAdmin" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "motivo" TEXT,
    "fechaHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retiros_efectivo_pkey" PRIMARY KEY ("idRetiro")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_username_key" ON "usuarios"("username");

-- CreateIndex
CREATE UNIQUE INDEX "productos_codigoBarras_key" ON "productos"("codigoBarras");

-- CreateIndex
CREATE INDEX "productos_idCategoria_idx" ON "productos"("idCategoria");

-- CreateIndex
CREATE INDEX "categorias_idNegocio_idx" ON "categorias"("idNegocio");

-- CreateIndex
CREATE INDEX "pedidos_proveedor_idProveedor_idx" ON "pedidos_proveedor"("idProveedor");

-- CreateIndex
CREATE INDEX "items_pedido_proveedor_idPedido_idx" ON "items_pedido_proveedor"("idPedido");

-- CreateIndex
CREATE UNIQUE INDEX "ventas_idLocal_key" ON "ventas"("idLocal");

-- CreateIndex
CREATE INDEX "ventas_fechaHora_idx" ON "ventas"("fechaHora");

-- CreateIndex
CREATE INDEX "ventas_idCaja_idx" ON "ventas"("idCaja");

-- CreateIndex
CREATE INDEX "ventas_idCliente_idx" ON "ventas"("idCliente");

-- CreateIndex
CREATE INDEX "ventas_estado_fechaHora_idx" ON "ventas"("estado", "fechaHora");

-- CreateIndex
CREATE INDEX "lineas_detalle_venta_folioVenta_idx" ON "lineas_detalle_venta"("folioVenta");

-- CreateIndex
CREATE INDEX "lineas_detalle_venta_codigoItem_idx" ON "lineas_detalle_venta"("codigoItem");

-- CreateIndex
CREATE UNIQUE INDEX "sesiones_caja_folioCaja_key" ON "sesiones_caja"("folioCaja");

-- CreateIndex
CREATE INDEX "sesiones_caja_estado_idx" ON "sesiones_caja"("estado");

-- CreateIndex
CREATE INDEX "snapshots_seguridad_fecha_idx" ON "snapshots_seguridad"("fecha");

-- CreateIndex
CREATE INDEX "snapshots_seguridad_idUsuario_idx" ON "snapshots_seguridad"("idUsuario");

-- CreateIndex
CREATE INDEX "bitacora_logs_fechaHora_idx" ON "bitacora_logs"("fechaHora");

-- CreateIndex
CREATE INDEX "bitacora_logs_moduloSistema_idx" ON "bitacora_logs"("moduloSistema");

-- CreateIndex
CREATE INDEX "bitacora_logs_idUsuario_idx" ON "bitacora_logs"("idUsuario");

-- CreateIndex
CREATE UNIQUE INDEX "devoluciones_folioDevolucion_key" ON "devoluciones"("folioDevolucion");

-- CreateIndex
CREATE INDEX "devoluciones_folioVenta_idx" ON "devoluciones"("folioVenta");

-- CreateIndex
CREATE INDEX "devolucion_lineas_idDevolucion_idx" ON "devolucion_lineas"("idDevolucion");

-- CreateIndex
CREATE INDEX "pagos_proveedor_idProveedor_idx" ON "pagos_proveedor"("idProveedor");

-- CreateIndex
CREATE UNIQUE INDEX "facturas_folio_key" ON "facturas"("folio");

-- CreateIndex
CREATE UNIQUE INDEX "facturas_folioVenta_key" ON "facturas"("folioVenta");

-- CreateIndex
CREATE INDEX "facturas_idCliente_idx" ON "facturas"("idCliente");

-- CreateIndex
CREATE INDEX "facturas_fechaEmision_idx" ON "facturas"("fechaEmision");

-- CreateIndex
CREATE UNIQUE INDEX "apartados_folio_key" ON "apartados"("folio");

-- CreateIndex
CREATE INDEX "apartados_idCliente_idx" ON "apartados"("idCliente");

-- CreateIndex
CREATE INDEX "apartados_estado_idx" ON "apartados"("estado");

-- CreateIndex
CREATE INDEX "apartado_lineas_idApartado_idx" ON "apartado_lineas"("idApartado");

-- CreateIndex
CREATE INDEX "movimientos_kardex_codigoItem_fecha_idx" ON "movimientos_kardex"("codigoItem", "fecha");

-- CreateIndex
CREATE INDEX "movimientos_kardex_fecha_idx" ON "movimientos_kardex"("fecha");

-- CreateIndex
CREATE INDEX "retiros_efectivo_idCaja_idx" ON "retiros_efectivo"("idCaja");

-- CreateIndex
CREATE INDEX "retiros_efectivo_fechaHora_idx" ON "retiros_efectivo"("fechaHora");

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_idCategoria_fkey" FOREIGN KEY ("idCategoria") REFERENCES "categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_proveedor" ADD CONSTRAINT "pedidos_proveedor_idProveedor_fkey" FOREIGN KEY ("idProveedor") REFERENCES "proveedores"("idProveedor") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_proveedor" ADD CONSTRAINT "pedidos_proveedor_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "usuarios"("idPersona") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items_pedido_proveedor" ADD CONSTRAINT "items_pedido_proveedor_idPedido_fkey" FOREIGN KEY ("idPedido") REFERENCES "pedidos_proveedor"("idPedido") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items_pedido_proveedor" ADD CONSTRAINT "items_pedido_proveedor_codigoItem_fkey" FOREIGN KEY ("codigoItem") REFERENCES "productos"("codigoItem") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_idUsuario_fkey" FOREIGN KEY ("idUsuario") REFERENCES "usuarios"("idPersona") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_idCaja_fkey" FOREIGN KEY ("idCaja") REFERENCES "sesiones_caja"("idCaja") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_idCliente_fkey" FOREIGN KEY ("idCliente") REFERENCES "clientes"("idCliente") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineas_detalle_venta" ADD CONSTRAINT "lineas_detalle_venta_folioVenta_fkey" FOREIGN KEY ("folioVenta") REFERENCES "ventas"("folioVenta") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineas_detalle_venta" ADD CONSTRAINT "lineas_detalle_venta_codigoItem_fkey" FOREIGN KEY ("codigoItem") REFERENCES "productos"("codigoItem") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesiones_caja" ADD CONSTRAINT "sesiones_caja_idUsuario_fkey" FOREIGN KEY ("idUsuario") REFERENCES "usuarios"("idPersona") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesiones_caja" ADD CONSTRAINT "sesiones_caja_cierreIniciadoPor_fkey" FOREIGN KEY ("cierreIniciadoPor") REFERENCES "usuarios"("idPersona") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuracion_negocio" ADD CONSTRAINT "configuracion_negocio_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "usuarios"("idPersona") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snapshots_seguridad" ADD CONSTRAINT "snapshots_seguridad_idUsuario_fkey" FOREIGN KEY ("idUsuario") REFERENCES "usuarios"("idPersona") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitacora_logs" ADD CONSTRAINT "bitacora_logs_idUsuario_fkey" FOREIGN KEY ("idUsuario") REFERENCES "usuarios"("idPersona") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devoluciones" ADD CONSTRAINT "devoluciones_folioVenta_fkey" FOREIGN KEY ("folioVenta") REFERENCES "ventas"("folioVenta") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devoluciones" ADD CONSTRAINT "devoluciones_idUsuario_fkey" FOREIGN KEY ("idUsuario") REFERENCES "usuarios"("idPersona") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devoluciones" ADD CONSTRAINT "devoluciones_idCaja_fkey" FOREIGN KEY ("idCaja") REFERENCES "sesiones_caja"("idCaja") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devolucion_lineas" ADD CONSTRAINT "devolucion_lineas_idDevolucion_fkey" FOREIGN KEY ("idDevolucion") REFERENCES "devoluciones"("idDevolucion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devolucion_lineas" ADD CONSTRAINT "devolucion_lineas_codigoItem_fkey" FOREIGN KEY ("codigoItem") REFERENCES "productos"("codigoItem") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_proveedor" ADD CONSTRAINT "pagos_proveedor_idProveedor_fkey" FOREIGN KEY ("idProveedor") REFERENCES "proveedores"("idProveedor") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_proveedor" ADD CONSTRAINT "pagos_proveedor_idUsuario_fkey" FOREIGN KEY ("idUsuario") REFERENCES "usuarios"("idPersona") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_idCliente_fkey" FOREIGN KEY ("idCliente") REFERENCES "clientes"("idCliente") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_folioVenta_fkey" FOREIGN KEY ("folioVenta") REFERENCES "ventas"("folioVenta") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_idUsuario_fkey" FOREIGN KEY ("idUsuario") REFERENCES "usuarios"("idPersona") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apartados" ADD CONSTRAINT "apartados_idCliente_fkey" FOREIGN KEY ("idCliente") REFERENCES "clientes"("idCliente") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apartados" ADD CONSTRAINT "apartados_idCaja_fkey" FOREIGN KEY ("idCaja") REFERENCES "sesiones_caja"("idCaja") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apartados" ADD CONSTRAINT "apartados_idUsuario_fkey" FOREIGN KEY ("idUsuario") REFERENCES "usuarios"("idPersona") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apartado_lineas" ADD CONSTRAINT "apartado_lineas_idApartado_fkey" FOREIGN KEY ("idApartado") REFERENCES "apartados"("idApartado") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apartado_lineas" ADD CONSTRAINT "apartado_lineas_codigoItem_fkey" FOREIGN KEY ("codigoItem") REFERENCES "productos"("codigoItem") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_kardex" ADD CONSTRAINT "movimientos_kardex_codigoItem_fkey" FOREIGN KEY ("codigoItem") REFERENCES "productos"("codigoItem") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_kardex" ADD CONSTRAINT "movimientos_kardex_idUsuario_fkey" FOREIGN KEY ("idUsuario") REFERENCES "usuarios"("idPersona") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retiros_efectivo" ADD CONSTRAINT "retiros_efectivo_idCaja_fkey" FOREIGN KEY ("idCaja") REFERENCES "sesiones_caja"("idCaja") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retiros_efectivo" ADD CONSTRAINT "retiros_efectivo_idAdmin_fkey" FOREIGN KEY ("idAdmin") REFERENCES "usuarios"("idPersona") ON DELETE RESTRICT ON UPDATE CASCADE;

