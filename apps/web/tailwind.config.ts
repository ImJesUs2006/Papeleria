import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./store/**/*.{js,ts,jsx,tsx,mdx}",
    "./hooks/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Fondo general de la app (data-theme cambia --bg-app en globals.css).
        app: "var(--bg-app)",
        // Color de acento HEX elegido por el negocio (botones principales).
        acento: "var(--color-accento)",
        // Tinta fija para texto sobre fondos de acento (siempre oscura).
        "btn-ink": "#0a0a0a",
        surface: {
          // Escala semántica: sus valores CSS nativos cambian según
          // data-theme (neon | minimalista | brutalista | corporativo),
          // definidos como variables en globals.css. 900/950 se mantienen
          // fijos (scrims oscuros de modales y texto sobre acento).
          800: "rgb(var(--surface-800-rgb) / <alpha-value>)",
          700: "rgb(var(--surface-700-rgb) / <alpha-value>)",
          600: "rgb(var(--surface-600-rgb) / <alpha-value>)",
          500: "rgb(var(--surface-500-rgb) / <alpha-value>)",
          400: "rgb(var(--surface-400-rgb) / <alpha-value>)",
          900: "rgb(var(--surface-900-rgb) / <alpha-value>)",
          950: "rgb(var(--surface-950-rgb) / <alpha-value>)",
        },
        // Tinta global (text-gray-100/200/300): se oscurece en temas claros.
        gray: {
          100: "rgb(var(--gray-100-rgb) / <alpha-value>)",
          200: "rgb(var(--gray-200-rgb) / <alpha-value>)",
          300: "rgb(var(--gray-300-rgb) / <alpha-value>)",
        },
        neon: {
          // Marca Blanca: green/cyan/magenta son variables CSS override-ables
          // en runtime (BrandTheme re-pinta botones y acentos con colorAcento).
          green: "var(--neon-green, #00ff88)",
          cyan: "var(--neon-cyan, #00d4ff)",
          magenta: "var(--neon-magenta, #ff0080)",
          yellow: "var(--neon-yellow, #ffee00)",
          red: "var(--neon-red, #ff3366)",
          purple: "var(--neon-purple, #b44bff)",
        },
        muted: "rgb(var(--muted-rgb) / <alpha-value>)",
      },
      boxShadow: {
        // Sombras por variable: los temas claros los anulan en globals.css.
        card: "var(--shadow-card)",
        neon: "var(--shadow-neon)",
        "neon-cyan": "var(--shadow-neon-cyan)",
        "neon-magenta": "var(--shadow-neon-magenta)",
        glow: "var(--shadow-glow)",
        "neon-glow": "var(--shadow-neon-glow)",
        "neon-inset": "var(--shadow-neon-inset)",
      },
      animation: {
        "pulse-neon": "pulseNeon 2s ease-in-out infinite",
        "slide-up": "slideUp 0.3s ease-out",
        "slide-down": "slideDown 0.3s ease-out",
        "bounce-subtle": "bounceSubtle 0.4s ease-out",
        "fade-in": "fadeIn 0.25s ease-out",
        "shake-x": "shakeX 0.4s ease-in-out",
      },
      keyframes: {
        pulseNeon: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
        slideUp: {
          "0%": { transform: "translateY(12px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        slideDown: {
          "0%": { transform: "translateY(-12px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        bounceSubtle: {
          "0%": { transform: "scale(1)" },
          "40%": { transform: "scale(1.06)" },
          "100%": { transform: "scale(1)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        shakeX: {
          "0%, 100%": { transform: "translateX(0)" },
          "20%": { transform: "translateX(-6px)" },
          "40%": { transform: "translateX(6px)" },
          "60%": { transform: "translateX(-4px)" },
          "80%": { transform: "translateX(4px)" },
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;