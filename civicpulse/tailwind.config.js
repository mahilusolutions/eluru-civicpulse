/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './public/index.html'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        eluru: {
          navy: '#0F1B2D',
          blue: '#1D4E89',
          sky: '#2F6FED',
          gold: '#F0B429',
          mist: '#F4F6F9',
          ink: '#0F1B2D',
          soft: '#5B6B7C',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 22px 50px rgba(15, 27, 45, 0.14)',
        glow: '0 14px 28px rgba(29, 78, 137, 0.28)',
      },
      animation: {
        'fade-up': 'fadeUp 0.7s ease-out both',
        'fade-up-delay': 'fadeUp 0.7s ease-out 0.1s both',
        drift: 'drift 20s ease-in-out infinite alternate',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        drift: {
          '0%': { transform: 'scale(1.03) translate3d(0,0,0)' },
          '100%': { transform: 'scale(1.07) translate3d(-1.2%,0.8%,0)' },
        },
      },
    },
  },
  plugins: [],
};
