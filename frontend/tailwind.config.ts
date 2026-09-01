import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        fc: {
          navy: "#0a0e1a",
          charcoal: "#121826",
          card: "#1a2235",
          gold: "#f5c518",
          green: "#00e676",
          accent: "#00d4ff",
          muted: "#8892a4",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 20px rgba(245, 197, 24, 0.3)",
        "glow-green": "0 0 20px rgba(0, 230, 118, 0.3)",
        "glow-accent": "0 0 20px rgba(0, 212, 255, 0.25)",
        card: "0 8px 32px rgba(0, 0, 0, 0.35)",
      },
      animation: {
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        ticker: "ticker 40s linear infinite",
        "pulse-live": "pulse-live 2s ease-in-out infinite",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 10px rgba(245, 197, 24, 0.2)" },
          "50%": { boxShadow: "0 0 25px rgba(245, 197, 24, 0.5)" },
        },
        ticker: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "pulse-live": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
