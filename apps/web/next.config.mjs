/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@papeleria/database"],
  reactStrictMode: true,
  // Encabezados de seguridad básicos: nadie puede incrustar el sistema en
  // otra página (clickjacking), el navegador no adivina tipos de archivo y
  // no se filtran URLs internas a otros sitios.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
