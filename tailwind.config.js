/** @type {import('tailwindcss').Config} */

// WeaselPlex "Neon Board". Keep these in step with constants/Colors.ts -
// that file is the source of truth for anything styled from JS rather than
// from a className.
module.exports = {
  darkMode: "class",
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        stage: "#050608",
        video: "#000000",
        card: "#0B0D12",
        card2: "#11141B",
        inset: "#08090D",
        line: "#1C2029",
        line2: "#2A303B",
        text: "#F2F5F9",
        mid: "#8B95A5",
        low: "#6B7686",
        onaccent: "#050608",
        volt: "#D4F63F",
        green: "#39FF14",
        cyan: "#00F0FF",
        orange: "#FF7A00",
        yellow: "#FFD400",
        red: "#FF3B4E",
        warn: "#F5B93D",
        blue: "#5268FF",
        mint: "#00FF8A",
        violet: "#C026FF",
        magenta: "#FF2EF7",
        pink: "#FF2D95",
        azure: "#00A3FF",
        indigo: "#8A5CFF",
      },
      fontFamily: {
        display: ["BarlowCondensed-ExtraBold"],
        displaybold: ["BarlowCondensed-Bold"],
        body: ["Barlow-Regular"],
        bodymed: ["Barlow-Medium"],
        bodysemi: ["Barlow-SemiBold"],
        bodybold: ["Barlow-Bold"],
      },
    },
    // The `text-*` steps, ~20 % over NativeWind's 14px-rem defaults, in step
    // with the enlarged type scale in constants/neon.ts.
    fontSize: {
      xs: ["13px", { lineHeight: "17px" }],
      sm: ["15px", { lineHeight: "20px" }],
      base: ["17px", { lineHeight: "23px" }],
      lg: ["19px", { lineHeight: "25px" }],
      xl: ["21px", { lineHeight: "27px" }],
      "2xl": ["25px", { lineHeight: "30px" }],
      "3xl": ["32px", { lineHeight: "36px" }],
      "4xl": ["38px", { lineHeight: "42px" }],
      "5xl": ["50px", { lineHeight: "54px" }],
    },
    // Zero radius on everything except people avatars and the switch knob:
    // `rounded`, `rounded-lg`, `rounded-xl`, `rounded-2xl` all resolve to 0.
    borderRadius: {
      none: "0",
      DEFAULT: "0",
      sm: "0",
      md: "0",
      lg: "0",
      xl: "0",
      "2xl": "0",
      "3xl": "0",
      full: "9999px",
    },
  },
  plugins: [],
};
