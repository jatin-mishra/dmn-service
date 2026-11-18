import { useEffect, useState } from "react";
import { DmnEditor } from "../components/DmnEditor/DmnEditor";
import { useDmnEditor } from "../hooks/useDmnEditor";
import { instantiateTemplate, type DmnTemplate } from "../dmn/schemaToDmn";
import { getRuleXml, publishRule } from "../services/ruleService";
import { ApiError } from "../services/api";
import { missingDrgElements } from "../dmn/drgElements";

interface Props {
  ruleId: string;
  isNew: boolean;
  template: DmnTemplate | null;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

type Status = { kind: "info" | "success" | "error"; text: string; details?: string[] } | null;

export function Editor({ ruleId, isNew, template, onClose, onDirtyChange }: Props) {
  const [initialXml, setInitialXml] = useState<string | null>(null);
  const [savedXml, setSavedXml] = useState<string | null>(null); // last XML the backend holds
  const [version, setVersion] = useState<number | null>(null);
  const [published, setPublished] = useState(!isNew);
  const [publishing, setPublishing] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const { containerRef, isDirty, error: editorError, getXml, markSaved } = useDmnEditor(ruleId, initialXml);

  // New rule: a fresh copy of the schema template. Existing rule: the XML saved in the backend.
  useEffect(() => {
    setInitialXml(null);
    if (isNew) {
      if (template) setInitialXml(instantiateTemplate(template.xml, ruleId));
      else setStatus({ kind: "error", text: "Schema template is not available; cannot create a rule." });
      return;
    }
    setStatus({ kind: "info", text: "Loading rule…" });
    getRuleXml(ruleId).then(
      (rule) => {
        setVersion(rule.version);
        setSavedXml(rule.xml);
        setInitialXml(rule.xml);
        setStatus(null);
      },
      (e: Error) => setStatus({ kind: "error", text: `Could not load rule: ${e.message}` }),
    );
  }, [ruleId, isNew, template]);

  const unsaved = isDirty || !published;
  useEffect(() => onDirtyChange(unsaved), [unsaved, onDirtyChange]);

  const publish = async () => {
    setPublishing(true);
    setStatus({ kind: "info", text: "Publishing…" });
    try {
      const xml = await getXml();
      const missing = savedXml ? missingDrgElements(savedXml, xml) : [];
      if (
        missing.length > 0 &&
        !window.confirm(`These nodes from the saved model are not in the editor's model: ${missing.join(", ")}.\nPublish anyway?`)
      ) {
        setStatus({ kind: "info", text: `Publish cancelled. Missing nodes: ${missing.join(", ")}` });
        return;
      }
      const res = await publishRule(ruleId, xml);
      // Only now has the backend confirmed it compiled and stored the rule.
      markSaved();
      setPublished(true);
      setSavedXml(xml);
      setVersion(res.version);
      setStatus({ kind: "success", text: `Published '${res.ruleId}' as version ${res.version}.` });
    } catch (e) {
      const details = e instanceof ApiError ? e.details : [];
      setStatus({ kind: "error", text: `Publish failed: ${(e as Error).message}`, details });
    } finally {
      setPublishing(false);
    }
  };

  const close = () => {
    if (unsaved && !window.confirm("You have unpublished changes. Leave the editor and discard them?")) return;
    onClose();
  };

  return (
    <div className="editor-page">
      <header className="editor-bar">
        <button onClick={close}>← Back</button>
        <div className="rule-meta">
          <strong>{ruleId}</strong>
          <span>Rule ID: {ruleId}</span>
          <span>{version !== null ? `Version ${version}` : "Not published"}</span>
          {unsaved && <span className="unsaved">● Unsaved changes</span>}
        </div>
        <button className="primary" onClick={publish} disabled={publishing || initialXml === null || !!editorError}>
          {publishing ? "Publishing…" : "Publish"}
        </button>
      </header>
      {(status || editorError) && (
        <div className={`status ${editorError ? "error" : status?.kind}`}>
          {editorError ?? status?.text}
          {status?.details && status.details.length > 0 && (
            <ul>
              {status.details.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <DmnEditor containerRef={containerRef} />
    </div>
  );
}
