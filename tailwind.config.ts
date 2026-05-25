import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: "rgb(var(--app-accent-rgb) / <alpha-value>)",
          dark: "rgb(var(--app-accent-dark-rgb) / <alpha-value>)",
          light: "rgb(var(--app-accent-light-rgb) / <alpha-value>)",
          text: "rgb(var(--app-accent-text-rgb) / <alpha-value>)",
          soft: "rgb(var(--app-accent-soft-rgb) / <alpha-value>)",
          border: "rgb(var(--app-accent-border-rgb) / <alpha-value>)",
          ring: "rgb(var(--app-accent-ring-rgb) / <alpha-value>)"
        }
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"]
      },
      boxShadow: {
        soft: "0 10px 30px rgba(15, 23, 42, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
