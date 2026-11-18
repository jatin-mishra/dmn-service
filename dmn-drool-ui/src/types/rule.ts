/** GET /rules */
export interface RuleListResponse {
  ruleIds: string[];
}

/** GET /rules/{ruleId} — body is DMN XML, version comes from the X-Rule-Version header. */
export interface RuleXml {
  ruleId: string;
  xml: string;
  version: number | null;
}

/** PUT /rules/{ruleId} */
export interface PublishResponse {
  ruleId: string;
  version: number;
}

/** POST /rules/{ruleId}/evaluate — body is DMN inputs keyed by Input Data node name. */
export type EvaluateRequest = Record<string, unknown>;

export interface EvaluateResponse {
  ruleId: string;
  version: number;
  hasErrors: boolean;
  decisions: Record<string, unknown>;
  messages: string[];
}

/** Error bodies: 404 { error }, 400 { error: "DMN compile failed", details: string[] } */
export interface ApiErrorBody {
  error: string;
  details?: string[];
}
