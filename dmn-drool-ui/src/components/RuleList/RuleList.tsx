import { useEffect, useState } from "react";
import { listRules } from "../../services/ruleService";

interface Props {
  onSelect: (ruleId: string) => void;
  selected?: string;
}

/** Rules registered in the backend (GET /rules). */
export function RuleList({ onSelect, selected }: Props) {
  const [ruleIds, setRuleIds] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setRuleIds(null);
    setError(null);
    listRules().then(setRuleIds, (e: Error) => setError(e.message));
  };
  useEffect(load, []);

  if (error)
    return (
      <p className="status error">
        Could not load rules: {error} <button onClick={load}>Retry</button>
      </p>
    );
  if (!ruleIds) return <p className="status">Loading rules…</p>;
  if (ruleIds.length === 0) return <p className="status">No rules registered yet. Create one first.</p>;

  return (
    <ul className="rule-list">
      {ruleIds.map((id) => (
        <li key={id}>
          <button className={id === selected ? "selected" : ""} onClick={() => onSelect(id)}>
            {id}
          </button>
        </li>
      ))}
    </ul>
  );
}
