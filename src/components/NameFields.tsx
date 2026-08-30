import shared from "../styles/shared.module.css";
import styles from "./NameFields.module.css";

interface NameFieldsProps {
  person1Name: string;
  person2Name: string;
  onChangePerson1Name: (value: string) => void;
  onChangePerson2Name: (value: string) => void;
}

export function NameFields({ person1Name, person2Name, onChangePerson1Name, onChangePerson2Name }: NameFieldsProps) {
  return (
    <div className={styles.row}>
      <label className={styles.field}>
        <span className={shared.eyebrow}>Person 1 name</span>
        <input
          type="text"
          value={person1Name}
          onChange={(e) => onChangePerson1Name(e.target.value)}
          className={styles.input}
          placeholder="Person 1"
        />
      </label>
      <label className={styles.field}>
        <span className={shared.eyebrow}>Person 2 name</span>
        <input
          type="text"
          value={person2Name}
          onChange={(e) => onChangePerson2Name(e.target.value)}
          className={styles.input}
          placeholder="Person 2"
        />
      </label>
    </div>
  );
}
