import type { CSSProperties } from "react";
import { Field } from "./Field.js";
import { Toggle } from "./Toggle.js";
import type { Scenario } from "../types.js";
import styles from "./ScenarioCard.module.css";

interface ScenarioCardProps {
  s: Scenario;
  person1Name: string;
  person2Name: string;
  onChange: (field: keyof Scenario, value: number | boolean) => void;
}

export function ScenarioCard({ s, person1Name, person2Name, onChange }: ScenarioCardProps) {
  return (
    <div>
      <div className={styles.toggleRow}>
        <Toggle label={s.label} icon={<span className={styles.dot} style={{ "--dot-color": s.color } as CSSProperties} />}
          checked={s.enabled} onChange={(v) => onChange("enabled", v)} accent={s.color} />
      </div>
      <div className={styles.grid}>
        <div>
          <div className={styles.personLabel}>{person1Name}</div>
          <div className={styles.fields}>
            <Field label="Downshift in" value={s.year1} onChange={(v) => onChange("year1", v)} min={0} max={30} step={1} suffix=" yrs" disabled={!s.enabled} />
            <Field label="Income after" value={s.incomePct1} onChange={(v) => onChange("incomePct1", v)} min={0} max={100} step={5} suffix="%" disabled={!s.enabled} />
            <Field label="Retire fully in" value={s.retireYear1} onChange={(v) => onChange("retireYear1", v)} min={0} max={45} step={1} suffix=" yrs" disabled={!s.enabled} />
          </div>
        </div>
        <div>
          <div className={styles.personLabel}>{person2Name}</div>
          <div className={styles.fields}>
            <Field label="Downshift in" value={s.year2} onChange={(v) => onChange("year2", v)} min={0} max={30} step={1} suffix=" yrs" disabled={!s.enabled} />
            <Field label="Income after" value={s.incomePct2} onChange={(v) => onChange("incomePct2", v)} min={0} max={100} step={5} suffix="%" disabled={!s.enabled} />
            <Field label="Retire fully in" value={s.retireYear2} onChange={(v) => onChange("retireYear2", v)} min={0} max={45} step={1} suffix=" yrs" disabled={!s.enabled} />
          </div>
        </div>
      </div>
    </div>
  );
}
