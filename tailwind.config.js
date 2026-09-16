/** @type {import('tailwindcss').Config} */

// WeaselPlex "Prismatic Ink". Keep these in step with constants/Colors.ts -
// that file is the source of truth for anything styled from JS rather than
// from a className.
module.exports = {
  darkMode: "class",
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          canvas: "#05070b",
          bg: "#070A10",
          surface: "#0D1422",
          raised: "#10182A",
          border: "#1F2737",
          separator: "#141D30",
          text: "#F5F7FC",
          body: "#B8C4D8",
          muted: "#8FA2BD",
          label: "#CDD7EA",
        },
        prism: {
          red: "#FF3B30",
          orange: "#FF8A00",
          yellow: "#FFD600",
          green: "#16E36F",
          cyan: "#00C0FF",
          blue: "#3265FF",
          violet: "#8A2BEF",
          magenta: "#FF2EC8",
        },
        tint: {
          cyan: "#7FE3FF",
          violet: "#C89BFF",
          magenta: "#FF9BE4",
          green: "#8CF5BE",
          yellow: "#FFE86B",
        },
      },
    },
  },
  plugins: [],
};
