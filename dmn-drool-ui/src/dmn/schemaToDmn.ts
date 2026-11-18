import type { JsonSchema } from "../types/schema";

/**
 * Builds the starting DMN model from the backend's rule-input JSON Schema.
 *
 * Output is DMN 1.2 (namespace 20180521) — the version the classic KIE editor writes
 * and the backend's KIE 7.74 runtime compiles (it does not support DMN 1.5).
 *
 * Mapping:
 *   - one Input Data named after schema.title (e.g. "LoanApplication"), typed t<Title>
 *   - object            -> structured itemDefinition (t<Field>)
 *   - object[]          -> itemComponent isCollection="true" typed t<SingularField>
 *   - string[]          -> itemComponent isCollection="true" typed string
 *   - string + enum     -> string with enumeration allowedValues
 *   - string + "date"   -> date
 *   - number / integer  -> number (FEEL has a single number type)
 *   - boolean           -> boolean
 */

const TEMPLATE_NAME = "rule-template";
const TEMPLATE_NS = "https://kiegroup.org/dmn/_rule_template";

export interface DmnTemplate {
  xml: string;
  inputDataName: string;
}

export function buildDmnTemplate(schema: JsonSchema): DmnTemplate {
  const inputDataName = schema.title || "RuleAttribute";
  const itemDefs: string[] = [];
  const usedTypeNames = new Set<string>();

  const uniqueTypeName = (base: string, parentType: string) => {
    let name = `t${pascal(base)}`;
    if (usedTypeNames.has(name)) name = `${parentType}${pascal(base)}`;
    let n = 2;
    while (usedTypeNames.has(name)) name = `${parentType}${pascal(base)}${n++}`;
    usedTypeNames.add(name);
    return name;
  };

  /** Registers a structured itemDefinition for an object schema and returns its name. */
  const defineStructure = (typeName: string, obj: JsonSchema): string => {
    const components = Object.entries(obj.properties ?? {})
      .map(([field, fieldSchema]) => component(typeName, field, fieldSchema))
      .join("\n");
    itemDefs.push(
      `  <dmn:itemDefinition id="${id()}" name="${esc(typeName)}" isCollection="false">\n${components}\n  </dmn:itemDefinition>`,
    );
    return typeName;
  };

  const component = (parentType: string, field: string, s: JsonSchema): string => {
    const isCollection = s.type === "array";
    const element = isCollection ? (s.items ?? { type: "string" }) : s;

    let typeRef: string;
    if (element.type === "object") {
      const base = isCollection ? singular(field) : field;
      typeRef = defineStructure(uniqueTypeName(base, parentType), element);
    } else {
      typeRef = feelType(element);
    }

    const allowed = element.enum?.length
      ? `\n      <dmn:allowedValues kie:constraintType="enumeration" id="${id()}">\n        <dmn:text>${esc(
          element.enum.map((v) => JSON.stringify(v)).join(", "),
        )}</dmn:text>\n      </dmn:allowedValues>`
      : "";

    return `    <dmn:itemComponent id="${id()}" name="${esc(field)}" isCollection="${isCollection}">\n      <dmn:typeRef>${esc(
      typeRef,
    )}</dmn:typeRef>${allowed}\n    </dmn:itemComponent>`;
  };

  const rootType = uniqueTypeName(inputDataName, "");
  defineStructure(rootType, schema);

  const inputId = id();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<dmn:definitions xmlns:dmn="http://www.omg.org/spec/DMN/20180521/MODEL/"
                 xmlns="${TEMPLATE_NS}"
                 xmlns:feel="http://www.omg.org/spec/DMN/20180521/FEEL/"
                 xmlns:kie="http://www.drools.org/kie/dmn/1.2"
                 xmlns:dmndi="http://www.omg.org/spec/DMN/20180521/DMNDI/"
                 xmlns:di="http://www.omg.org/spec/DMN/20180521/DI/"
                 xmlns:dc="http://www.omg.org/spec/DMN/20180521/DC/"
                 id="${id()}"
                 name="${TEMPLATE_NAME}"
                 typeLanguage="http://www.omg.org/spec/DMN/20180521/FEEL/"
                 namespace="${TEMPLATE_NS}">
  <dmn:extensionElements/>
${itemDefs.join("\n")}
  <dmn:inputData id="${inputId}" name="${esc(inputDataName)}">
    <dmn:extensionElements/>
    <dmn:variable id="${id()}" name="${esc(inputDataName)}" typeRef="${esc(rootType)}"/>
  </dmn:inputData>
  <dmndi:DMNDI>
    <dmndi:DMNDiagram id="${id()}" name="DRG">
      <di:extension>
        <kie:ComponentsWidthsExtension/>
      </di:extension>
      <dmndi:DMNShape id="dmnshape-drg-${inputId}" dmnElementRef="${inputId}" isCollapsed="false">
        <dmndi:DMNStyle>
          <dmndi:FillColor red="255" green="255" blue="255"/>
          <dmndi:StrokeColor red="0" green="0" blue="0"/>
          <dmndi:FontColor red="0" green="0" blue="0"/>
        </dmndi:DMNStyle>
        <dc:Bounds x="100" y="300" width="180" height="50"/>
        <dmndi:DMNLabel/>
      </dmndi:DMNShape>
    </dmndi:DMNDiagram>
  </dmndi:DMNDI>
</dmn:definitions>
`;
  return { xml, inputDataName };
}

/** Copies the template for a new rule: the model is named after the rule and gets its own namespace. */
export function instantiateTemplate(templateXml: string, ruleId: string): string {
  const ns = `https://kiegroup.org/dmn/_${ruleId.replace(/[^A-Za-z0-9_-]/g, "_")}`;
  return templateXml
    .split(TEMPLATE_NS)
    .join(ns)
    .replace(`name="${TEMPLATE_NAME}"`, `name="${esc(ruleId)}"`);
}

function feelType(s: JsonSchema): string {
  switch (s.type) {
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "string":
      return s.format === "date" ? "date" : "string";
    default:
      return "Any";
  }
}

const id = () => `_${crypto.randomUUID().toUpperCase()}`;

const pascal = (s: string) =>
  s
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("");

const singular = (s: string) => (s.endsWith("ies") ? `${s.slice(0, -3)}y` : s.endsWith("s") ? s.slice(0, -1) : s);

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
