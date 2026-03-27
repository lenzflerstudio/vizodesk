/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#c026d3', light: '#e040fb', dark: '#9c27b0' },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'portal-card': '0 0 0 1px rgba(255,255,255,0.06) inset, 0 24px 80px -32px rgba(0,0,0,0.75)',
      },
    }
  },
  plugins: [],
}
