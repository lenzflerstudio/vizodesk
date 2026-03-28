/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#c026d3',
          light: '#e040fb',
          dark: '#9c27b0',
        },
        surface: {
          DEFAULT: '#0b0b0f',
          raised: '#16161d',
          overlay: '#1e1e28',
          border: '#2a2a38',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'portal-card': '0 0 0 1px rgba(255,255,255,0.06) inset, 0 24px 80px -32px rgba(0,0,0,0.75)',
      },
    },
  },
  plugins: [],
}
