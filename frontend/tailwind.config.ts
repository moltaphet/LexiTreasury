import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "Menlo", "monospace"],
      },
      colors: {
        cyber: {
          bg: "#020617",
          card: "#0f172a",
          border: "#1e293b",
          muted: "#334155",
          text: "#94a3b8",
        },
      },
      boxShadow: {
        glow: "0 0 20px rgba(34,211,238,0.15)",
        "glow-sm": "0 0 8px rgba(34,211,238,0.10)",
      },
      animation: {
        pulse: "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
