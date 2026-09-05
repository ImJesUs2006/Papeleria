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
        surface: {
          950: "#050505",
          900: "#0a0a0a",
          800: "#111111",
          700: "#1a1a1a",
          600: "#242424",
          500: "#2e2e2e",
          400: "#3a3a3a",
        },
        neon: {
          green: "#00ff88",
          cyan: "#00d4ff",
          magenta: "#ff0080",
          yellow: "#ffee00",
          red: "#ff3366",
          purple: "#b44bff",
        },
        muted: "#9ca3af",
      },
      boxShadow: {
        neon: "0 0 20px rgba(0, 255, 136, 0.35)",
        "neon-cyan": "0 0 20px rgba(0, 212, 255, 0.35)",
        "neon-magenta": "0 0 20px rgba(255, 0, 128, 0.35)",
        glow: "0 0 40px rgba(0, 255, 136, 0.25)",
        "neon-glow": "0 0 60px rgba(0, 255, 136, 0.12)",
        "neon-inset": "inset 0 0 20px rgba(0, 255, 136, 0.08)",
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