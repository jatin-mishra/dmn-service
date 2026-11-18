import { useCallback, useEffect, useState } from "react";
import { Home } from "./pages/Home";
import { Editor } from "./pages/Editor";
import { Execute } from "./pages/Execute";
import { getSchema } from "./services/ruleService";
import { buildDmnTemplate, type DmnTemplate } from "./dmn/schemaToDmn";
import type { JsonSchema } from "./types/schema";

type View = { name: "home" } | { name: "editor"; ruleId: string; isNew: boolean } | { name: "execute" };

export function App() {
  const [view, setView] = useState<View>({ name: "home" });
  const [schema, setSchema] = useState<JsonSchema | null>(null);
  const [template, setTemplate] = useState<DmnTemplate | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // On start: fetch the rule-input schema and build the DMN template every new rule starts from.
  const loadSchema = useCallback(() => {
    setSchemaError(null);
    getSchema().then(
      (s) => {
        setSchema(s);
        setTemplate(buildDmnTemplate(s));
      },
      (e: Error) => setSchemaError(e.message),
    );
  }, []);
  useEffect(loadSchema, [loadSchema]);

  // Browser refresh / tab close with unpublished editor changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const goHome = () => {
    setDirty(false);
    setView({ name: "home" });
  };

  if (view.name === "editor") {
    return (
      <Editor
        key={view.ruleId}
        ruleId={view.ruleId}
        isNew={view.isNew}
        template={template}
        onClose={goHome}
        onDirtyChange={setDirty}
      />
    );
  }

  return (
    <>
      <header className="app-header">
        <h1>DMN Rules</h1>
        {!schema && !schemaError && <span className="status">Loading schema…</span>}
        {schemaError && (
          <span className="status error">
            Schema unavailable: {schemaError} <button onClick={loadSchema}>Retry</button>
          </span>
        )}
      </header>
      {view.name === "execute" && schema ? (
        <Execute schema={schema} onBack={goHome} />
      ) : (
        <Home
          schemaReady={!!template}
          onCreate={(ruleId) => setView({ name: "editor", ruleId, isNew: true })}
          onOpen={(ruleId) => setView({ name: "editor", ruleId, isNew: false })}
          onExecute={() => setView({ name: "execute" })}
        />
      )}
    </>
  );
}
