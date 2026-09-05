import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Papeleria SaaS - Sistema de Gestión",
  description: "Sistema de gestión integral para papelerías",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark">
      <body className="min-h-screen bg-surface-900 text-gray-200 antialiased">
        <div className="scanline-overlay opacity-30" />
        {children}
      </body>
    </html>
  );
}
