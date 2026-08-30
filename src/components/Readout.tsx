import type { ReactNode } from "react";
import shared from "../styles/shared.module.css";
import styles from "./Readout.module.css";

interface ReadoutProps {
  icon: ReactNode;
  label: string;
  value: string;
  accent: string;
  sub?: string;
}

export function Readout({ icon, label, value, accent, sub }: ReadoutProps) {
  return (
    <div className={styles.card}>
      <div className={styles.header}>
        {icon}<span className={shared.eyebrow}>{label}</span>
      </div>
      <div className={styles.value} style={{ color: accent }}>{value}</div>
      {sub && <div className={styles.sub}>{sub}</div>}
    </div>
  );
}
