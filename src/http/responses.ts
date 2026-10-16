import { API_CODE, CONTENT_TYPE, HEADER, SECURITY_HEADERS, STATUS_CODE } from '../config/http';
import { SERVICE_MESSAGE } from '../config/messages';
import { AppError } from '../app/errors';
import { DomainCoreError, ValidationError } from '../core/errors';
import { traceError } from '../infra/trace';

export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { [HEADER.CONTENT_TYPE]: CONTENT_TYPE.JSON, ...headers },
  });
}

export function htmlResponse(status: number, html: string, headers: Record<string, string> = {}): Response {
  return new Response(html, {
    status,
    headers: { [HEADER.CONTENT_TYPE]: CONTENT_TYPE.HTML, ...headers },
  });
}

export function errorJson(status: number, code: string, message: string): Response {
  return jsonResponse(status, { error: { code, message } });
}

/** 例外を HTTP 応答に写す。業務例外は明示的な 4xx、想定外は 500 とし、どちらも文脈をログに残す。 */
export function toErrorResponse(error: unknown, path: string): Response {
  if (error instanceof AppError) {
    traceError('http.app_error', error, { path, code: error.code, status: error.status });
    return errorJson(error.status, error.code, error.message);
  }
  if (error instanceof ValidationError) {
    traceError('http.validation_error', error, { path });
    return errorJson(STATUS_CODE.BAD_REQUEST, API_CODE.VALIDATION_FAILED, error.message);
  }
  if (error instanceof DomainCoreError) {
    traceError('http.domain_error', error, { path });
    return errorJson(STATUS_CODE.INTERNAL_ERROR, API_CODE.INTERNAL_ERROR, SERVICE_MESSAGE.INTERNAL_ERROR);
  }
  traceError('http.unexpected_error', error, { path });
  return errorJson(STATUS_CODE.INTERNAL_ERROR, API_CODE.INTERNAL_ERROR, SERVICE_MESSAGE.INTERNAL_ERROR);
}

/** 全応答に共通のセキュリティヘッダを付ける。 */
export function withSecurityHeaders(response: Response): Response {
  response.headers.set(HEADER.FRAME_OPTIONS, SECURITY_HEADERS.FRAME_OPTIONS);
  response.headers.set(HEADER.CONTENT_TYPE_OPTIONS, SECURITY_HEADERS.CONTENT_TYPE_OPTIONS);
  response.headers.set(HEADER.REFERRER_POLICY, SECURITY_HEADERS.REFERRER_POLICY);
  return response;
}
