import { useState } from "react";
import { RuleList } from "../components/RuleList/RuleList";
import { ExecutionForm } from "../components/ExecutionForm/ExecutionForm";
import { evaluateRule, getRuleXml } from "../services/ruleService";
import { inputDataNames } from "../dmn/drgElements";
import type { JsonSchema } from "../types/schema";
import type { EvaluateResponse } from "../types/rule";

interface Props {
  schema: JsonSchema;
  onBack: () => void;
}

export function Execute({ schema, onBack }: Props) {
  const [ruleId, setRuleId] = useState<string | null>(null);
  // Input Data nodes of the selected rule, read from its saved DMN (null while loading).
  const [ruleInputs, setRuleInputs] = useState<string[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<EvaluateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectRule = (id: string) => {
    setRuleId(id);
    setRuleInputs(null);
    setResult(null);
    setError(null);
    getRuleXml(id).then(
      (rule) => setRuleInputs(inputDataNames(rule.xml)),
      (e: Error) => setError(`Could not load rule: ${e.message}`),
    );
  };

  const evaluate = async (body: Record<string, unknown>) => {
    if (!ruleId) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      setResult(await evaluateRule(ruleId, body));
    } catch (e) {
      setError(`Evaluation failed: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page">
      <button onClick={onBack}>← Back</button>
      <section className="card">
        <h2>1. Select a rule</h2>
        <RuleList selected={ruleId ?? undefined} onSelect={selectRule} />
      </section>
      {ruleId && ruleInputs === null && !error && <p className="status">Loading rule inputs…</p>}
      {ruleId && ruleInputs?.length === 1 && (
        <section className="card">
          <h2>
            2. Input for <code>{ruleId}</code> ({ruleInputs[0]})
          </h2>
          <ExecutionForm schema={schema} inputDataName={ruleInputs[0]} submitting={submitting} onSubmit={evaluate} />
        </section>
      )}
      {ruleId && ruleInputs && ruleInputs.length !== 1 && (
        <p className="status error">
          Rule <code>{ruleId}</code> has {ruleInputs.length} Input Data nodes ({ruleInputs.join(", ") || "none"}). The
          form fills one Input Data node typed from the schema, so this rule can't be run from here.
        </p>
      )}
      {error && <p className="status error">{error}</p>}
      {result && (
        <section className="card">
          <h2>Result</h2>
          <p className={`status ${result.hasErrors ? "error" : "success"}`}>
            {result.ruleId} v{result.version}: {result.hasErrors ? "evaluated with errors" : "evaluated successfully"}
          </p>
          <h3>Decisions</h3>
          <pre>{JSON.stringify(result.decisions, null, 2)}</pre>
          {result.messages.length > 0 && (
            <>
              <h3>Messages</h3>
              <ul>
                {result.messages.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </main>
  );
}
