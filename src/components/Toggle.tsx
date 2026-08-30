import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { colors } from "../lib/colors.js";
import { Hint } from "./Hint.js";
import styles from "./Toggle.module.css";

interface ToggleProps {
  label: string;
  icon: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  accent?: string;
  hint?: string;
}

export function Toggle({ label, icon, checked, onChange, accent = colors.amber, hint }: ToggleProps) {
  const vars = {
    "--toggle-border": checked ? accent : colors.panelBorder,
    "--toggle-bg": checked ? `${accent}1a` : "transparent",
    "--toggle-color": checked ? accent : colors.subtext,
  } as CSSProperties;

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onChange(!checked);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onChange(!checked)}
      onKeyDown={handleKeyDown}
      className={styles.toggle}
      style={vars}
    >
      {icon}
      <span>
        <span>{label}</span>
        {hint && <Hint text={hint} />}
      </span>
      <span className={styles.state}>{checked ? "ON" : "OFF"}</span>
    </div>
  );
}
