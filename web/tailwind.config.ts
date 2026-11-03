import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["IBM Plex Sans", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
      colors: {
        ink: "#16181D",
        surface: "#F5F6F3",
        card: "#FFFFFF",
        border: "#DADDE2",
        muted: "#5B616B",
        subtle: "#4A5059",
        faint: "#8A9099",
        line2: "#C9CDD4",
        accent: "#2B5FB8",
        ok: "#1F7A4D",
        okbg: "#E3F0E9",
        warn: "#C2410C",
        warnbg: "#FBEFE8",
        brand: "#5B2A9D",
      },
    },
  },
  plugins: [],
};
export default config;
