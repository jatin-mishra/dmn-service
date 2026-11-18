import { useState, type FormEvent } from "react";
import { listRules } from "../../services/ruleService";

// The rule name is the backend ruleId (a URL path segment), so keep it to a safe slug.
const RULE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

interface Props {
  onCreate: (ruleId: string) => void;
  onCancel: () => void;
}

/** Asks for the new rule's name before any editor is opened. */
export function RuleForm({ onCreate, onCancel }: Props) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ruleId = name.trim();
    if (!RULE_ID_PATTERN.test(ruleId)) {
      setError("Use letters, digits, '-' or '_' (must start with a letter or digit).");
      return;
    }
    setChecking(true);
    setError(null);
    try {
      // Publishing to an existing id would overwrite that rule, so refuse it here.
      if ((await listRules()).includes(ruleId)) {
        setError(`Rule '${ruleId}' already exists. Open it from View / Modify Rules.`);
        return;
      }
      onCreate(ruleId);
    } catch (err) {
      setError(`Could not check existing rules: ${(err as Error).message}`);
    } finally {
      setChecking(false);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <label>
        Rule name (used as Rule ID)
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. stamp-duty-v2" />
      </label>
      {error && <p className="status error">{error}</p>}
      <div className="actions">
        <button type="submit" className="primary" disabled={checking || !name.trim()}>
          {checking ? "Checking…" : "Create"}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
