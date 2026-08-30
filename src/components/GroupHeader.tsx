import type { ReactNode } from "react";
import shared from "../styles/shared.module.css";
import styles from "./GroupHeader.module.css";

interface GroupHeaderProps {
  icon: ReactNode;
  children: ReactNode;
}

export function GroupHeader({ icon, children }: GroupHeaderProps) {
  return <div className={`${styles.header} ${shared.eyebrow}`}>{icon}{children}</div>;
}
