const DRG_ELEMENTS = ["inputData", "decision", "businessKnowledgeModel", "knowledgeSource", "decisionService"];

/** Names of the top-level DRG nodes (decisions, inputs, BKMs...) in a DMN XML document. */
export function drgElementNames(xml: string, kinds: string[] = DRG_ELEMENTS): string[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const definitions = doc.documentElement;
  return [...definitions.children]
    .filter((el) => kinds.includes(el.localName))
    .map((el) => el.getAttribute("name") ?? el.getAttribute("id") ?? "?");
}

/** Input Data node names: evaluate expects its JSON body keyed by these. */
export const inputDataNames = (xml: string) => drgElementNames(xml, ["inputData"]);

/**
 * Nodes present in `before` but not in `after`. The classic KIE editor silently drops nodes
 * that have no DMNDI diagram shape (e.g. hand-written XML), so this catches unintended loss.
 */
export function missingDrgElements(before: string, after: string): string[] {
  const kept = new Set(drgElementNames(after));
  return drgElementNames(before).filter((name) => !kept.has(name));
}
