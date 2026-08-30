import React from "react";
import shared from "../styles/shared.module.css";
import styles from "./Field.module.css";
import { Hint } from "./Hint.js";

interface FieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  prefix?: string;
  suffix?: string;
  disabled?: boolean;
  hint?: string;
}

export function Field({ label, value, onChange, min, max, step, prefix = "", suffix = "", disabled, hint }: FieldProps) {
  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === "" || raw === "-") { onChange(0); return; }
    const num = Number(raw);
    if (!Number.isNaN(num)) onChange(num);
  };
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const num = Number(e.target.value);
    const clamped = Number.isNaN(num) ? min : Math.min(max, Math.max(min, num));
    onChange(clamped);
  };
  const width = `${Math.max(String(value).length, 2) + 2}ch`;

  return (
    <div className={styles.wrap} data-disabled={disabled || undefined}>
      <div className={styles.labelRow}>
        <span>
          <span className={shared.eyebrow}>{label}</span>
          {hint && <Hint text={hint} />}
        </span>
        <div className={styles.valueRow}>
          {prefix && <span>{prefix}</span>}
          <input
            type="number"
            inputMode="decimal"
            value={value}
            step={step}
            disabled={disabled}
            onChange={handleTextChange}
            onBlur={handleBlur}
            className={styles.valueInput}
            style={{ width }}
          />
          {suffix && <span>{suffix}</span>}
        </div>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value} disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className={styles.range}
      />
    </div>
  );
}
