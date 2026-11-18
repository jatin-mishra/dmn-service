import { useMemo, useState, type FormEvent } from "react";
import type { JsonSchema } from "../../types/schema";

/**
 * Input form built from the backend's rule-input schema (GET /schema).
 * Form state mirrors the schema shape; primitives are kept as raw input strings
 * and converted to JSON types only when the payload is built.
 */
type FormValue = string | FormValue[] | { [field: string]: FormValue };
type FormObject = { [field: string]: FormValue };

interface Props {
  schema: JsonSchema;
  /** Input Data node the rule reads the form data from; the request body is keyed by it. */
  inputDataName: string;
  submitting: boolean;
  onSubmit: (payload: Record<string, unknown>) => void;
}

export function ExecutionForm({ schema, inputDataName, submitting, onSubmit }: Props) {
  const [value, setValue] = useState<FormValue>(() => initialValue(schema));
  // Exact Evaluate request body: { "<Input Data name>": <form data> }
  const payload = useMemo(() => ({ [inputDataName]: toPayload(schema, value) ?? {} }), [schema, value, inputDataName]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(payload);
  };

  return (
    <form className="execution-form" onSubmit={submit}>
      <ObjectFields schema={schema} value={value as FormObject} onChange={setValue} />
      <details>
        <summary>Request body</summary>
        <pre>{JSON.stringify(payload, null, 2)}</pre>
      </details>
      <div className="actions">
        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? "Evaluating…" : "Evaluate"}
        </button>
        <button type="button" onClick={() => setValue(initialValue(schema))}>
          Reset
        </button>
      </div>
    </form>
  );
}

function ObjectFields({ schema, value, onChange }: { schema: JsonSchema; value: FormObject; onChange: (v: FormObject) => void }) {
  return (
    <>
      {Object.entries(schema.properties ?? {}).map(([field, fieldSchema]) => (
        <Field
          key={field}
          name={field}
          schema={fieldSchema}
          required={schema.required?.includes(field) ?? false}
          value={value[field]}
          onChange={(v) => onChange({ ...value, [field]: v })}
        />
      ))}
    </>
  );
}

interface FieldProps {
  name: string;
  schema: JsonSchema;
  required: boolean;
  value: FormValue;
  onChange: (v: FormValue) => void;
}

function Field({ name, schema, required, value, onChange }: FieldProps) {
  const label = (
    <span className="field-name" title={schema.description}>
      {name}
      {required && <span className="required">*</span>}
    </span>
  );

  if (schema.type === "object") {
    return (
      <fieldset>
        <legend>{label}</legend>
        <ObjectFields schema={schema} value={value as FormObject} onChange={onChange} />
      </fieldset>
    );
  }

  if (schema.type === "array") {
    const items = value as FormValue[];
    const itemSchema = schema.items ?? { type: "string" };
    const isObjectList = itemSchema.type === "object";
    const setItem = (i: number, v: FormValue) => onChange(items.map((old, j) => (j === i ? v : old)));
    return (
      <fieldset>
        <legend>
          {label} <span className="hint">list</span>
        </legend>
        {items.map((item, i) => (
          <div key={i} className={isObjectList ? "list-item object" : "list-item"}>
            {isObjectList ? (
              <div className="list-item-body">
                <div className="list-item-title">
                  {name} #{i + 1}
                </div>
                <ObjectFields schema={itemSchema} value={item as FormObject} onChange={(v) => setItem(i, v)} />
              </div>
            ) : (
              <PrimitiveInput schema={itemSchema} required value={item as string} onChange={(v) => setItem(i, v)} />
            )}
            <button type="button" className="remove" onClick={() => onChange(items.filter((_, j) => j !== i))} title="Remove">
              Remove
            </button>
          </div>
        ))}
        <button type="button" onClick={() => onChange([...items, initialValue(itemSchema)])}>
          + Add {isObjectList ? "item" : "value"}
        </button>
      </fieldset>
    );
  }

  return (
    <label className="field">
      {label}
      <PrimitiveInput schema={schema} required={required} value={value as string} onChange={onChange} />
    </label>
  );
}

function PrimitiveInput({ schema, required, value, onChange }: { schema: JsonSchema; required: boolean; value: string; onChange: (v: string) => void }) {
  if (schema.enum || schema.type === "boolean") {
    const options = schema.enum ?? ["true", "false"];
    return (
      <select value={value} required={required} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (schema.type === "number" || schema.type === "integer") {
    return (
      <input
        type="number"
        step={schema.type === "integer" ? 1 : "any"}
        min={schema.minimum}
        max={schema.maximum}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <input
      type={schema.format === "date" ? "date" : "text"}
      required={required}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Empty form state; lists of objects start with one entry, lists of primitives start empty. */
function initialValue(schema: JsonSchema): FormValue {
  if (schema.type === "object") {
    return Object.fromEntries(Object.entries(schema.properties ?? {}).map(([k, s]) => [k, initialValue(s)]));
  }
  if (schema.type === "array") {
    return schema.items?.type === "object" ? [initialValue(schema.items)] : [];
  }
  return "";
}

/** Converts form state to the JSON the backend expects; empty optional values are left out. */
function toPayload(schema: JsonSchema, value: FormValue): unknown {
  if (schema.type === "object") {
    const obj = value as FormObject;
    const entries = Object.entries(schema.properties ?? {})
      .map(([k, s]) => [k, toPayload(s, obj[k])] as const)
      .filter(([, v]) => v !== undefined);
    return entries.length ? Object.fromEntries(entries) : undefined;
  }
  if (schema.type === "array") {
    const list = (value as FormValue[])
      .map((item) => toPayload(schema.items ?? { type: "string" }, item))
      .filter((v) => v !== undefined);
    return list.length ? list : undefined;
  }
  const raw = value as string;
  if (raw === "") return undefined;
  if (schema.type === "number" || schema.type === "integer") return Number(raw);
  if (schema.type === "boolean") return raw === "true";
  return raw;
}
