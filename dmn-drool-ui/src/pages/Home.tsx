import { useState } from "react";
import { RuleForm } from "../components/RuleForm/RuleForm";
import { RuleList } from "../components/RuleList/RuleList";

interface Props {
  schemaReady: boolean;
  onCreate: (ruleId: string) => void;
  onOpen: (ruleId: string) => void;
  onExecute: () => void;
}

export function Home({ schemaReady, onCreate, onOpen, onExecute }: Props) {
  const [panel, setPanel] = useState<"none" | "create" | "list">("none");

  return (
    <main className="page">
      <div className="home-actions">
        <button className="primary" disabled={!schemaReady} onClick={() => setPanel("create")}>
          Create Rule
        </button>
        <button onClick={() => setPanel("list")}>View / Modify Rules</button>
        <button disabled={!schemaReady} onClick={onExecute}>
          Execute Rule
        </button>
      </div>

      {panel === "create" && <RuleForm onCreate={onCreate} onCancel={() => setPanel("none")} />}
      {panel === "list" && (
        <section className="card">
          <h2>Registered rules</h2>
          <RuleList onSelect={onOpen} />
        </section>
      )}
    </main>
  );
}
