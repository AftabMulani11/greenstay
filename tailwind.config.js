/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', 'sans-serif'],
      },
      colors: {
        // Nature-inspired palette
        primary: { DEFAULT: "#047857", foreground: "#ffffff" }, // Emerald 700
        primaryLight: "#d1fae5", // Emerald 100
        secondary: { DEFAULT: "#ffffff", foreground: "#1e293b" },
        accent: { DEFAULT: "#3b82f6", foreground: "#ffffff" }, // Blue for actions
        background: "#f0fdf4", // Very light green tint
        foreground: "#064e3b", // Dark green text
        muted: { DEFAULT: "#94a3b8", foreground: "#ffffff" },
        border: "#e2e8f0",
        card: { DEFAULT: "#ffffff", foreground: "#064e3b" },
        danger: "#ef4444",
      },
      boxShadow: {
        'soft': '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
        'glow': '0 0 15px rgba(4, 120, 87, 0.1)',
      }
    },
  },
  plugins: [],
}