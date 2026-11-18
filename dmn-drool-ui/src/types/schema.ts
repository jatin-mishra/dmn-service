/** Subset of JSON Schema draft-07 that GET /schema actually uses. */
export interface JsonSchema {
  $schema?: string;
  $id?: string;
  title?: string;
  description?: string;
  type?: "object" | "array" | "string" | "number" | "integer" | "boolean";
  format?: string; // "date" | "double"
  enum?: string[];
  minimum?: number;
  maximum?: number;
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
}
