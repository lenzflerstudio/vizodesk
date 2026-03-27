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
    },
  },
  plugins: [],
}
