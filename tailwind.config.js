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
        accent: "#3b82f6", // Blue for actions
        background: "#f0fdf4", // Very light green tint
        foreground: "#064e3b", // Dark green text
        muted: "#94a3b8",
        card: { foreground: "#064e3b" },
      },
      boxShadow: {
        'soft': '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
        'glow': '0 0 15px rgba(4, 120, 87, 0.1)',
      }
    },
  },
  plugins: [],
}
