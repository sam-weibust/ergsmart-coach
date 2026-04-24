/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './screens/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1B3A6B',
          50: '#E8EDF5',
          100: '#C6D2E8',
          200: '#9DB4D5',
          300: '#7496C3',
          400: '#4B78B0',
          500: '#1B3A6B',
          600: '#163060',
          700: '#102554',
          800: '#0B1A49',
          900: '#060F3E',
        },
        accent: {
          DEFAULT: '#D4AF37',
          50: '#FBF5E0',
          100: '#F5E7B3',
          200: '#EDD984',
          300: '#E5CB55',
          400: '#DCBE44',
          500: '#D4AF37',
          600: '#B8952B',
          700: '#9C7B1F',
          800: '#806113',
          900: '#644807',
        },
        navy: '#1B3A6B',
        gold: '#D4AF37',
        surface: '#F8F9FA',
        border: '#E5E7EB',
      },
      fontFamily: {
        sans: ['System'],
      },
    },
  },
  plugins: [],
};
