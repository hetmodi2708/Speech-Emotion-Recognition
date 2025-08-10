/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {},
    screens: {
      "@390": { max: "389px" },
      "@480": { min: "390px", max: "479px" }, // for max-width: 479px
    },
  },
  plugins: [],
};
