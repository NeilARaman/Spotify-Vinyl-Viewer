
import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        player: {
          bg: "#FFFFFF",
          dark: "#000000",
          accent: "#0EA5E9",
        },
        vinyl: {
          DEFAULT: "#1A1A1A",
          groove: "#2A2A2A",
        },
      },
      fontFamily: {
        playfair: ["Playfair Display", "serif"],
        inter: ["Inter", "sans-serif"],
      },
      keyframes: {
        spinRecord: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        armMove: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(25deg)" },
        },
      },
      animation: {
        "spin-slow": "spinRecord 4s linear infinite",
        "fade-in": "fadeIn 0.5s ease-out",
        "arm-move": "armMove 1s ease-out forwards",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
