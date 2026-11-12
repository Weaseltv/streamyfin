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
        volt: "#C6FF00",
        green: "#3DFF6E",
        cyan: "#00E5FF",
        orange: "#FF5200",
        yellow: "#FFE600",
        red: "#FF2A3D",
        warn: "#F5B93D",
        movie: "#00B8D9",
        show: "#E8112D",
        home: "#0B8A42",
        search: "#0A2CFF",
        watchlist: "#FF5200",
        requests: "#009A93",
        collections: "#FFD300",
        standup: "#5A00FF",
        sports: "#FF0099",
        settings: "#EAF2FF",
        library: "#7B4DFF",
      },
      fontFamily: {
        display: ["Audiowide-Regular"],
        body: ["Exo2-Regular"],
        bodymed: ["Exo2-Medium"],
        bodysemi: ["Exo2-SemiBold"],
        bodybold: ["Exo2-Bold"],
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
