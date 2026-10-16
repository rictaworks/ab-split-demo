import { CACHE_POLICY, CORS, HEADER, QUERY, STATUS_CODE } from '../config/http';
import type { ExperimentService } from '../services/experiment-service';
import { jsonResponse } from './responses';
import { readJsonBody } from './body';

/** 計測 API の共通ヘッダ（全オリジン許可、Cookie は使わない）。 */
export const CORS_HEADERS: Record<string, string> = {
  [HEADER.CORS_ORIGIN]: CORS.ALLOW_ORIGIN,
  [HEADER.CORS_METHODS]: CORS.ALLOW_METHODS,
  [HEADER.CORS_HEADERS]: CORS.ALLOW_HEADERS,
  [HEADER.CORS_MAX_AGE]: String(CORS.MAX_AGE_SECONDS),
};

export async function assignVariant(
  service: ExperimentService,
  publicKey: string,
  url: URL,
): Promise<Response> {
  const result = await service.assignVisitor(publicKey, url.searchParams.get(QUERY.VISITOR_ID));
  return jsonResponse(STATUS_CODE.OK, result, { [HEADER.CACHE_CONTROL]: CACHE_POLICY.NO_STORE });
}

export async function recordConversion(
  service: ExperimentService,
  publicKey: string,
  request: Request,
): Promise<Response> {
  const body = await readJsonBody(request);
  const ok = await service.convertVisitor(publicKey, body);
  return jsonResponse(STATUS_CODE.OK, { ok });
}

export function preflight(): Response {
  return new Response(null, { status: CORS.PREFLIGHT_STATUS, headers: CORS_HEADERS });
}
