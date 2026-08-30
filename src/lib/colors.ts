import type { CSSProperties } from "react";

export const colors = {
  bg: "#0B1220",
  panel: "#121B2E",
  panelBorder: "rgba(255,255,255,0.08)",
  grid: "rgba(255,255,255,0.07)",
  text: "#E8ECF3",
  subtext: "#8593AD",
  amber: "#D8A34C",
  coral: "#C97064",
  mint: "#6FA98A",
  steel: "#6E9BD1",
  violet: "#9B87C4",
};

export const eyebrow: CSSProperties = {
  fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase",
  color: colors.subtext, fontFamily: "'Space Grotesk', sans-serif",
};
