import { useCallback, useEffect, useRef, useState } from "react";
import * as DmnEditor from "@kie-tools/kie-editors-standalone/dist/dmn";
import { ensureXsltProcessor } from "../dmn/xsltPolyfill";

type EditorInstance = ReturnType<typeof DmnEditor.open>;

/**
 * Rule ID -> live Apache KIE DMN editor instance.
 * Temporary browser state only; the XML saved in the backend is the persistent state.
 */
const editors = new Map<string, EditorInstance>();

/**
 * Opens an independent DMN editor for one rule inside `containerRef` and disposes it
 * when the rule changes or the component unmounts. `initialXml === null` means "not loaded yet".
 */
export function useDmnEditor(ruleId: string, initialXml: string | null) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || initialXml === null) return;

    editors.get(ruleId)?.close(); // never two instances for the same rule
    setIsDirty(false);
    setError(null);

    const editor = DmnEditor.open({
      container,
      initialContent: Promise.resolve(initialXml),
      readOnly: false, // the library defaults to read-only
      onError: () => setError("The DMN editor could not load this model."),
    });
    editors.set(ruleId, editor);
    const onChange = editor.subscribeToContentChanges(setIsDirty);

    return () => {
      editor.unsubscribeToContentChanges(onChange);
      editor.close(); // removes the editor iframe and its message listener
      if (editors.get(ruleId) === editor) editors.delete(ruleId);
    };
  }, [ruleId, initialXml]);

  /** Latest DMN XML from this rule's editor instance. */
  const getXml = useCallback(() => {
    const editor = editors.get(ruleId);
    if (!editor) return Promise.reject(new Error(`No open editor for rule '${ruleId}'`));
    ensureXsltProcessor(containerRef.current?.querySelector("iframe") ?? null); // getContent() needs it
    return editor.getContent();
  }, [ruleId]);

  const markSaved = useCallback(() => editors.get(ruleId)?.markAsSaved(), [ruleId]);

  return { containerRef, isDirty, error, getXml, markSaved };
}
