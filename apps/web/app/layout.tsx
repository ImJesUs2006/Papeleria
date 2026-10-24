import type { Metadata } from "next";
import "./globals.css";
import { BrandTheme } from "@/components/brand-theme";
import { RegistroServiceWorker } from "@/components/registro-sw";

export const metadata: Metadata = {
  title: "Papeleria SaaS - Sistema de Gestión",
  description: "Punto de venta e inventario para papelerías, abarrotes, farmacias, boutiques, ferreterías y servicios",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon-128.png", apple: "/icons/icon-256.png" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark" data-theme="neon">
      <body className="min-h-screen bg-app text-gray-200 antialiased">
        <BrandTheme />
        <RegistroServiceWorker />
        <div className="scanline-overlay opacity-30" />
        {children}
      </body>
    </html>
  );
}
