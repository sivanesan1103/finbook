/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Dark navy sidebar + Khatabook-red accents
        navy: { 900: '#0b1727', 800: '#12233a', 700: '#1a3050' },
        brand: { 50: '#fdeced', 100: '#fad4d6', 500: '#e0393e', 600: '#c92f34', 700: '#a92428' },
        // Blue reserved for links/info accents (Khatabook uses it sparingly)
        link: { 50: '#e8f0fe', 500: '#2f6fed', 600: '#1d5cd6' },
        give: '#1b873f',
        get: '#c62828',
      },
    },
  },
  plugins: [],
};
