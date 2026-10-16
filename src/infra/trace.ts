/** 構造化ログ。デバッグで追跡できるよう、イベント名と文脈を JSON 1 行で出す。 */
export function trace(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...fields }));
}

export function traceError(event: string, error: unknown, fields: Record<string, unknown>): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  console.error(JSON.stringify({ event, message, stack, ...fields }));
}
