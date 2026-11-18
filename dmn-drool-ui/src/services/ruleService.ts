import { request } from "./api";
import type { JsonSchema } from "../types/schema";
import type { EvaluateRequest, EvaluateResponse, PublishResponse, RuleListResponse, RuleXml } from "../types/rule";

const rulePath = (ruleId: string) => `/rules/${encodeURIComponent(ruleId)}`;

export async function getSchema(): Promise<JsonSchema> {
  return (await request("/schema")).json();
}

export async function listRules(): Promise<string[]> {
  const body: RuleListResponse = await (await request("/rules")).json();
  return body.ruleIds;
}

export async function getRuleXml(ruleId: string): Promise<RuleXml> {
  const res = await request(rulePath(ruleId), { headers: { Accept: "application/xml" } });
  const version = res.headers.get("X-Rule-Version");
  return { ruleId, xml: await res.text(), version: version ? Number(version) : null };
}

export async function publishRule(ruleId: string, dmnXml: string): Promise<PublishResponse> {
  const res = await request(rulePath(ruleId), {
    method: "PUT",
    headers: { "Content-Type": "application/xml" },
    body: dmnXml,
  });
  return res.json();
}

export async function evaluateRule(ruleId: string, inputs: EvaluateRequest): Promise<EvaluateResponse> {
  const res = await request(`${rulePath(ruleId)}/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(inputs),
  });
  return res.json();
}
