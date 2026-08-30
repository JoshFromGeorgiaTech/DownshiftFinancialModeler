import type { CSSProperties, ReactNode } from "react";
import { colors } from "../lib/colors.js";
import styles from "./Toggle.module.css";

interface ToggleProps {
  label: string;
  icon: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  accent?: string;
}

export function Toggle({ label, icon, checked, onChange, accent = colors.amber }: ToggleProps) {
  const vars = {
    "--toggle-border": checked ? accent : colors.panelBorder,
    "--toggle-bg": checked ? `${accent}1a` : "transparent",
    "--toggle-color": checked ? accent : colors.subtext,
  } as CSSProperties;

  return (
    <button onClick={() => onChange(!checked)} className={styles.toggle} style={vars}>
      {icon}<span>{label}</span>
      <span className={styles.state}>{checked ? "ON" : "OFF"}</span>
    </button>
  );
}
