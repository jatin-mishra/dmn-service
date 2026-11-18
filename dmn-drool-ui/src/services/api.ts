import type { ApiErrorBody } from "../types/rule";

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
  }
}

/** fetch wrapper: throws ApiError with the backend's { error, details } on non-2xx. */
export async function request(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, init);
  } catch (e) {
    throw new ApiError(0, `Backend unreachable at ${BASE_URL}: ${(e as Error).message}`);
  }
  if (res.ok) return res;

  const text = await res.text();
  try {
    const body = JSON.parse(text) as ApiErrorBody;
    throw new ApiError(res.status, body.error ?? text, body.details ?? []);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(res.status, text || `HTTP ${res.status}`);
  }
}
