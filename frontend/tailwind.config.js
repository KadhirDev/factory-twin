/** @type {import('tailwindcss').Config} */
export default {
  // CRITICAL: these paths tell Tailwind JIT which files to scan for class names.
  // If this array is wrong/empty → zero CSS classes generated → layout collapses.
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}