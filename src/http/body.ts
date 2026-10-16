import { STATUS_CODE, API_CODE, CONTENT_TYPE, HEADER } from '../config/http';
import { SERVICE_MESSAGE } from '../config/messages';
import { AppError } from '../app/errors';
import { traceError } from '../infra/trace';

/** JSON 本文を読む。Content-Type が JSON でなければ 415、解析できなければ 400 で拒否する。 */
export async function readJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get(HEADER.CONTENT_TYPE) ?? '';
  if (!contentType.toLowerCase().startsWith(CONTENT_TYPE.JSON_MEDIA_TYPE)) {
    throw new AppError(
      STATUS_CODE.UNSUPPORTED_MEDIA_TYPE,
      API_CODE.UNSUPPORTED_MEDIA_TYPE,
      SERVICE_MESSAGE.UNSUPPORTED_MEDIA_TYPE,
    );
  }
  const text = await request.text();
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    // 解析エラーの詳細は応答に含めず、ログにだけ残す。
    traceError('http.invalid_json_detail', error, { length: text.length });
    throw new AppError(STATUS_CODE.BAD_REQUEST, API_CODE.INVALID_JSON, SERVICE_MESSAGE.INVALID_JSON);
  }
}
